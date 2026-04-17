import asyncio
import json
import structlog
from src import graph_writer, sync_schedules
from src.sync_runs import ensure_active_sync, clean_sync_impl
from src.config import settings

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


# ---------------------------------------------------------------------------
# Retention cron — second independent loop (1h cadence)
# ---------------------------------------------------------------------------

# ADVISORY_LOCK_IDS (reserved, do not reuse):
#   RETENTION_LOCK_ID = 4839128734291750819  — retention pruning loop
RETENTION_LOCK_ID = 4839128734291750819

_retention_running = False
_retention_task: asyncio.Task | None = None


_CANDIDATE_QUERY = """
WITH per_source_settings AS (
  SELECT
    id AS source_id,
    COALESCE((config->'retention'->>'age_days')::int,        $1) AS age_days,
    COALESCE((config->'retention'->>'per_source_cap')::int,  $2) AS per_source_cap,
    COALESCE((config->'retention'->>'never_prune')::bool,    false) AS never_prune
  FROM sources
),
ranked AS (
  SELECT
    sr.id, sr.source_id, sr.completed_at,
    ROW_NUMBER() OVER (PARTITION BY sr.source_id ORDER BY sr.completed_at DESC NULLS LAST) AS rank,
    pss.age_days, pss.per_source_cap, pss.never_prune
  FROM sync_runs sr
  JOIN per_source_settings pss ON pss.source_id = sr.source_id
  WHERE sr.status = 'completed'  -- failed/cancelled rows excluded: they consume no graph data, keep for debugging
)
SELECT id::text FROM ranked
WHERE NOT never_prune
  AND (rank > per_source_cap OR completed_at < now() - make_interval(days => age_days))
"""


async def prune_retention_once() -> None:
    """One retention tick.

    Kill switch: settings.retention_enabled. Concurrency: pg_try_advisory_lock.
    Calls clean_sync_impl (idempotent) on each candidate.
    """
    if not settings.retention_enabled:
        return
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        locked = await conn.fetchval("SELECT pg_try_advisory_lock($1)", RETENTION_LOCK_ID)
        if not locked:
            logger.debug("retention_skip_locked")
            return
        try:
            rows = await conn.fetch(
                _CANDIDATE_QUERY,
                settings.retention_age_days,
                settings.retention_per_source_cap,
            )
            candidates = [r["id"] for r in rows]
            logger.info("retention_tick_started", candidates_found=len(candidates))
            cleaned = 0
            for sync_id in candidates:
                await clean_sync_impl(conn, sync_id)
                cleaned += 1
            logger.info("retention_tick_completed", cleaned=cleaned)
        finally:
            await conn.fetchval("SELECT pg_advisory_unlock($1)", RETENTION_LOCK_ID)


async def start_retention_loop() -> None:
    global _retention_running, _retention_task
    _retention_running = True

    async def _loop():
        while _retention_running:
            try:
                await prune_retention_once()
            except Exception as e:
                logger.error("retention_error", error=str(e))
            await asyncio.sleep(settings.retention_tick_interval_s)

    _retention_task = asyncio.create_task(_loop())
    logger.info("retention_loop_started", interval_s=settings.retention_tick_interval_s)


async def stop_retention_loop() -> None:
    global _retention_running, _retention_task
    _retention_running = False
    if _retention_task is not None:
        _retention_task.cancel()
        try:
            await _retention_task
        except asyncio.CancelledError:
            pass
        _retention_task = None
