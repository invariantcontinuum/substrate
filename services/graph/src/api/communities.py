"""Communities HTTP API (spec §3.1). Active-set Leiden over the user's
active sync set, cached in ``leiden_cache``. Every endpoint requires
``X-User-Sub`` (injected by the gateway). All writes flow through the
canonical module ``src.graph.community`` — this file is serialization +
validation + per-user defaulting only."""
from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.api.auth import require_user_sub
from src.api.preferences_helpers import load_user_leiden_defaults
from src.config import settings
from src.graph import community as community_mod
from src.graph.leiden_config import LeidenConfig

logger = structlog.get_logger()
router = APIRouter(prefix="/api/communities")


class RecomputeBody(BaseModel):
    sync_ids: list[str]
    config: dict[str, Any] | None = None


@router.get("")
async def get_communities(
    sync_ids: str = Query(..., description="comma-separated UUIDs"),
    config: str | None = Query(
        None,
        description="JSON-encoded LeidenConfig partial; merges over user defaults",
    ),
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    ids = [s.strip() for s in sync_ids.split(",") if s.strip()]
    if not ids:
        raise HTTPException(400, "sync_ids is required")
    cfg = _resolve_config(config, user_sub)
    try:
        result = await community_mod.get_or_compute(ids, cfg, user_sub=user_sub)
    except asyncio.TimeoutError:
        raise HTTPException(
            504,
            {
                "error": "leiden_timeout",
                "sync_ids": ids,
                "timeout_s": settings.active_set_leiden_timeout_s,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 — user-facing error boundary
        logger.exception("communities_get_failed", user_sub=user_sub)
        raise HTTPException(
            500, {"error": "leiden_failed", "detail": str(exc)},
        )
    return _serialize(result)


@router.post("/recompute")
async def recompute(
    body: RecomputeBody,
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    if not body.sync_ids:
        raise HTTPException(400, "sync_ids is required")
    cfg = _resolve_config(body.config, user_sub)
    result = await community_mod.get_or_compute(
        body.sync_ids, cfg, user_sub=user_sub, force=True,
    )
    return _serialize(result)


@router.get("/assignments")
async def assignments(
    cache_key: str = Query(...),
    user_sub: str = Depends(require_user_sub),  # noqa: ARG001 — auth gate only
) -> StreamingResponse:
    async def ndjson_stream():
        async for node_id, community_index in community_mod.get_assignments(cache_key):
            yield (
                json.dumps({"node_id": node_id, "community_index": community_index})
                + "\n"
            )
    return StreamingResponse(
        ndjson_stream(), media_type="application/x-ndjson",
    )


@router.get("/{cache_key}/{community_index}/nodes")
async def community_nodes(
    cache_key: str,
    community_index: int,
    limit: int = Query(100, le=500, ge=1),
    cursor: str | None = Query(None),
    user_sub: str = Depends(require_user_sub),  # noqa: ARG001 — auth gate only
) -> dict[str, Any]:
    page = await community_mod.get_community_nodes(
        cache_key, community_index, limit, cursor,
    )
    return {"items": page.items, "next_cursor": page.next_cursor}


def _resolve_config(
    config_input: str | dict[str, Any] | None, user_sub: str,
) -> LeidenConfig:
    """Merge (user-pinned defaults) with (request-provided overrides) and
    coerce into a validated ``LeidenConfig``. The request wins on key-level
    collisions so clients can partially override."""
    if isinstance(config_input, str):
        try:
            config_input = json.loads(config_input)
        except json.JSONDecodeError:
            raise HTTPException(400, "config must be valid JSON")
    if config_input is not None and not isinstance(config_input, dict):
        raise HTTPException(400, "config must be a JSON object")
    defaults = load_user_leiden_defaults(user_sub)
    merged = {**defaults, **(config_input or {})}
    try:
        return LeidenConfig(**merged)
    except Exception as exc:  # noqa: BLE001 — surface pydantic ValidationError as 400
        raise HTTPException(400, {"error": "invalid_config", "detail": str(exc)})


def _serialize(r) -> dict[str, Any]:
    return {
        "cache_key": r.cache_key,
        "cached": r.cached,
        "cached_at": r.cached_at,
        "expires_at": r.expires_at,
        "compute_ms": r.compute_ms,
        "config_used": r.config_used,
        "summary": {
            "community_count": r.summary.community_count,
            "modularity": r.summary.modularity,
            "largest_share": r.summary.largest_share,
            "orphan_pct": r.summary.orphan_pct,
            "community_sizes": r.summary.community_sizes,
        },
        "communities": [
            {
                "index": c.index,
                "label": c.label,
                "size": c.size,
                "node_ids_sample": c.node_ids_sample,
            }
            for c in r.communities
        ],
    }
