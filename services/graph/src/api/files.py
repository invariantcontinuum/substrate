"""Lazy full-file loader. Reconstructs the source text from
content_chunks for any file the caller owns. Used by the chat-context
modal, the node-detail modal (sub-project 3), and the JSON exporter."""
from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, Header

from substrate_common import NotFoundError, UnauthorizedError

from src.config import settings
from src.graph import store
from src.graph.file_reconstruct import reconstruct_chunks

logger = structlog.get_logger()
router = APIRouter(prefix="/api/files")


def _require_sub(x_user_sub: str | None) -> str:
    if not x_user_sub:
        raise UnauthorizedError("missing X-User-Sub")
    return x_user_sub


@router.get("/{file_id}/content")
async def get_file_content(
    file_id: UUID,
    x_user_sub: str | None = Header(default=None),
) -> dict:
    sub = _require_sub(x_user_sub)
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
    rebuilt = reconstruct_chunks(
        [dict(c) for c in chunks],
        cap_bytes=settings.file_reconstruct_max_bytes,
        total_lines=owner_row["line_count"],
    )
    return {
        "file_id": str(file_id),
        "path": owner_row["file_path"],
        "language": owner_row["language"],
        "content": rebuilt["content"],
        "total_lines": owner_row["line_count"],
        "truncated": rebuilt["truncated"],
    }
