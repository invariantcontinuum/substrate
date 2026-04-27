"""Files API.

Two endpoints share this router:

- ``GET /api/files?sync_ids=...`` — list files for the chat-context
  picker. Returns minimal metadata only (no content); the picker shows
  size + language alongside the file path so the user can decide what
  to include before paying the embedding/retrieve cost.
- ``GET /api/files/{file_id}/content`` — lazy full-file reconstruction
  used by the node-detail modal and the JSON exporter.

The reconstructed content endpoint reads ``file_embeddings.line_count``
(V1); the JSON response uses ``total_lines`` to match the spec contract
and the ``reconstruct_chunks`` parameter naming.
"""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Header, Query
from fastapi.responses import JSONResponse

from substrate_common import NotFoundError

from src.api.auth import require_user_sub_strict
from src.config import settings
from src.graph import store
from src.graph.file_reconstruct import FileTooLargeForReconstruct, reconstruct_chunks

logger = structlog.get_logger()
router = APIRouter(prefix="/api/files")


@router.get("")
async def list_files(
    sync_ids: str = Query(..., description="Comma-separated sync_ids"),
    x_user_sub: str | None = Header(default=None),
) -> dict:
    """List files in the requested syncs. Used by the chat-context picker.

    Auth: scopes the query through ``sources.user_sub`` so the caller can
    only see files in their own syncs even if they pass another user's
    sync id (the join filters them out, leaving an empty list).
    """
    sub = require_user_sub_strict(x_user_sub)
    ids = [s.strip() for s in sync_ids.split(",") if s.strip()]
    if not ids:
        return {"files": []}
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id::text AS id, f.file_path, f.name, f.type, f.domain,
                   f.language, f.size_bytes
              FROM file_embeddings f
              JOIN sources s ON s.id = f.source_id
             WHERE f.sync_id = ANY($1::uuid[])
               AND s.user_sub = $2
             ORDER BY f.file_path ASC
            """,
            ids, sub,
        )
    return {
        "files": [
            {
                "id": r["id"],
                "filepath": r["file_path"],
                "name": r["name"],
                "type": r["type"],
                "domain": r["domain"],
                "language": r["language"],
                "size_bytes": r["size_bytes"],
            }
            for r in rows
        ],
    }


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        owner_row = await conn.fetchrow(
            """
            SELECT f.file_path, f.language, f.line_count
            FROM file_embeddings f
            JOIN sources s ON s.id = f.source_id
            WHERE f.id = $1 AND s.user_sub = $2
            """,
            file_id, sub,
        )
        if not owner_row:
            raise NotFoundError("file not found")
        chunks = await conn.fetch(
            """
            SELECT chunk_index, content, start_line, end_line
            FROM content_chunks
            WHERE file_id = $1
            ORDER BY chunk_index
            """,
            file_id,
        )
    try:
        rebuilt = reconstruct_chunks(
            [dict(c) for c in chunks],
            cap_bytes=settings.file_reconstruct_max_bytes,
            total_lines=owner_row["line_count"],
            file_id=file_id,
        )
    except FileTooLargeForReconstruct as exc:
        return JSONResponse(
            status_code=413,
            content={
                "error": "file_too_large",
                "file_id": str(exc.file_id),
                "covered_lines": exc.covered_lines,
                "total_lines": exc.total_lines,
                "cap_bytes": exc.cap_bytes,
            },
        )
    return {
        "file_id": str(file_id),
        "path": owner_row["file_path"],
        "language": owner_row["language"],
        "content": rebuilt["content"],
        "total_lines": owner_row["line_count"],
    }
