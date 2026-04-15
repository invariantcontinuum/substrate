import asyncio
import json
import structlog
from src import graph_writer, sync_schedules
from src.sync_runs import ensure_active_sync

logger = structlog.get_logger()

_running = False
_loop_task: asyncio.Task | None = None
POLL_INTERVAL_S = 30


async def claim_due_schedules_once() -> None:
    """Process one scheduler tick: claim due schedules and create sync runs.

    Exposed as a named function so tests can invoke a single tick in isolation.
    Uses ensure_active_sync so concurrent user-triggered syncs are handled
    atomically without raising or creating duplicate rows.

    Requires graph_writer.connect() to have been called first so the module-level
    pool is available. Exposed as a public entry point so tests can run one tick
    without touching the scheduler loop.
    """
    pool = graph_writer.get_pool()
    due = await sync_schedules.claim_due_schedules()
    for sched in due:
        source_id = sched["source_id"]
        raw_overrides = sched.get("config_overrides") or {}
        # asyncpg decodes JSONB to dict by default; the str branch guards
        # against a misconfigured codec returning the raw string.
        config_overrides = raw_overrides if isinstance(raw_overrides, dict) else json.loads(raw_overrides or "{}")
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT config FROM sources WHERE id=$1::uuid", source_id)
            raw_config = (row["config"] if row else None) or {}
            base_config = raw_config if isinstance(raw_config, dict) else json.loads(raw_config or "{}")
            merged = {**base_config, **config_overrides}
            sync_id, created = await ensure_active_sync(
                conn,
                source_id=source_id,
                config_snapshot=merged,
                triggered_by="schedule",
                schedule_id=sched["id"],
            )
            if not created:
                logger.info(
                    "scheduler_sync_already_active",
                    source_id=str(source_id),
                    existing_sync_id=sync_id,
                    schedule_id=sched["id"],
                )


async def _tick() -> None:
    await claim_due_schedules_once()


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
