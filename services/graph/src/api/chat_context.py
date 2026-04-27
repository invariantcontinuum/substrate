"""Chat-context CRUD: per-user active scope + per-thread file overrides.

Routes:
  GET  /api/chat-context/active                                    → active context
  PUT  /api/chat-context/active                                    → upsert / clear
  GET  /api/chat-context/threads/{id}/context-files                → per-thread files
  PATCH /api/chat-context/threads/{id}/context-files               → toggle inclusion
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

import structlog
from fastapi import APIRouter, Body, Header
from pydantic import BaseModel, Field

from substrate_common import NotFoundError

from src.api.auth import require_user_sub_strict
from src.graph import chat_store, chat_context_store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat-context")


class CommunityRef(BaseModel):
    cache_key: str = Field(min_length=1)
    community_index: int = Field(ge=0)


class ActiveContext(BaseModel):
    """Pre-MVP shape: sync_ids is the canonical scope. Each sync row carries
    its own source_id, so the UI no longer pins to a single source — a chat
    context may span snapshots from multiple sources.

    ``file_ids`` is an OPTIONAL whitelist of ``file_embeddings.id`` values
    that the chat-context budget pill curates. ``None`` / missing means
    "use every file in the active sync set"; a non-empty list restricts
    retrieval to that subset. The empty list means "no files" (the user
    explicitly unchecked everything)."""
    sync_ids: list[str] = Field(default_factory=list)
    community_ids: list[CommunityRef] = Field(default_factory=list)
    file_ids: list[str] | None = None


class ContextFilePatch(BaseModel):
    file_id: str
    included: bool


class ContextFilePatchList(BaseModel):
    updates: list[ContextFilePatch]


@router.get("/active")
async def get_active(
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    return {"active": await chat_context_store.get_active(sub)}


@router.put("/active")
async def put_active(
    body: ActiveContext | None = Body(default=None),
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    payload = body.model_dump() if body is not None else None
    await chat_context_store.set_active(sub, payload)
    return {"active": payload}


def _totals(files: list[dict]) -> dict[str, int]:
    return {
        "file_count": len(files),
        "included_token_total": sum(
            f["total_tokens"] for f in files if f["included"]
        ),
        "all_token_total": sum(f["total_tokens"] for f in files),
    }


@router.get("/threads/{thread_id}/context-files")
async def list_thread_context_files(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    files = await chat_context_store.list_thread_context_files(thread_id)
    return {"files": files, "totals": _totals(files)}


@router.patch("/threads/{thread_id}/context-files")
async def patch_thread_context_files(
    thread_id: UUID,
    body: ContextFilePatchList,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    await chat_context_store.patch_thread_context_files(
        thread_id, [u.model_dump() for u in body.updates],
    )
    files = await chat_context_store.list_thread_context_files(thread_id)
    return {"files": files, "totals": _totals(files)}
