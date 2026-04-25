"""Ask (RAG chat) — HTTP API. Every endpoint requires X-User-Sub (injected
by the gateway after JWT verification). Thread-scoped endpoints 404 when
thread.user_sub does not match, to avoid leaking existence."""
from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Header, Response
from pydantic import BaseModel, Field

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.graph import ask_pipeline, ask_store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/ask")


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
    return {"items": await ask_store.list_threads(sub)}


@router.post("/threads")
async def create_thread(
    body: ThreadCreate, x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    title = (body.title or "New thread").strip()[:200] or "New thread"
    return await ask_store.create_thread(sub, title)


@router.patch("/threads/{thread_id}")
async def rename_thread(
    thread_id: UUID, body: ThreadRename,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    row = await ask_store.rename_thread(sub, thread_id, body.title.strip()[:200])
    if not row:
        raise NotFoundError("thread not found")
    return row


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: UUID, x_user_sub: str | None = Header(default=None),
) -> Response:
    sub = require_user_sub_strict(x_user_sub)
    ok = await ask_store.delete_thread(sub, thread_id)
    if not ok:
        raise NotFoundError("thread not found")
    return Response(status_code=204)


@router.get("/threads/{thread_id}/messages")
async def list_messages(
    thread_id: UUID, x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await ask_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    return {"items": await ask_store.list_messages(thread_id)}


@router.post("/threads/{thread_id}/messages")
async def post_message(
    thread_id: UUID, body: MessagePost,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await ask_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    if not body.sync_ids:
        raise ValidationError("sync_ids required")

    user_msg = await ask_store.insert_message(
        thread_id=thread_id, role="user",
        content=body.content, citations=[], sync_ids=body.sync_ids,
    )

    prior = await ask_store.list_messages(thread_id)
    prior_turns = [m for m in prior if m["id"] != user_msg["id"]]

    turn = await ask_pipeline.run_turn(
        user_sub=sub, user_content=body.content,
        sync_ids=body.sync_ids, prior_turns=prior_turns,
        graph_context=body.graph_context,
    )
    assistant_msg = await ask_store.insert_message(
        thread_id=thread_id, role="assistant",
        content=turn["content"], citations=turn["citations"],
        sync_ids=body.sync_ids,
    )

    derived_title = body.content.strip()[:60]
    await ask_store.touch_thread(thread_id, maybe_title=derived_title)

    return {"user_message": user_msg, "assistant_message": assistant_msg}
