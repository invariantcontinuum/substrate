"""Per-user Leiden defaults for the communities API. Reads the ``leiden``
subtree from ``user_preferences.prefs`` and merges it over server-side
defaults — every LeidenConfig field has a value whether the user has saved
prefs or not. Returned dict is passed directly into ``LeidenConfig(**…)``
after the communities layer merges in the request-provided overrides."""
from __future__ import annotations

import json
from typing import Any

from src.graph import store


DEFAULT_LEIDEN: dict[str, Any] = {
    "resolution": 1.0,
    "beta": 0.01,
    "iterations": 10,
    "min_cluster_size": 4,
    "seed": 42,
}


async def load_user_leiden_defaults(user_sub: str) -> dict[str, Any]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchval(
            "SELECT prefs FROM user_preferences WHERE user_sub = $1",
            user_sub,
        )
    if row is None:
        return dict(DEFAULT_LEIDEN)
    stored = json.loads(row) if isinstance(row, str) else row
    leiden = stored.get("leiden", {}) if isinstance(stored, dict) else {}
    return {**DEFAULT_LEIDEN, **leiden}
