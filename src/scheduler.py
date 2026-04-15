import asyncio
import structlog
import asyncpg
from src import graph_writer, sync_schedules, sync_runs

logger = structlog.get_logger()

_running = False
_loop_task: asyncio.Task | None = None
POLL_INTERVAL_S = 30


async def _tick() -> None:
    pool = graph_writer.get_pool()
    due = await sync_schedules.claim_due_schedules()
    for sched in due:
        source_id = sched["source_id"]
        config_overrides = sched.get("config_overrides") or {}
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT config FROM sources WHERE id=$1::uuid", source_id)
        base_config = (row["config"] if isinstance(row["config"], dict) else {}) if row else {}
        merged = {**base_config, **config_overrides}
        try:
            await sync_runs.create_sync_run(source_id, merged, "schedule", schedule_id=sched["id"])
        except asyncpg.UniqueViolationError:
            logger.info("schedule_skipped_active_sync", source_id=str(source_id), schedule_id=sched["id"])


async def start_scheduler() -> None:
    global _running, _loop_task
    _running = True

    async def _loop():
        while _running:
            try:
                await _tick()
            except Exception as e:
                logger.error("scheduler_error", error=str(e))
            await asyncio.sleep(POLL_INTERVAL_S)

    _loop_task = asyncio.create_task(_loop())
    logger.info("scheduler_started")


async def stop_scheduler() -> None:
    global _running, _loop_task
    _running = False
    if _loop_task is not None:
        _loop_task.cancel()
        try:
            await _loop_task
        except asyncio.CancelledError:
            pass
        _loop_task = None
    logger.info("scheduler_stopped")
