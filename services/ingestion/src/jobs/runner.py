"""Polls sync_runs for pending rows and dispatches handle_sync."""
import asyncio
import structlog
from src import graph_writer
from src.config import settings
from src.jobs.sync import handle_sync
from src.json_utils import json_object

logger = structlog.get_logger()

_running = False
_loop_task: asyncio.Task | None = None
_in_flight: set[asyncio.Task] = set()
_in_flight_sync_ids: set[str] = set()


def _release_task(task: asyncio.Task, sync_id: str) -> None:
    _in_flight.discard(task)
    _in_flight_sync_ids.discard(sync_id)


async def _fetch_pending(limit: int) -> list[dict]:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT sr.id::text AS sync_id, sr.config_snapshot,
                      s.id::text AS source_id, s.source_type, s.owner, s.name, s.url
               FROM sync_runs sr
               JOIN sources s ON s.id = sr.source_id
               WHERE sr.status = 'pending'
               ORDER BY sr.created_at
               LIMIT $1""",
            limit,
        )
    return [dict(r) for r in rows]


async def start_runner() -> None:
    global _running, _loop_task
    _running = True

    async def _loop():
        while _running:
            try:
                pending = await _fetch_pending(settings.runner_claim_batch_size)
                for r in pending:
                    sync_id = r["sync_id"]
                    if sync_id in _in_flight_sync_ids:
                        continue
                    source = {
                        "id": r["source_id"], "source_type": r["source_type"],
                        "owner": r["owner"], "name": r["name"], "url": r["url"],
                    }
                    config_snapshot = json_object(r["config_snapshot"])
                    task = asyncio.create_task(handle_sync(sync_id, source, config_snapshot))
                    _in_flight.add(task)
                    _in_flight_sync_ids.add(sync_id)
                    task.add_done_callback(
                        lambda done, sid=sync_id: _release_task(done, sid)
                    )
            except Exception as e:  # noqa: BLE001 — runner poll loop must survive per-iteration failures
                logger.error("runner_loop_error", error=str(e))
            await asyncio.sleep(settings.runner_poll_interval_s)

    _loop_task = asyncio.create_task(_loop())
    logger.info("runner_started")


async def stop_runner() -> None:
    """Stop polling, then await in-flight syncs (with timeout)."""
    global _running, _loop_task
    _running = False
    if _loop_task is not None:
        _loop_task.cancel()
        try:
            await _loop_task
        except asyncio.CancelledError:
            pass
        _loop_task = None
    if _in_flight:
        logger.info("runner_awaiting_in_flight", count=len(_in_flight))
        try:
            await asyncio.wait_for(
                asyncio.gather(*_in_flight, return_exceptions=True),
                timeout=settings.runner_shutdown_timeout_s,
            )
        except asyncio.TimeoutError:
            logger.warning("runner_in_flight_timeout", remaining=len(_in_flight))
            for task in list(_in_flight):
                task.cancel()
            # Give cancellations a moment to propagate; ignore exceptions
            await asyncio.gather(*_in_flight, return_exceptions=True)
    logger.info("runner_stopped")
