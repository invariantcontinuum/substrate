"""GET /api/graph/search?q=... — node search across the active set.

Lightweight ILIKE-based autocompleter for the frontend Ctrl+K search
modal. Matches ``name`` or ``file_path`` on rows the calling user owns
(joined through ``sources.user_sub``) and best-effort fills in a
``community_index`` so the UI can route a result to the matching
carousel slide. When the user has not yet computed an active-set Leiden
result, ``community_index`` falls back to ``-1`` and the caller routes
the hit to the "Other" slide."""
from __future__ import annotations

import json

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query

from src.api.auth import require_user_sub
from src.graph import store

logger = structlog.get_logger()
router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/search")
async def search(
    q: str = Query(default="", description="search substring"),
    limit: int = Query(default=50, ge=1, le=200),
    user_sub: str = Depends(require_user_sub),
) -> dict:
    """Substring autocomplete over file rows the user owns.

    Returns a payload matching the SearchHit shape consumed by the
    frontend modal:

        { "hits": [
            { "node_id": "<file_embeddings.id::text>",
              "filepath": "<file_path>",
              "name": "<name>",
              "type": "<type>",
              "community_index": <int> }
          ] }
    """
    needle = q.strip()
    if not needle:
        raise HTTPException(status_code=400, detail="empty query")

    pattern = f"%{needle}%"
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT fe.id::text       AS node_id,
                   fe.file_path      AS filepath,
                   fe.name           AS name,
                   fe.type           AS type
              FROM file_embeddings fe
              JOIN sources s ON s.id = fe.source_id
             WHERE s.user_sub = $1
               AND (fe.name ILIKE $2 OR fe.file_path ILIKE $2)
             ORDER BY length(fe.name) ASC, fe.file_path ASC
             LIMIT $3
            """,
            user_sub, pattern, limit,
        )

        # Best-effort community_index lookup. Pull the user's most recent
        # leiden_cache row and decode its assignments map. If none exists
        # yet, every hit gets community_index = -1 and the frontend falls
        # back to the "Other" slide / global focusNode behavior.
        assignments: dict[str, int] = {}
        try:
            cached = await conn.fetchval(
                """
                SELECT assignments
                  FROM leiden_cache
                 WHERE user_sub = $1
                 ORDER BY cached_at DESC
                 LIMIT 1
                """,
                user_sub,
            )
            if cached is not None:
                payload = json.loads(cached) if isinstance(cached, str) else cached
                if isinstance(payload, dict):
                    assignments = {
                        str(k): int(v) for k, v in payload.items()
                    }
        except Exception:  # noqa: BLE001 — assignments are best-effort
            logger.debug("graph_search_assignments_lookup_failed", user_sub=user_sub)
            assignments = {}

    hits = [
        {
            "node_id": r["node_id"],
            "filepath": r["filepath"],
            "name": r["name"],
            "type": r["type"],
            "community_index": assignments.get(r["node_id"], -1),
        }
        for r in rows
    ]
    return {"hits": hits}
