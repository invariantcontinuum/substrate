"""Polls sync_runs for pending rows and dispatches handle_sync."""
import asyncio
import structlog
from src import graph_writer, sync_runs
from src.jobs.sync import handle_sync

logger = structlog.get_logger()

_running = False
POLL_INTERVAL_S = 2.0


async def _fetch_pending() -> list[dict]:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT sr.id::text AS sync_id, sr.config_snapshot,
                      s.id::text AS source_id, s.source_type, s.owner, s.name, s.url
               FROM sync_runs sr
               JOIN sources s ON s.id = sr.source_id
               WHERE sr.status = 'pending'
               ORDER BY sr.created_at
               LIMIT 5"""
        )
    return [dict(r) for r in rows]


async def start_runner() -> None:
    global _running
    _running = True

    async def _loop():
        while _running:
            try:
                pending = await _fetch_pending()
                for r in pending:
                    source = {
                        "id": r["source_id"], "source_type": r["source_type"],
                        "owner": r["owner"], "name": r["name"], "url": r["url"],
                    }
                    config_snapshot = r["config_snapshot"] if isinstance(r["config_snapshot"], dict) else {}
                    asyncio.create_task(handle_sync(r["sync_id"], source, config_snapshot))
            except Exception as e:
                logger.error("runner_loop_error", error=str(e))
            await asyncio.sleep(POLL_INTERVAL_S)

    asyncio.create_task(_loop())
    logger.info("runner_started")


async def stop_runner() -> None:
    global _running
    _running = False
