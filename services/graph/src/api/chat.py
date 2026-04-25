"""Chat (RAG chat) — HTTP API. Every endpoint requires X-User-Sub (injected
by the gateway after JWT verification). Thread-scoped endpoints 404 when
thread.user_sub does not match, to avoid leaking existence."""
from __future__ import annotations

import asyncio
from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Header, Response
from pydantic import BaseModel, Field

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.graph import chat_pipeline, chat_store, chat_context_resolver, chat_context_store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat")


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

    # If this user has applied a chat context in Sources Config, resolve it
    # to the per-file list NOW and freeze a context_summary on the thread.
    # Per spec §4.1: existing threads never retroactively change context;
    # the snapshot is taken once at create-time.
    active = await chat_context_store.get_active(sub)
    if active is not None:
        files = await chat_context_resolver.resolve(active, sub)
        if files:
            thread_uuid = UUID(thread["id"])
            await chat_context_store.insert_thread_context_files(
                thread_uuid, files,
            )
            created_at = thread.get("created_at")
            await chat_context_store.write_context_summary(thread_uuid, {
                **active,
                "resolved_token_total": sum(f["total_tokens"] for f in files),
                "file_count": len(files),
                "created_at": (
                    created_at.isoformat()
                    if hasattr(created_at, "isoformat") else created_at
                ),
            })
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

    asyncio.create_task(chat_pipeline.stream_turn(
        thread_id=thread_id,
        user_message_id=user_msg["id"],
        user_content=body.content,
        sync_ids=body.sync_ids,
        graph_context=body.graph_context,
        user_sub=sub,
        prior_turns=prior_turns,
    ))

    return {"user_message": user_msg, "status": "streaming"}
