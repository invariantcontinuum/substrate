"""Runtime overlay loader for LayeredSettings.

Reads runtime_config rows for a given scope, exposes a snapshot dict, and
provides ``refresh()`` to re-read after an SSE config.updated event.

The pool argument is asyncpg-compatible (must support ``async with
pool.acquire() as conn`` and ``await conn.fetch(...)``).
"""
from __future__ import annotations

from typing import Any, Protocol


class _Pool(Protocol):
    def acquire(self) -> Any: ...


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
        self._snapshot = {r["key"]: r["value"] for r in rows}

    def snapshot(self) -> dict[str, Any]:
        return dict(self._snapshot)
