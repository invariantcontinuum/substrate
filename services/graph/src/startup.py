import asyncio
import json
from typing import Any

import asyncpg
import structlog

from src.config import settings
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
            await _maybe_invalidate(pool, event_id)
    finally:
        try:
            await conn.remove_listener(_SSE_CHANNEL, _on_notify)
        finally:
            await pool.release(conn)


async def _maybe_invalidate(pool: asyncpg.Pool, event_id: str) -> None:
    """Fetch the event body, filter to terminal sync_lifecycle events,
    and invalidate cache rows overlapping that sync_id."""
    async with pool.acquire() as c:
        row = await c.fetchrow(
            "SELECT type, sync_id, payload FROM sse_events WHERE id = $1",
            event_id,
        )
    if not row:
        return
    if row["type"] != "sync_lifecycle":
        return
    payload = row["payload"]
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return
    if not isinstance(payload, dict):
        return
    status = payload.get("status")
    if status not in _INVALIDATING_STATUSES:
        return
    sync_id = row["sync_id"]
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
