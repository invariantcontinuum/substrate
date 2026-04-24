"""User preferences API (spec §3.2). Each user has a single row in
``user_preferences`` with a free-form jsonb ``prefs`` column merged over a
server-side default schema on read and on write. ``leiden`` subtree is
validated against ``LeidenConfig`` so API clients can't persist values the
active-set compute would reject at request time."""
from __future__ import annotations

import json
from typing import Any

import structlog
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import ValidationError

from src.api.auth import require_user_sub
from src.graph import store
from src.graph.leiden_config import LeidenConfig

logger = structlog.get_logger()
router = APIRouter(prefix="/api/users/me/preferences")


DEFAULT_PREFS: dict[str, Any] = {
    "leiden": {
        "resolution": 1.0,
        "beta": 0.01,
        "iterations": 10,
        "min_cluster_size": 4,
        "seed": 42,
    },
    "layout": "force-directed",
    "theme": "system",
    "telemetry": True,
    "schema_version": 1,
}

_VALID_THEMES = {"system", "light", "dark"}
_VALID_LAYOUTS = {"force-directed", "hierarchical"}


@router.get("")
async def get_prefs(
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT prefs, "
            "       to_char(updated_at at time zone 'UTC', "
            "               'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at "
            "FROM user_preferences WHERE user_sub = $1",
            user_sub,
        )
    if not row:
        return {"prefs": DEFAULT_PREFS, "updated_at": None}
    stored = row["prefs"]
    stored = json.loads(stored) if isinstance(stored, str) else (stored or {})
    return {
        "prefs": _deep_merge(DEFAULT_PREFS, stored),
        "updated_at": row["updated_at"],
    }


@router.put("")
async def put_prefs(
    patch: dict[str, Any] = Body(...),
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    _validate_shape(patch)

    pool = store.get_pool()
    async with pool.acquire() as conn:
        existing_raw = await conn.fetchval(
            "SELECT prefs FROM user_preferences WHERE user_sub = $1",
            user_sub,
        )
        existing = (
            json.loads(existing_raw) if isinstance(existing_raw, str)
            else (existing_raw or {})
        )
        candidate = _deep_merge(DEFAULT_PREFS, _deep_merge(existing, patch))
        _validate_leiden_subtree(candidate.get("leiden", {}))

        await conn.execute(
            "INSERT INTO user_preferences (user_sub, prefs) "
            "VALUES ($1, $2::jsonb) "
            "ON CONFLICT (user_sub) DO UPDATE SET "
            "  prefs = EXCLUDED.prefs, updated_at = now()",
            user_sub, candidate,
        )
        row = await conn.fetchrow(
            "SELECT to_char(updated_at at time zone 'UTC', "
            "               'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at "
            "FROM user_preferences WHERE user_sub = $1",
            user_sub,
        )
    return {"prefs": candidate, "updated_at": row["updated_at"]}


def _validate_shape(patch: dict[str, Any]) -> None:
    if "theme" in patch and patch["theme"] not in _VALID_THEMES:
        raise HTTPException(
            422, {"error": "invalid_theme", "allowed": sorted(_VALID_THEMES)},
        )
    if "layout" in patch and patch["layout"] not in _VALID_LAYOUTS:
        raise HTTPException(
            422, {"error": "invalid_layout", "allowed": sorted(_VALID_LAYOUTS)},
        )
    if "telemetry" in patch and not isinstance(patch["telemetry"], bool):
        raise HTTPException(422, {"error": "invalid_telemetry"})


def _validate_leiden_subtree(leiden: dict[str, Any]) -> None:
    try:
        LeidenConfig(**leiden)
    except ValidationError as exc:
        raise HTTPException(
            422, {"error": "invalid_leiden_config", "detail": exc.errors()},
        )


def _deep_merge(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Right-wins deep merge. Nested dicts recurse; scalars replace."""
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out
