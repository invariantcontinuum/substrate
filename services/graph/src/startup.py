import asyncio
import json
from typing import Any

import asyncpg
import structlog

from substrate_common.config import ConfigRefresher

from src import config as _config_module
from src.config import _GraphSettings, settings
from src.graph import community as community_mod
from src.graph import store


async def check_embedding_dim(conn: asyncpg.Connection, expected_dim: int) -> None:
    """Assert the file_embeddings.embedding column dimension matches expected_dim.

    pgvector stores the declared dim directly in pg_attribute.atttypmod
    (i.e. atttypmod == dim, unlike varchar where atttypmod == n + 4).
    Raises RuntimeError on mismatch so the service refuses to start with
    drifted vector column configuration.
    """
    row = await conn.fetchrow(
        """
        SELECT atttypmod FROM pg_attribute
        WHERE attrelid = 'file_embeddings'::regclass AND attname = 'embedding'
        """
    )
    if row is None:
        raise RuntimeError("file_embeddings.embedding column not found")
    column_dim = row["atttypmod"]
    if column_dim != expected_dim:
        raise RuntimeError(
            f"Embedding dim mismatch: config expects {expected_dim}, "
            f"file_embeddings.embedding column is {column_dim}. Refusing to start."
        )


# ---------------------------------------------------------------------------
# Leiden cache background tasks — listener + periodic TTL sweeper.
# ---------------------------------------------------------------------------

_log = structlog.get_logger()

_SSE_CHANNEL = "substrate_sse"
_INVALIDATING_STATUSES = {"completed", "cleaned", "failed"}

_listener_task: asyncio.Task[None] | None = None
_sweeper_task: asyncio.Task[None] | None = None

# Module-global config refresher. Initialised by ``init_config_overlay``
# during the FastAPI lifespan and consumed by the SSE LISTEN loop when
# a ``config.updated`` event arrives. Held at module scope because the
# graph service has exactly one settings instance per process.
_config_refresher: ConfigRefresher | None = None


async def init_config_overlay(pool: asyncpg.Pool) -> None:
    """Open the runtime overlay against ``pool``, load the initial snapshot,
    and rebind ``src.config.settings`` so the merged values are visible
    to subsequent reads. Called from the FastAPI lifespan after the
    asyncpg pool is open."""
    global _config_refresher
    _config_refresher = ConfigRefresher(
        scope=settings.SCOPE,
        settings_cls=_GraphSettings,
        config_module=_config_module,
    )
    await _config_refresher.init(pool)
    _log.info("graph_config_overlay_initialised", scope=settings.SCOPE)


async def start_leiden_cache_tasks() -> None:
    """Spawn the listener + sweeper. Idempotent: safe to call twice
    (second call is a no-op). Cancels + replaces any prior task so a
    lifespan restart in tests doesn't leak tasks."""
    global _listener_task, _sweeper_task
    await stop_leiden_cache_tasks()
    _listener_task = asyncio.create_task(
        _run_listener(), name="leiden-cache-listener",
    )
    _sweeper_task = asyncio.create_task(
        _run_sweeper(), name="leiden-cache-sweeper",
    )
    _log.info("leiden_cache_tasks_started")


async def stop_leiden_cache_tasks() -> None:
    """Cancel the listener + sweeper and wait for them to unwind. Safe
    to call before the tasks were ever started."""
    global _listener_task, _sweeper_task
    for t in (_listener_task, _sweeper_task):
        if t is not None and not t.done():
            t.cancel()
    for t in (_listener_task, _sweeper_task):
        if t is not None:
            try:
                await t
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
    _listener_task = None
    _sweeper_task = None
    _log.info("leiden_cache_tasks_stopped")


async def _run_listener() -> None:
    """Hold a dedicated connection open, LISTEN on substrate_sse, invalidate
    cache rows whose sync_id matches a sync_lifecycle event with a
    terminal-ish status. Reconnects on error — every exception other than
    CancelledError loops with a 1s backoff."""
    pool = store.get_pool()
    while True:
        try:
            await _listen_loop_once(pool)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — resilience
            _log.warning("leiden_cache_listener_restarting", error=str(exc))
            await asyncio.sleep(1.0)


async def _listen_loop_once(pool: asyncpg.Pool) -> None:
    """One attempt: acquire a connection, register the listener, then
    park until cancelled."""
    conn = await pool.acquire()
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1024)

    def _on_notify(_c: Any, _pid: int, _chan: str, event_id: str) -> None:
        try:
            queue.put_nowait(event_id)
        except asyncio.QueueFull:
            # Cache-maintenance overflow is not fatal — we lose at worst
            # one invalidation and the TTL sweeper picks up stale rows.
            _log.warning("leiden_cache_listener_queue_full")

    await conn.add_listener(_SSE_CHANNEL, _on_notify)
    _log.info("leiden_cache_listener_attached", channel=_SSE_CHANNEL)
    try:
        while True:
            event_id = await queue.get()
            await _dispatch_event(pool, event_id)
    finally:
        try:
            await conn.remove_listener(_SSE_CHANNEL, _on_notify)
        finally:
            await pool.release(conn)


async def _dispatch_event(pool: asyncpg.Pool, event_id: str) -> None:
    """Fetch one ``sse_events`` row and dispatch by ``type``.

    Two consumers share the same listener: the Leiden-cache invalidator
    (terminal sync_lifecycle events) and the runtime-config refresher
    (config.updated events). Multiplexing them avoids holding a second
    LISTEN connection just for config refresh. Unknown event types are
    silently ignored.
    """
    async with pool.acquire() as c:
        row = await c.fetchrow(
            "SELECT type, sync_id, payload FROM sse_events WHERE id = $1",
            event_id,
        )
    if not row:
        return
    payload = row["payload"]
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return
    if not isinstance(payload, dict):
        return

    if row["type"] == "config.updated":
        await _maybe_refresh_config(payload)
        return
    if row["type"] == "sync_lifecycle":
        await _maybe_invalidate(pool, row["sync_id"], payload)
        return


async def _maybe_refresh_config(payload: dict[str, Any]) -> None:
    """Forward to the runtime overlay refresher. Defensive: swallow
    overlay errors so a transient DB hiccup during refresh cannot crash
    the listener loop and break Leiden cache invalidation."""
    if _config_refresher is None:
        return
    try:
        await _config_refresher.on_event(payload)
    except Exception as exc:  # noqa: BLE001 — listener resilience
        _log.warning("config_overlay_refresh_failed", error=str(exc))


async def _maybe_invalidate(
    pool: asyncpg.Pool, sync_id: Any, payload: dict[str, Any],
) -> None:
    """Invalidate cache rows whose sync_ids array overlaps ``sync_id`` when
    a sync_lifecycle event reaches a terminal status."""
    status = payload.get("status")
    if status not in _INVALIDATING_STATUSES:
        return
    if sync_id is None:
        return
    try:
        n = await community_mod.invalidate_for_sync_ids([str(sync_id)])
        if n:
            _log.info(
                "leiden_cache_invalidated_for_sync",
                sync_id=str(sync_id), status=status, rows=n,
            )
    except Exception as exc:  # noqa: BLE001 — maintenance must not crash the loop
        _log.warning(
            "leiden_cache_invalidate_failed",
            sync_id=str(sync_id), error=str(exc),
        )


async def _run_sweeper() -> None:
    """Immediate sweep, then one sweep per ``leiden_cache_sweep_interval_s``.
    A failed sweep logs but does not stop the loop — the next tick retries."""
    while True:
        try:
            n = await community_mod.sweep_expired()
            if n:
                _log.info("leiden_cache_swept", rows=n)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            _log.warning("leiden_cache_sweep_failed", error=str(exc))
        try:
            await asyncio.sleep(settings.leiden_cache_sweep_interval_s)
        except asyncio.CancelledError:
            raise
