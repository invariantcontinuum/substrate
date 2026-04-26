"""Chat — edit / regenerate / context / evidence routes.

These extend the canonical /api/chat surface with the four turn-lifecycle
endpoints carried by Phase 7 of the MVP-finalize plan:

* ``POST /api/chat/messages/edit``       — replace a user turn.
* ``POST /api/chat/messages/regenerate`` — re-run an assistant reply.
* ``GET /api/chat/messages/{id}/context``  — fetch the persisted
                                              chat_message_context row.
* ``GET /api/chat/messages/{id}/evidence`` — fetch the cite_evidence
                                              tool-call rows.

Authorization: chat_messages does NOT carry user_sub (it inherits scope
via chat_threads). Every read/write joins back to chat_threads.user_sub
to enforce ownership without leaking the existence of foreign rows
(404 on mismatch, never 403).

Edit / regenerate share the same downstream pipeline as the live POST
turn: they mint an assistant_id upfront, kick off ``stream_turn`` via
``asyncio.create_task`` (fire-and-forget), and return a 202 envelope
identical to ``POST /api/chat/threads/{id}/messages`` so the frontend
reducer can attach to the new SSE turn without a code-path fork.
"""
from __future__ import annotations

import asyncio
import json
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.api.chat import _streaming_tasks
from src.config import settings
from src.graph import chat_pipeline, chat_store, store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat/messages", tags=["chat"])


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------


class _EditBody(BaseModel):
    """A user-turn replacement request. ``content`` is the new prompt the
    user has typed in place of the original; the original message id is
    captured by the path-less route via the body so the same handler can
    serve copy/edit and inline-edit flows from the same wire shape."""

    message_id: UUID
    content: str = Field(min_length=1, max_length=8000)


class _RegenBody(BaseModel):
    """A regenerate request. ``message_id`` is the user-turn whose reply
    should be re-rolled — we follow the convention that "regenerate"
    targets the user-turn the assistant was answering, not the assistant
    turn itself, because the user typically clicks "regenerate" on the
    assistant bubble but the prompt-of-record lives one row earlier."""

    message_id: UUID


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _fetch_user_message(message_id: UUID, user_sub: str) -> dict | None:
    """Return ``{id, thread_id, role, content, created_at, sync_ids}``
    for the user-owned message, or ``None`` when not found.

    The JOIN to chat_threads is the authorization boundary — without it
    a forged ``message_id`` could leak any other user's turns."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT cm.id, cm.thread_id, cm.role, cm.content,
                   cm.created_at, cm.sync_ids
              FROM chat_messages cm
              JOIN chat_threads ct ON ct.id = cm.thread_id
             WHERE cm.id = $1 AND ct.user_sub = $2
            """,
            message_id, user_sub,
        )
    return dict(row) if row else None


def _kick_off_stream_turn(
    *,
    thread_id: UUID,
    user_content: str,
    sync_ids: list[str],
    user_sub: str,
    prior_turns: list[dict],
    assistant_id: UUID,
) -> None:
    """Schedule ``stream_turn`` exactly the way ``POST /threads/{id}/messages``
    does: an asyncio task with a strong reference held in
    ``_streaming_tasks`` keyed on the assistant_id so the cancel endpoint
    can find it. Identical task lifecycle keeps the SSE event sequence
    interchangeable with the live-turn path."""
    key = str(assistant_id)
    task = asyncio.create_task(chat_pipeline.stream_turn(
        thread_id=thread_id,
        user_content=user_content,
        sync_ids=sync_ids,
        graph_context=None,
        user_sub=user_sub,
        prior_turns=prior_turns,
        assistant_id=assistant_id,
    ))
    _streaming_tasks[key] = task
    task.add_done_callback(lambda _t: _streaming_tasks.pop(key, None))


# ---------------------------------------------------------------------------
# POST /api/chat/messages/edit
# ---------------------------------------------------------------------------


@router.post("/edit", status_code=202)
async def edit_message(
    body: _EditBody, x_user_sub: str | None = Header(default=None),
) -> dict:
    """Replace a user-turn with a new prompt and kick off a fresh assistant
    reply. The original user-turn AND every downstream message
    (assistant reply, follow-up turns) are marked superseded by the new
    user-turn so the UI can collapse the old branch behind a "show
    previous version" affordance.

    Returns the 202 envelope used by the live-turn path so the frontend
    reducer can route the new ``assistant_message_id`` straight into the
    streaming-turn slice.
    """
    user_sub = require_user_sub_strict(x_user_sub)
    row = await _fetch_user_message(body.message_id, user_sub)
    if not row or row["role"] != "user":
        # "user message not found" applies equally to (a) row missing,
        # (b) row exists but belongs to another user, (c) row exists but
        # is an assistant turn — collapsing the three preserves privacy.
        raise NotFoundError("user message not found")

    pool = store.get_pool()

    # ── Phase 1: insert the new user-turn first so its id can be the
    #    superseded_by target for the original + downstream rows. The FK
    #    on chat_messages.superseded_by mandates an existing row, so we
    #    can't pre-allocate a placeholder — the new row must land before
    #    the UPDATE. The transaction wraps both writes so a half-edit
    #    can never leak. ──
    new_user_msg_id: UUID = uuid4()
    sync_ids_raw = row.get("sync_ids") or []
    if isinstance(sync_ids_raw, str):
        sync_ids_raw = json.loads(sync_ids_raw)
    sync_ids: list[str] = [str(s) for s in sync_ids_raw]

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                """
                INSERT INTO chat_messages
                    (id, thread_id, role, content, citations, sync_ids,
                     supersedes)
                VALUES ($1, $2, 'user', $3, '[]'::jsonb, $4::jsonb, $5)
                """,
                new_user_msg_id, row["thread_id"], body.content,
                sync_ids, body.message_id,
            )
            # Mark the original + every newer message on the same thread
            # as superseded by the new user-turn — but never the new row
            # we just inserted, hence the explicit id-not-equal guard.
            await conn.execute(
                """
                UPDATE chat_messages
                   SET superseded_by = $1
                 WHERE thread_id = $2
                   AND id <> $1
                   AND created_at >= $3
                   AND superseded_by IS NULL
                """,
                new_user_msg_id, row["thread_id"], row["created_at"],
            )

    # ── Phase 2: build prior_turns from active history older than the
    #    original user-turn (the new one's history starts where the
    #    original's did) and kick off the assistant stream. ──
    prior_turns = await chat_store.list_active_messages_before(
        row["thread_id"], row["created_at"],
    )
    assistant_id = uuid4()
    _kick_off_stream_turn(
        thread_id=row["thread_id"],
        user_content=body.content,
        sync_ids=sync_ids,
        user_sub=user_sub,
        prior_turns=prior_turns,
        assistant_id=assistant_id,
    )

    return {
        "user_message_id": str(new_user_msg_id),
        "assistant_message_id": str(assistant_id),
        "supersedes": str(body.message_id),
        "status": "streaming",
    }


# ---------------------------------------------------------------------------
# POST /api/chat/messages/regenerate
# ---------------------------------------------------------------------------


@router.post("/regenerate", status_code=202)
async def regenerate_message(
    body: _RegenBody, x_user_sub: str | None = Header(default=None),
) -> dict:
    """Re-run the assistant reply that follows the supplied user-turn.

    Locates the immediate next assistant message on the same thread
    that has not already been superseded; marks it superseded by the
    new (about-to-stream) assistant id, then kicks off ``stream_turn``
    so the new turn lands as a fresh chat_messages row. The user turn
    is NOT touched — only its assistant reply is replaced.
    """
    user_sub = require_user_sub_strict(x_user_sub)
    row = await _fetch_user_message(body.message_id, user_sub)
    if not row:
        raise NotFoundError("message not found")
    if row["role"] != "user":
        raise ValidationError("regenerate requires a user-role message id")

    sync_ids_raw = row.get("sync_ids") or []
    if isinstance(sync_ids_raw, str):
        sync_ids_raw = json.loads(sync_ids_raw)
    sync_ids: list[str] = [str(s) for s in sync_ids_raw]

    pool = store.get_pool()
    new_assistant_id: UUID = uuid4()

    async with pool.acquire() as conn:
        # Mark the next active assistant turn (if any) as superseded by
        # the new id we're about to mint. The PK FK on superseded_by
        # forbids referencing a not-yet-inserted id, but stream_turn
        # uses INSERT … RETURNING — there's a window where the FK
        # would reject. We reverse the order: stream_turn inserts the
        # row first, then we patch the supersedes chain after streaming
        # completes. Defer the UPDATE to a post-stream callback by
        # capturing the target row id here.
        target_assistant = await conn.fetchrow(
            """
            SELECT id, created_at FROM chat_messages
             WHERE thread_id = $1
               AND role = 'assistant'
               AND created_at > $2
               AND superseded_by IS NULL
             ORDER BY created_at ASC
             LIMIT 1
            """,
            row["thread_id"], row["created_at"],
        )

    # ``stream_turn`` re-adds ``user_content`` as the final user message via
    # ``_build_prompt``; prior_turns must be the strictly-earlier history
    # so the user-turn isn't duplicated in the LLM messages list.
    prior_turns = await chat_store.list_active_messages_before(
        row["thread_id"], row["created_at"],
    )
    _kick_off_stream_turn(
        thread_id=row["thread_id"],
        user_content=row["content"],
        sync_ids=sync_ids,
        user_sub=user_sub,
        prior_turns=prior_turns,
        assistant_id=new_assistant_id,
    )

    if target_assistant is not None:
        # Patch the supersedes chain once the new assistant row exists.
        # stream_turn writes asynchronously; a brief polling loop with a
        # bounded wait is simpler and safer than wiring a completion
        # hook into the pipeline. The frontend doesn't need this link
        # to render the new turn — it's used only by the "show previous
        # version" affordance.
        asyncio.create_task(_link_supersedes_when_inserted(
            old_assistant_id=target_assistant["id"],
            new_assistant_id=new_assistant_id,
        ))

    return {
        "assistant_message_id": str(new_assistant_id),
        "supersedes": (
            str(target_assistant["id"]) if target_assistant else None
        ),
        "status": "streaming",
    }


async def _link_supersedes_when_inserted(
    *, old_assistant_id: UUID, new_assistant_id: UUID,
) -> None:
    """Wait for the new assistant message to land in chat_messages, then
    UPDATE the old row to point ``superseded_by`` at it.

    Polls every 500ms up to ``settings.chat_regenerate_link_timeout_s``
    seconds. If the stream fails before the row is inserted
    (CHAT_TURN_FAILED path), the link is silently skipped — the old
    row simply remains active, which is the correct user-visible
    outcome.
    """
    pool = store.get_pool()
    deadline = (
        asyncio.get_running_loop().time()
        + settings.chat_regenerate_link_timeout_s
    )
    while True:
        async with pool.acquire() as conn:
            exists = await conn.fetchval(
                "SELECT 1 FROM chat_messages WHERE id = $1", new_assistant_id,
            )
        if exists:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE chat_messages SET superseded_by = $1 "
                    "WHERE id = $2 AND superseded_by IS NULL",
                    new_assistant_id, old_assistant_id,
                )
            return
        if asyncio.get_running_loop().time() > deadline:
            logger.info(
                "regenerate_supersedes_link_timeout",
                old=str(old_assistant_id), new=str(new_assistant_id),
            )
            return
        await asyncio.sleep(0.5)


# ---------------------------------------------------------------------------
# GET /api/chat/messages/{message_id}/context
# ---------------------------------------------------------------------------


@router.get("/{message_id}/context")
async def get_context(
    message_id: UUID, x_user_sub: str | None = Header(default=None),
) -> dict:
    """Return the persisted chat_message_context snapshot for an assistant
    turn. Drives the "what was sent to the LLM for this turn" panel in
    the chat UI. JOINs chat_threads.user_sub to enforce ownership."""
    user_sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT cmc.system_prompt, cmc.history, cmc.files,
                   cmc.tokens_in, cmc.tokens_out, cmc.duration_ms,
                   cmc.created_at
              FROM chat_message_context cmc
              JOIN chat_messages cm ON cm.id = cmc.message_id
              JOIN chat_threads ct  ON ct.id = cm.thread_id
             WHERE cmc.message_id = $1 AND ct.user_sub = $2
            """,
            message_id, user_sub,
        )
    if not row:
        raise NotFoundError("context not found")
    return dict(row)


# ---------------------------------------------------------------------------
# GET /api/chat/messages/{message_id}/evidence
# ---------------------------------------------------------------------------


@router.get("/{message_id}/evidence")
async def get_evidence(
    message_id: UUID, x_user_sub: str | None = Header(default=None),
) -> dict:
    """Return all chat_message_evidence rows for the given assistant turn,
    in insertion order. The UI renders these as a collapsible "Evidence"
    list under the assistant bubble."""
    user_sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT cme.id::text AS id, cme.filepath, cme.start_line,
                   cme.end_line, cme.reason, cme.created_at
              FROM chat_message_evidence cme
              JOIN chat_messages cm ON cm.id = cme.message_id
              JOIN chat_threads ct  ON ct.id = cm.thread_id
             WHERE cme.message_id = $1 AND ct.user_sub = $2
             ORDER BY cme.created_at ASC, cme.id ASC
            """,
            message_id, user_sub,
        )
    return {"evidence": [dict(r) for r in rows]}
