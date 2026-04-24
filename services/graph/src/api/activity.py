"""Unified activity feed (spec §9.5). Merges sync lifecycle events from
``sync_runs`` and Leiden compute events from ``leiden_cache`` into one
descending-by-timestamp stream. Used by the Sources · Activity tab."""
from __future__ import annotations

import base64
import binascii
from datetime import datetime
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.auth import require_user_sub
from src.graph import store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/activity")


def _encode_cursor(ts: str) -> str:
    return base64.urlsafe_b64encode(ts.encode()).decode()


def _decode_cursor(s: str) -> str:
    try:
        return base64.urlsafe_b64decode(s.encode()).decode()
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(400, f"invalid cursor: {exc}") from exc


@router.get("")
async def get_activity(
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    pool = store.get_pool()
    args: list[Any] = [user_sub, limit + 1]
    ts_where = ""
    if cursor:
        before_text = _decode_cursor(cursor)
        try:
            # Accept the ISO-8601 'Z' form we emit, plus any RFC-3339 variant
            # asyncpg would otherwise reject for not being a datetime object.
            before_dt = datetime.fromisoformat(before_text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise HTTPException(400, f"invalid cursor: {exc}") from exc
        args.append(before_dt)
        ts_where = " AND ts < $3"

    sql = f"""
      WITH sync_events AS (
        SELECT sr.id::text AS id,
               'sync.' || sr.status AS kind,
               sr.completed_at AS ts,
               s.owner || '/' || s.name AS subject,
               jsonb_build_object(
                 'source_id', s.id::text,
                 'sync_id', sr.id::text,
                 'node_count',
                   coalesce((sr.stats->'counts'->>'node_count')::int, 0),
                 'edge_count',
                   coalesce((sr.stats->'counts'->>'edge_count')::int, 0)
               ) AS detail
          FROM sync_runs sr JOIN sources s ON s.id = sr.source_id
         WHERE s.user_sub = $1
           AND sr.status IN ('completed','failed','cleaned')
      ),
      leiden_events AS (
        SELECT lc.cache_key AS id,
               'leiden.computed' AS kind,
               lc.created_at AS ts,
               concat('Leiden · ', lc.community_count, ' communities')
                   AS subject,
               jsonb_build_object(
                 'cache_key', lc.cache_key,
                 'community_count', lc.community_count,
                 'modularity', lc.modularity,
                 'compute_ms', lc.compute_ms
               ) AS detail
          FROM leiden_cache lc
         WHERE lc.user_sub = $1
      )
      SELECT id, kind,
             to_char(ts AT TIME ZONE 'UTC',
                     'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts,
             subject, detail
        FROM (
          SELECT * FROM sync_events
          UNION ALL
          SELECT * FROM leiden_events
        ) merged
       WHERE ts IS NOT NULL {ts_where}
       ORDER BY ts DESC
       LIMIT $2
    """

    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)

    has_more = len(rows) > limit
    items = [dict(r) for r in rows[:limit]]
    next_cursor: str | None = None
    if has_more and items:
        # Cursor is the last item's raw timestamp text — we decode and pass
        # it as timestamptz so ordering stays identical across pages.
        next_cursor = _encode_cursor(items[-1]["ts"])
    return {"items": items, "next_cursor": next_cursor}
