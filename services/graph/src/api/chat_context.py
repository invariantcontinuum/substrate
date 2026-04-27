"""Chat-context REST routes.

Two routers (mounted together by main.py via include_router):

* `/api/chat-context/active` — user-level seed (sources + snapshots).
* `/api/chat/threads/{id}/context*` — per-thread frozen scope +
  current selection plus the supporting list endpoints the pill modal
  reads.
"""
from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

import structlog
from fastapi import APIRouter, Body, Header
from pydantic import BaseModel, ConfigDict, Field

from substrate_common import NotFoundError

from src.api.auth import require_user_sub_strict
from src.graph import chat_context_store, chat_store, store

logger = structlog.get_logger()


# ── Schemas ────────────────────────────────────────────────────────


class ActiveSeed(BaseModel):
    """Per-user default seed: sources and snapshots."""
    sync_ids:   list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class CommunityRef(BaseModel):
    cache_key: str = Field(min_length=1)
    community_index: int = Field(ge=0)


class SelectionAll(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["all"] = "all"


class SelectionFiles(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["files"] = "files"
    file_ids: list[str] = Field(default_factory=list)


class SelectionCommunities(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["communities"] = "communities"
    communities: list[CommunityRef] = Field(default_factory=list)


class SelectionDirectories(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["directories"] = "directories"
    dir_prefixes: list[str] = Field(default_factory=list)


# Discriminated union — incoming selection can be any of the four shapes.
SelectionUnion = (
    SelectionAll | SelectionFiles | SelectionCommunities | SelectionDirectories
)


# ── User-level seed ────────────────────────────────────────────────


user_router = APIRouter(prefix="/api/chat-context")


@user_router.get("/active")
async def get_active(
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    return {"active": await chat_context_store.get_active_seed(sub)}


@user_router.put("/active")
async def put_active(
    body: ActiveSeed | None = Body(default=None),
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    payload = body.model_dump() if body is not None else None
    await chat_context_store.set_active_seed(sub, payload)
    return {"active": payload}


# ── Per-thread context ─────────────────────────────────────────────


thread_router = APIRouter(prefix="/api/chat/threads")


async def _scope_files(thread_id: UUID) -> list[dict]:
    """Resolve the thread's frozen scope to a list of `{file_id, path,
    language, size_bytes}` dicts. Powers the All-files and Directories
    tabs of the pill modal."""
    ctx = await chat_context_store.get_thread_context(thread_id)
    sync_ids = list(ctx.get("scope", {}).get("sync_ids", []))
    if not sync_ids:
        return []
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS file_id, file_path AS path,
                   language, size_bytes
            FROM file_embeddings
            WHERE sync_id = ANY($1::uuid[])
            ORDER BY file_path
            """,
            sync_ids,
        )
    return [dict(r) for r in rows]


@thread_router.get("/{thread_id}/context")
async def get_thread_context(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    ctx = await chat_context_store.get_thread_context(thread_id)
    files = await _scope_files(thread_id)
    return {"context": ctx, "files": files}


@thread_router.put("/{thread_id}/context/selection")
async def put_thread_selection(
    thread_id: UUID,
    body: SelectionUnion,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    selection = body.model_dump()
    await chat_context_store.set_thread_context_selection(thread_id, selection)
    ctx = await chat_context_store.get_thread_context(thread_id)
    return {"context": ctx}


@thread_router.get("/{thread_id}/context/communities")
async def get_thread_communities(
    thread_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    """List communities for the thread's frozen scope.

    Used by the Communities tab of the pill modal. Same shape as the
    `/api/communities?sync_ids=` endpoint, but scoped to the thread's
    frozen sync_ids so the modal doesn't have to mirror the scope on
    the wire.
    """
    sub = require_user_sub_strict(x_user_sub)
    thread = await chat_store.get_thread(sub, thread_id)
    if not thread:
        raise NotFoundError("thread not found")
    ctx = await chat_context_store.get_thread_context(thread_id)
    sync_ids = list(ctx.get("scope", {}).get("sync_ids", []))
    if not sync_ids:
        return {"cache_key": None, "communities": []}
    # Defer to the canonical communities module; merges user-pinned
    # Leiden defaults with the (empty) override.
    from src.api.preferences_helpers import load_user_leiden_defaults
    from src.graph import community as community_mod
    from src.graph.leiden_config import LeidenConfig

    defaults = await load_user_leiden_defaults(sub)
    cfg = LeidenConfig(**defaults)
    result = await community_mod.get_or_compute(
        sync_ids, cfg, user_sub=sub,
    )
    return {
        "cache_key": result.cache_key,
        "summary": {
            "community_count": result.summary.community_count,
            "modularity": result.summary.modularity,
            "largest_share": result.summary.largest_share,
            "orphan_pct": result.summary.orphan_pct,
            "community_sizes": result.summary.community_sizes,
        },
        "communities": [
            {
                "index": c.index,
                "label": c.label,
                "size": c.size,
                "node_ids_sample": c.node_ids_sample,
            }
            for c in result.communities
        ],
    }
