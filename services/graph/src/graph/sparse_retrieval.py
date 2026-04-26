"""Sparse keyword retrieval over ``file_embeddings.description_tsv``.

Uses Postgres ``plainto_tsquery`` against the GIN-indexed tsvector column
landed by V8. Returns top-K file rows ranked by ``ts_rank_cd``. Restricted
to caller-specified snapshot ids (``file_embeddings.sync_id``); the chat
pipeline filters to the user's active sync set before calling, so this
module is intentionally auth-blind — its safety contract is "search only
inside snapshot_ids".
"""
from __future__ import annotations

from src.graph import store


async def sparse_top_k(
    *, snapshot_ids: list[str], query: str, k: int,
) -> list[dict]:
    """Return up to ``k`` rows ordered by ts_rank_cd descending.

    Each row dict carries ``file_id`` (str), ``file_path`` (str) and
    ``score`` (float). Empty / blank queries and empty snapshot lists
    short-circuit to ``[]`` so the caller can skip the round-trip.
    """
    if not query.strip() or not snapshot_ids:
        return []
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS file_id,
                   file_path,
                   ts_rank_cd(description_tsv, plainto_tsquery('english', $1)) AS score
              FROM file_embeddings
             WHERE sync_id = ANY($2::uuid[])
               AND description_tsv @@ plainto_tsquery('english', $1)
             ORDER BY score DESC
             LIMIT $3
            """,
            query, snapshot_ids, k,
        )
    return [
        {
            "file_id": r["file_id"],
            "file_path": r["file_path"],
            "score": float(r["score"]),
        }
        for r in rows
    ]
