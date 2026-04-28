"""Chat (RAG chat) — HTTP API. Every endpoint requires X-User-Sub (injected
by the gateway after JWT verification). Thread-scoped endpoints 404 when
thread.user_sub does not match, to avoid leaking existence."""
from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID, uuid4

import structlog
from fastapi import APIRouter, Header, Response
from pydantic import BaseModel, Field

from substrate_common import ConflictError, NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.graph import chat_pipeline, chat_store, store
from src.graph.chat_context_resolver import _parse_entry

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat")

# Active streaming tasks keyed on the assistant message_id so the cancel
# endpoint can find the right Task to .cancel(). The dict also holds a
# strong reference (preventing CPython GC from silently dropping in-flight
# tasks). Entries are removed on task done via add_done_callback below.
_streaming_tasks: dict[str, asyncio.Task] = {}


class ThreadCreate(BaseModel):
    title: str | None = None


class ThreadRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessagePost(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    sync_ids: list[str] = Field(default_factory=list)
    graph_context: dict[str, Any] | None = None


class EntriesPayload(BaseModel):
    entries: list[dict]


class ThreadContextResponse(BaseModel):
    entries: list[dict]
    frozen_at: str | None


@router.get("/threads")
async def list_threads(
    archived: bool = False,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    return {"items": await chat_store.list_threads(sub, archived=archived)}


@router.post("/threads")
async def create_thread(
    body: ThreadCreate, x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    title = (body.title or "New thread").strip()[:200] or "New thread"
    return await chat_store.create_thread(sub, title)


@router.patch("/threads/{thread_id}")
async def rename_thread(
    thread_id: UUID, body: ThreadRename,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    row = await chat_store.rename_thread(sub, thread_id, body.title.strip()[:200])
    if not row:
        raise NotFoundError("thread not found")
    return row


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: UUID, x_user_sub: str | None = Header(default=None),
) -> Response:
    sub = require_user_sub_strict(x_user_sub)
    ok = await chat_store.delete_thread(sub, thread_id)
    if not ok:
        raise NotFoundError("thread not found")
    return Response(status_code=204)


@router.get("/threads/{thread_id}/messages")
async def list_messages(
    thread_id: UUID, x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    return {"items": await chat_store.list_messages(thread_id)}


@router.post("/threads/{thread_id}/messages", status_code=202)
async def post_message(
    thread_id: UUID, body: MessagePost,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    if not body.sync_ids:
        raise ValidationError("sync_ids required")

    # Freeze thread context on first message send so context entries are
    # immutable for the lifetime of the conversation. Single atomic UPDATE
    # guards against TOCTOU race when two requests arrive concurrently.
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE chat_threads
               SET context = jsonb_set(context, '{frozen_at}', to_jsonb(now()::text))
             WHERE id = $1
               AND (context->>'frozen_at') IS NULL
            """,
            thread_id,
        )

    user_msg = await chat_store.insert_message(
        thread_id=thread_id, role="user",
        content=body.content, citations=[], sync_ids=body.sync_ids,
    )

    prior = await chat_store.list_messages(thread_id)
    prior_turns = [m for m in prior if m["id"] != user_msg["id"]]

    # Mint the assistant_id here (not inside stream_turn) so we can
    # return it to the client; the client uses this id to cancel
    # mid-stream via DELETE /api/chat/streams/{message_id}.
    assistant_id = uuid4()
    key = str(assistant_id)
    t = asyncio.create_task(chat_pipeline.stream_turn(
        thread_id=thread_id,
        user_content=body.content,
        sync_ids=body.sync_ids,
        graph_context=body.graph_context,
        user_sub=sub,
        prior_turns=prior_turns,
        assistant_id=assistant_id,
    ))
    _streaming_tasks[key] = t
    t.add_done_callback(lambda _t: _streaming_tasks.pop(key, None))

    return {
        "user_message": user_msg,
        "assistant_message_id": key,
        "status": "streaming",
    }


@router.delete("/streams/{assistant_id}", status_code=204)
async def cancel_stream(
    assistant_id: UUID, x_user_sub: str | None = Header(default=None),
) -> Response:
    """Cancel an in-flight assistant turn. The streaming coroutine
    catches asyncio.CancelledError, publishes a CHAT_TURN_FAILED event
    with reason "cancelled", and exits — the frontend reducer then
    clears its streamingTurn slice and re-enables the composer."""
    require_user_sub_strict(x_user_sub)
    task = _streaming_tasks.get(str(assistant_id))
    if task is None or task.done():
        # 204 either way — caller's intent (no longer streaming) is met.
        return Response(status_code=204)
    task.cancel()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Entries (V12 context shape)
# ---------------------------------------------------------------------------


@router.get("/threads/{thread_id}/entries", response_model=ThreadContextResponse)
async def get_entries(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> ThreadContextResponse:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT context FROM chat_threads WHERE id = $1 AND user_sub = $2",
            thread_id, sub,
        )
    if row is None:
        raise NotFoundError("thread_not_found")
    ctx = row["context"] or {}
    return ThreadContextResponse(
        entries=ctx.get("entries", []),
        frozen_at=ctx.get("frozen_at"),
    )


@router.put("/threads/{thread_id}/entries", response_model=ThreadContextResponse)
async def put_entries(
    thread_id: UUID,
    payload: EntriesPayload,
    x_user_sub: str | None = Header(default=None),
) -> ThreadContextResponse:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT context FROM chat_threads WHERE id = $1 AND user_sub = $2",
            thread_id, sub,
        )
        if row is None:
            raise NotFoundError("thread_not_found")
        ctx = row["context"] or {}
        if ctx.get("frozen_at"):
            raise ConflictError("thread context is frozen")

        # Validate every entry shape before persisting.
        for raw in payload.entries:
            try:
                _parse_entry(raw)
            except Exception as exc:
                raise ValidationError(f"invalid entry: {exc}")

        new_context = {"entries": payload.entries, "frozen_at": None}
        await conn.execute(
            "UPDATE chat_threads SET context = $1 WHERE id = $2",
            new_context, thread_id,
        )
    return ThreadContextResponse(entries=payload.entries, frozen_at=None)


# ---------------------------------------------------------------------------
# Per-thread archive / unarchive
# ---------------------------------------------------------------------------


@router.post("/threads/{thread_id}/archive")
async def archive_thread(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE chat_threads SET archived_at = NOW() "
            "WHERE id = $1 AND user_sub = $2",
            thread_id, sub,
        )
    return {"ok": True}


@router.post("/threads/{thread_id}/unarchive")
async def unarchive_thread(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE chat_threads SET archived_at = NULL "
            "WHERE id = $1 AND user_sub = $2",
            thread_id, sub,
        )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Context picker endpoints — read from ingested data only
# ---------------------------------------------------------------------------


@router.get("/picker/sources")
async def list_picker_sources(
    x_user_sub: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    user_sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    rows = await pool.fetch(
        """
        SELECT DISTINCT s.id, s.name
          FROM sources s
          JOIN sync_runs sr ON sr.source_id = s.id
          JOIN file_embeddings fe ON fe.sync_id = sr.id
         WHERE s.user_sub = $1
         ORDER BY s.name
        """,
        user_sub,
    )
    return [{"source_id": str(r["id"]), "name": r["name"]} for r in rows]


@router.get("/picker/snapshots")
async def list_picker_snapshots(
    source_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    user_sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    rows = await pool.fetch(
        """
        SELECT DISTINCT sr.id, sr.created_at
          FROM sync_runs sr
          JOIN sources s ON s.id = sr.source_id
         WHERE sr.source_id = $1 AND s.user_sub = $2
         ORDER BY sr.created_at DESC
        """,
        source_id, user_sub,
    )
    return [{"sync_id": str(r["id"]), "created_at": r["created_at"].isoformat()} for r in rows]


@router.get("/picker/directories")
async def list_picker_directories(
    sync_id: UUID,
    parent: str = "",
    x_user_sub: str | None = Header(default=None),
) -> list[str]:
    require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    depth = (parent.count("/") + 1) if parent else 1
    rows = await pool.fetch(
        f"""
        SELECT DISTINCT split_part(file_path, '/', {depth}) AS segment
          FROM file_embeddings
         WHERE sync_id = $1 AND file_path LIKE $2 || '%'
           AND split_part(file_path, '/', {depth}) <> ''
         ORDER BY segment
        """,
        sync_id, parent,
    )
    return [r["segment"] for r in rows]


@router.get("/picker/files")
async def list_picker_files(
    sync_id: UUID,
    prefix: str = "",
    q: str = "",
    x_user_sub: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    rows = await pool.fetch(
        """
        SELECT id, file_path, language, size_bytes
          FROM file_embeddings
         WHERE sync_id = $1
           AND file_path LIKE $2 || '%'
           AND file_path ILIKE '%' || $3 || '%'
         ORDER BY file_path
         LIMIT 1000
        """,
        sync_id, prefix, q,
    )
    return [
        {"file_id": str(r["id"]), "path": r["file_path"],
         "language": r["language"], "size_bytes": r["size_bytes"]}
        for r in rows
    ]


@router.get("/picker/communities")
async def list_picker_communities(
    sync_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    user_sub = require_user_sub_strict(x_user_sub)
    from src.graph import community as community_mod
    from src.graph.leiden_config import LeidenConfig
    result = await community_mod.get_or_compute(
        [str(sync_id)], LeidenConfig(), user_sub=user_sub,
    )
    return [
        {
            "cache_key": result.cache_key,
            "community_index": c.index,
            "label": c.label or f"c-{c.index}",
            "size": c.size,
        }
        for c in result.communities
    ]


@router.get("/picker/nodes")
async def list_picker_nodes(
    sync_id: UUID,
    q: str = "",
    x_user_sub: str | None = Header(default=None),
) -> list[dict[str, Any]]:
    require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    rows = await pool.fetch(
        """
        SELECT id, file_path FROM file_embeddings
         WHERE sync_id = $1 AND file_path ILIKE '%' || $2 || '%'
         ORDER BY file_path LIMIT 200
        """,
        sync_id, q,
    )
    return [{"node_id": str(r["id"]), "path": r["file_path"]} for r in rows]
