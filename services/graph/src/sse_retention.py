"""Periodic retention for the append-only SSE event table."""
from __future__ import annotations

import asyncio

import structlog

from src.config import settings
from src.graph import store

logger = structlog.get_logger()

# Reserved advisory lock id for sse_events retention in graph service.
_SSE_RETENTION_LOCK_ID = 4839128734291750820

_running = False
_task: asyncio.Task | None = None

_DELETE_BATCH_QUERY = """
WITH doomed AS (
    SELECT ctid
    FROM sse_events
    WHERE emitted_at < now() - make_interval(hours => $1)
    ORDER BY emitted_at ASC
    LIMIT $2
)
DELETE FROM sse_events s
USING doomed
WHERE s.ctid = doomed.ctid
RETURNING 1
"""


async def prune_sse_events_once() -> None:
    if not settings.sse_retention_enabled:
        return

    pool = store.get_pool()
    async with pool.acquire() as conn:
        locked = await conn.fetchval("SELECT pg_try_advisory_lock($1)", _SSE_RETENTION_LOCK_ID)
        if not locked:
            logger.debug("sse_retention_skip_locked")
            return
        try:
            deleted_total = 0
            while True:
                rows = await conn.fetch(
                    _DELETE_BATCH_QUERY,
                    settings.sse_retention_hours,
                    settings.sse_retention_batch_size,
                )
                deleted = len(rows)
                deleted_total += deleted
                if deleted < settings.sse_retention_batch_size:
                    break
            if deleted_total:
                logger.info(
                    "sse_retention_pruned",
                    deleted=deleted_total,
                    retention_hours=settings.sse_retention_hours,
                )
        finally:
            await conn.fetchval("SELECT pg_advisory_unlock($1)", _SSE_RETENTION_LOCK_ID)


async def start_sse_retention_loop() -> None:
    global _running, _task
    _running = True

    async def _loop() -> None:
        while _running:
            try:
                await prune_sse_events_once()
            except Exception as e:  # noqa: BLE001 — retention loop must survive per-pass failures
                logger.error("sse_retention_error", error=str(e))
            await asyncio.sleep(settings.sse_retention_tick_s)

    _task = asyncio.create_task(_loop())
    logger.info("sse_retention_loop_started", interval_s=settings.sse_retention_tick_s)


async def stop_sse_retention_loop() -> None:
    global _running, _task
    _running = False
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None

