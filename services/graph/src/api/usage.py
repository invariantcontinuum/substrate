"""Per-user usage aggregator (spec §9.11). Powers Account · Billing's
placeholder counters. Pure read-only SUM/COUNT across ``sources`` and
``sync_runs.stats`` keyed by ``sources.user_sub``."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from src.api.auth import require_user_sub
from src.graph import store

router = APIRouter(prefix="/api/users/me/usage")


@router.get("")
async def get_usage(
    user_sub: str = Depends(require_user_sub),
) -> dict[str, int]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        sources = await conn.fetchval(
            "SELECT count(*) FROM sources WHERE user_sub = $1",
            user_sub,
        )
        snapshots = await conn.fetchval(
            "SELECT count(*) FROM sync_runs sr "
            "JOIN sources s ON s.id = sr.source_id "
            "WHERE s.user_sub = $1 AND sr.status = 'completed'",
            user_sub,
        )
        embedding_bytes = await conn.fetchval(
            "SELECT coalesce(sum(coalesce("
            "  (sr.stats->'storage'->>'embedding_bytes')::bigint, 0"
            ")), 0) "
            "FROM sync_runs sr JOIN sources s ON s.id = sr.source_id "
            "WHERE s.user_sub = $1 AND sr.status = 'completed'",
            user_sub,
        )
        graph_bytes = await conn.fetchval(
            "SELECT coalesce(sum(coalesce("
            "  (sr.stats->'storage'->>'graph_bytes')::bigint, 0"
            ")), 0) "
            "FROM sync_runs sr JOIN sources s ON s.id = sr.source_id "
            "WHERE s.user_sub = $1 AND sr.status = 'completed'",
            user_sub,
        )
    return {
        "sources": int(sources or 0),
        "snapshots": int(snapshots or 0),
        "embedding_bytes": int(embedding_bytes or 0),
        "graph_bytes": int(graph_bytes or 0),
    }
