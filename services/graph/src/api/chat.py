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

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.graph import chat_context_store, chat_pipeline, chat_store, store

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


@router.get("/threads")
async def list_threads(x_user_sub: str | None = Header(default=None)) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    return {"items": await chat_store.list_threads(sub)}


@router.post("/threads")
async def create_thread(
    body: ThreadCreate, x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    title = (body.title or "New thread").strip()[:200] or "New thread"
    thread = await chat_store.create_thread(sub, title)

    # Freeze the user's active seed onto this thread. Per spec D-1,
    # threads are independent of settings after creation.
    seed = await chat_context_store.get_active_seed(sub)
    if seed is not None:
        sync_ids = list(seed.get("sync_ids") or [])
        source_ids = list(seed.get("source_ids") or [])
        # Expand source_ids to their child sync_ids at create-time so
        # the frozen scope is the resolved set, not a soft reference.
        if source_ids:
            pool = store.get_pool()
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT id::text AS sync_id
                    FROM sync_runs
                    WHERE source_id = ANY($1::uuid[])
                    """,
                    source_ids,
                )
            extra = [r["sync_id"] for r in rows]
            sync_ids = sorted(set(sync_ids).union(extra))
        if sync_ids or source_ids:
            await chat_context_store.set_thread_context_scope(
                UUID(thread["id"]), sync_ids, source_ids,
            )
    return thread


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
