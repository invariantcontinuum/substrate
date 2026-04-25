"""Streaming JSON export endpoints. All three return application/json
via StreamingResponse with a single top-level object."""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Header, Query
from fastapi.responses import StreamingResponse

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub_strict
from src.graph import store
from src.graph.export_writer import stream_export

logger = structlog.get_logger()
router = APIRouter(prefix="/api/export")


async def _stream_response(*, user_sub: str, kind: str, scope: dict) -> StreamingResponse:
    """Wrap stream_export in StreamingResponse. ValidationError raised
    pre-stream (e.g. export_max_files) propagates normally; once any
    bytes are written, errors become trailer-of-document JSON noise."""
    gen = stream_export(user_sub=user_sub, kind=kind, scope=scope)
    return StreamingResponse(gen, media_type="application/json")


@router.get("/loaded")
async def export_loaded(
    sync_ids: str = Query(..., description="comma-separated sync UUIDs"),
    x_user_sub: str | None = Header(default=None),
) -> StreamingResponse:
    sub = require_user_sub_strict(x_user_sub)
    ids = [s.strip() for s in sync_ids.split(",") if s.strip()]
    if not ids:
        raise ValidationError("sync_ids required")
    # Trigger the cap-check BEFORE returning the StreamingResponse so the
    # 400 propagates as a normal error response (not as a half-written body).
    pool = store.get_pool()
    async with pool.acquire() as conn:
        n_files = await conn.fetchval(
            "SELECT count(*) FROM file_embeddings f JOIN sources s ON s.id = f.source_id "
            "WHERE s.user_sub = $1 AND f.sync_id = ANY($2::uuid[])",
            sub, ids,
        )
    from src.config import settings
    if n_files and n_files > settings.export_max_files:
        raise ValidationError(
            f"export resolves to {n_files} files, exceeds cap "
            f"{settings.export_max_files}",
        )
    return await _stream_response(user_sub=sub, kind="loaded",
                                  scope={"sync_ids": ids})


@router.get("/community/{cache_key}/{community_index}")
async def export_community(
    cache_key: str,
    community_index: int,
    x_user_sub: str | None = Header(default=None),
) -> StreamingResponse:
    sub = require_user_sub_strict(x_user_sub)
    return await _stream_response(
        user_sub=sub, kind="community",
        scope={"cache_key": cache_key, "community_index": community_index},
    )


@router.get("/sync/{sync_id}")
async def export_sync(
    sync_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> StreamingResponse:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        owned = await conn.fetchval(
            "SELECT 1 FROM sync_runs r JOIN sources s ON s.id = r.source_id "
            "WHERE r.id = $1 AND s.user_sub = $2",
            sync_id, sub,
        )
    if not owned:
        raise NotFoundError("sync not found")
    return await _stream_response(
        user_sub=sub, kind="sync", scope={"sync_id": str(sync_id)},
    )
