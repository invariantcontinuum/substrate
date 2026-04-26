"""Ingestion startup wiring for runtime config overlay + SSE refresh.

The ingestion service holds an asyncpg pool (``graph_writer.get_pool()``)
once it boots. This module:

1. Initialises the layered-settings runtime overlay against that pool so
   the merged ``defaults < yaml < env < runtime_config`` view is visible
   on the first request after restart.
2. Starts a Postgres ``LISTEN substrate_sse`` task that filters
   ``config.updated`` events scoped to ``ingestion`` and re-projects the
   overlay live (no container restart needed for tuning changes).

The listener is intentionally minimal: it does not subscribe via the
shared ``SseBus.subscribe()`` path (that one fans events to a per-call
queue tuned for SSE clients) — config refresh is a process-internal
concern that can use a single dedicated LISTEN connection. Other
substrate event types arriving on the channel are silently ignored here;
the graph service owns its own dispatcher in ``services/graph/src/startup.py``.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg
import structlog

from substrate_common.config import ConfigRefresher

from src import config as _config_module
from src import graph_writer
from src.config import _IngestionSettings, settings


_log = structlog.get_logger()

_SSE_CHANNEL = "substrate_sse"

_config_refresher: ConfigRefresher | None = None
_listener_task: asyncio.Task[None] | None = None


async def init_config_overlay(pool: asyncpg.Pool) -> None:
    """Open the runtime overlay and rebind ``src.config.settings``.

    Called once during the FastAPI lifespan after ``graph_writer.connect``
    has opened the pool. Idempotent — a second call replaces the
    refresher binding (useful for tests).
    """
    global _config_refresher
    _config_refresher = ConfigRefresher(
        scope=settings.SCOPE,
        settings_cls=_IngestionSettings,
        config_module=_config_module,
    )
    await _config_refresher.init(pool)
    _log.info("ingestion_config_overlay_initialised", scope=settings.SCOPE)


async def start_config_listener() -> None:
    """Spawn the ``substrate_sse`` listener that drives runtime refresh.

    Idempotent — re-entry replaces the prior task so a lifespan restart
    in tests doesn't leak listeners.
    """
    global _listener_task
    await stop_config_listener()
    _listener_task = asyncio.create_task(
        _run_listener(), name="ingestion-config-listener",
    )
    _log.info("ingestion_config_listener_started")


async def stop_config_listener() -> None:
    """Cancel the listener and wait for unwind. Safe before start."""
    global _listener_task
    t = _listener_task
    if t is not None and not t.done():
        t.cancel()
    if t is not None:
        try:
            await t
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
    _listener_task = None


async def _run_listener() -> None:
    """Resilient outer loop: any non-cancellation error restarts the
    inner LISTEN attempt with a 1s backoff."""
    pool = graph_writer.get_pool()
    while True:
        try:
            await _listen_loop_once(pool)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — resilience
            _log.warning(
                "ingestion_config_listener_restarting", error=str(exc),
            )
            await asyncio.sleep(1.0)


async def _listen_loop_once(pool: asyncpg.Pool) -> None:
    """One LISTEN attempt: hold a dedicated connection, forward each
    notify into a bounded queue, and dispatch ``config.updated`` events."""
    conn = await pool.acquire()
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1024)

    def _on_notify(_c: Any, _pid: int, _chan: str, event_id: str) -> None:
        try:
            queue.put_nowait(event_id)
        except asyncio.QueueFull:
            # Config refresh is best-effort; the next event recovers.
            _log.warning("ingestion_config_listener_queue_full")

    await conn.add_listener(_SSE_CHANNEL, _on_notify)
    _log.info(
        "ingestion_config_listener_attached", channel=_SSE_CHANNEL,
    )
    try:
        while True:
            event_id = await queue.get()
            await _maybe_refresh_config(pool, event_id)
    finally:
        try:
            await conn.remove_listener(_SSE_CHANNEL, _on_notify)
        finally:
            await pool.release(conn)


async def _maybe_refresh_config(pool: asyncpg.Pool, event_id: str) -> None:
    """Fetch the event row, filter to ``config.updated``, and forward to
    the refresher. Defensive: any exception is logged and swallowed so a
    transient DB hiccup cannot kill the listener."""
    if _config_refresher is None:
        return
    try:
        async with pool.acquire() as c:
            row = await c.fetchrow(
                "SELECT type, payload FROM sse_events WHERE id = $1",
                event_id,
            )
        if not row or row["type"] != "config.updated":
            return
        payload = row["payload"]
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except json.JSONDecodeError:
                return
        if not isinstance(payload, dict):
            return
        await _config_refresher.on_event(payload)
    except Exception as exc:  # noqa: BLE001 — listener resilience
        _log.warning(
            "ingestion_config_refresh_failed", error=str(exc),
        )
