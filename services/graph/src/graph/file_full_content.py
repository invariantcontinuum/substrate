"""Reconstruct a file's full content from content_chunks rows."""
from __future__ import annotations
from dataclasses import dataclass
from uuid import UUID

import asyncpg


@dataclass
class IncompleteReconstruction(Exception):
    file_id:       UUID
    covered_lines: int
    total_lines:   int

    def __str__(self) -> str:
        return (
            f"file {self.file_id}: chunks cover "
            f"{self.covered_lines}/{self.total_lines} lines"
        )


async def load_full(pool: asyncpg.Pool, file_id: UUID) -> str:
    """Return the full file text, ordered by chunk_index. Raises
    IncompleteReconstruction if the chunks don't cover line_count."""
    meta = await pool.fetchrow(
        "SELECT line_count FROM file_embeddings WHERE id = $1", file_id,
    )
    if meta is None:
        raise IncompleteReconstruction(file_id=file_id, covered_lines=0, total_lines=0)

    rows = await pool.fetch(
        "SELECT chunk_index, content, start_line, end_line "
        "FROM content_chunks WHERE file_id = $1 ORDER BY chunk_index",
        file_id,
    )
    text = "\n".join(r["content"] for r in rows)

    covered = max((r["end_line"] for r in rows), default=0)
    total = meta["line_count"] or 0
    if total and covered < total:
        raise IncompleteReconstruction(
            file_id=file_id, covered_lines=covered, total_lines=total,
        )
    return text
