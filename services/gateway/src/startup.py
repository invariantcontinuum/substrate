"""Gateway startup wiring for runtime config overlay + SSE refresh.

Mirrors ``services/ingestion/src/startup.py``. The gateway holds a dedicated
asyncpg pool for SSE LISTEN/NOTIFY (``sse_endpoint._pool``); we reuse it as
the substrate of both the layered-settings runtime overlay and a small
``config.updated`` listener task. The listener is intentionally separate
from the per-client SSE subscriber path: that one yields rows to a
streaming HTTP response, while this one just rebuilds the in-process
settings instance when an admin updates an ``auth`` or ``github`` value.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import asyncpg
import structlog

from substrate_common.config import ConfigRefresher

from src import config as _config_module
from src.config import _GatewaySettings, settings


_log = structlog.get_logger()

_SSE_CHANNEL = "substrate_sse"

_config_refresher: ConfigRefresher | None = None
_listener_task: asyncio.Task[None] | None = None


async def init_config_overlay(pool: asyncpg.Pool) -> None:
    """Open the runtime overlay against ``pool`` and rebind
    ``src.config.settings``. Called from the FastAPI lifespan after
    ``init_sse_pool``."""
    global _config_refresher
    _config_refresher = ConfigRefresher(
        scope=settings.SCOPE,
        settings_cls=_GatewaySettings,
        config_module=_config_module,
    )
    await _config_refresher.init(pool)
    _log.info("gateway_config_overlay_initialised", scope=settings.SCOPE)


async def start_config_listener() -> None:
    """Spawn the LISTEN task. Idempotent."""
    global _listener_task
    await stop_config_listener()
    _listener_task = asyncio.create_task(
        _run_listener(), name="gateway-config-listener",
    )
    _log.info("gateway_config_listener_started")


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
    inner LISTEN attempt with a 1s backoff. The pool is read at each
    attempt so a hot-reset of the SSE pool (tests) re-binds cleanly."""
    from src import sse_endpoint  # late import: avoids cycle at module load

    while True:
        pool = sse_endpoint._pool
        if pool is None:
            # SSE pool not yet open (lifespan still booting); retry.
            await asyncio.sleep(0.2)
            continue
        try:
            await _listen_loop_once(pool)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — resilience
            _log.warning(
                "gateway_config_listener_restarting", error=str(exc),
            )
            await asyncio.sleep(1.0)


async def _listen_loop_once(pool: asyncpg.Pool) -> None:
    """One LISTEN attempt: hold a dedicated connection, push notify ids
    into a bounded queue, dispatch ``config.updated`` to the refresher."""
    conn = await pool.acquire()
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1024)

    def _on_notify(_c: Any, _pid: int, _chan: str, event_id: str) -> None:
        try:
            queue.put_nowait(event_id)
        except asyncio.QueueFull:
            _log.warning("gateway_config_listener_queue_full")

    await conn.add_listener(_SSE_CHANNEL, _on_notify)
    _log.info("gateway_config_listener_attached", channel=_SSE_CHANNEL)
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
    """Fetch one ``sse_events`` row and forward ``config.updated`` to the
    refresher. Defensive: errors are logged at WARN and swallowed."""
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
            "gateway_config_refresh_failed", error=str(exc),
        )
