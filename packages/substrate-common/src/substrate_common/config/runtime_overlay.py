"""Runtime overlay loader for LayeredSettings.

Reads runtime_config rows for a given scope, exposes a snapshot dict, and
provides ``refresh()`` to re-read after an SSE config.updated event.

The pool argument is asyncpg-compatible (must support ``async with
pool.acquire() as conn`` and ``await conn.fetch(...)``).

Pool flavour tolerance: ``value`` is stored as JSONB. Pools wired through
``substrate_common.db.create_pool`` register a JSONB codec so the column
arrives as a Python value already; pools created ad-hoc (e.g. the gateway's
SSE LISTEN pool) leave it as a raw JSON string. The loader accepts both
shapes so any service can drive it.
"""
from __future__ import annotations

import json
from typing import Any, Protocol


class _Pool(Protocol):
    def acquire(self) -> Any: ...


def _decode(value: Any) -> Any:
    """Decode a runtime_config.value cell into a Python value.

    JSONB columns are decoded by asyncpg's JSONB codec when one is registered
    on the pool; without a codec the driver returns the raw text. Decode the
    text path here so callers don't have to special-case it.
    """
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


class RuntimeOverlay:
    def __init__(self, *, scope: str, pool: _Pool):
        self._scope = scope
        self._pool = pool
        self._snapshot: dict[str, Any] = {}

    async def refresh(self) -> None:
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT key, value FROM runtime_config WHERE scope = $1",
                self._scope,
            )
        self._snapshot = {r["key"]: _decode(r["value"]) for r in rows}

    def snapshot(self) -> dict[str, Any]:
        return dict(self._snapshot)
