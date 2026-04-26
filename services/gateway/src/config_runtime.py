"""DB + internal-call helpers for runtime_config reads/writes.

The gateway's ``PUT /api/config/{section}`` validates a body, persists
each top-level key as a row in ``runtime_config`` (scope = section),
and emits an SSE ``config.updated`` event so the owning service can
refresh its layered-settings overlay.

``GET /api/config/{section}`` proxies to the owning service's internal
``GET /internal/config/{section}`` route, which returns the merged
effective settings (defaults < yaml < env < runtime overlay). The
gateway never reconstructs that merge itself.
"""
from __future__ import annotations

import json
from typing import Any

import httpx
import structlog

from src import sse_endpoint
from src.config import settings

log = structlog.get_logger()


def _pool() -> Any:
    """Return the asyncpg pool already opened for the SSE LISTEN/NOTIFY
    bus. ``runtime_config`` lives in the same database as ``sse_events``,
    so reusing the SSE pool avoids opening a second connection pool just
    for two-row config writes.
    """
    pool = sse_endpoint._pool
    if pool is None:
        raise RuntimeError(
            "gateway asyncpg pool not initialised — call init_pool() at startup"
        )
    return pool


async def upsert_runtime_section(
    *, scope: str, payload: dict[str, Any], updated_by: str,
) -> None:
    """Upsert each ``payload`` entry as a (scope, key, value) row.

    ``scope`` is the owning service's ``LayeredSettings.SCOPE`` (e.g.
    ``"graph"`` / ``"ingestion"``) — matching the scope the service
    reads via ``RuntimeOverlay`` at startup. ``value`` is stored as
    JSONB so the column can hold scalars, lists, or nested objects
    without per-section schema migration.
    """
    pool = _pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for key, value in payload.items():
                await conn.execute(
                    """
                    INSERT INTO runtime_config (scope, key, value, updated_by, updated_at)
                    VALUES ($1, $2, $3::jsonb, $4, now())
                    ON CONFLICT (scope, key) DO UPDATE
                    SET value = EXCLUDED.value,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = now()
                    """,
                    scope,
                    key,
                    json.dumps(value),
                    updated_by,
                )


async def reset_runtime_section(
    *, scope: str, keys: list[str] | None = None,
) -> int:
    """Clear runtime overrides for ``scope``.

    When ``keys`` is None every row in the scope is removed (full reset
    of the section). When ``keys`` is given only those columns are
    deleted — used by the LLM sections, which share an owner's scope
    but only own a slice of its keys (one prefix per role).

    Returns the number of rows removed. After this call the effective
    settings revert to yaml < env < pydantic-defaults; the next
    ``GET /api/config/{section}`` call reads the new merged shape.
    Callers MUST emit a ``config.updated`` event afterward so the
    owning service refreshes its overlay.
    """
    pool = _pool()
    async with pool.acquire() as conn:
        if keys is None:
            result = await conn.execute(
                "DELETE FROM runtime_config WHERE scope = $1",
                scope,
            )
        else:
            result = await conn.execute(
                "DELETE FROM runtime_config "
                "WHERE scope = $1 AND key = ANY($2::text[])",
                scope,
                keys,
            )
    # asyncpg returns the command tag, e.g. "DELETE 7".
    parts = result.split()
    return int(parts[-1]) if parts and parts[-1].isdigit() else 0


def _internal_base_url(owner: str) -> str:
    """Resolve ``owner`` (compose hostname) to the in-cluster base URL.

    The gateway already knows the graph and ingestion service URLs from
    its own settings; we look them up by name so the registry can grow
    new owners without code changes here.
    """
    if owner == "graph":
        return settings.graph_service_url
    if owner == "ingestion":
        return settings.ingestion_service_url
    if owner == "gateway":
        # Self-owned sections are read out of process via the same
        # /internal/config/{section} contract; bind to localhost to
        # short-circuit the network hop.
        return "http://127.0.0.1:8000"
    raise ValueError(f"unknown config owner {owner!r}")


async def fetch_effective_section(*, section: str, owner: str) -> dict[str, Any]:
    """Proxy to the owning service's ``GET /internal/config/{section}``.

    The owning service exposes its merged effective settings via that
    internal-only route. This helper hides the hop from the public API
    handler and surfaces upstream errors as ``httpx.HTTPStatusError``.
    """
    base = _internal_base_url(owner)
    url = f"{base}/internal/config/{section}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return dict(resp.json())
