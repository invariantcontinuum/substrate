import asyncio
from datetime import datetime, timezone, timedelta
import structlog
from src.db import get_pool
from src.schema import SyncSchedule

logger = structlog.get_logger()

_running = False


async def get_schedules() -> list[SyncSchedule]:
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM sync_schedules ORDER BY id")
    return [SyncSchedule(
        id=r["id"], owner=r["owner"], repo=r["repo"],
        interval_minutes=r["interval_minutes"], enabled=r["enabled"],
        last_run=r["last_run"], next_run=r["next_run"],
    ) for r in rows]


async def upsert_schedule(owner: str, repo: str, interval_minutes: int, enabled: bool) -> SyncSchedule:
    pool = await get_pool()
    row = await pool.fetchrow(
        """INSERT INTO sync_schedules (owner, repo, interval_minutes, enabled, next_run)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (owner, repo) DO UPDATE
           SET interval_minutes = $3, enabled = $4
           RETURNING *""",
        owner, repo, interval_minutes, enabled,
    )
    return SyncSchedule(
        id=row["id"], owner=row["owner"], repo=row["repo"],
        interval_minutes=row["interval_minutes"], enabled=row["enabled"],
        last_run=row["last_run"], next_run=row["next_run"],
    )


async def delete_schedule(schedule_id: int) -> None:
    pool = await get_pool()
    await pool.execute("DELETE FROM sync_schedules WHERE id = $1", schedule_id)


async def toggle_schedule(schedule_id: int) -> SyncSchedule | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE sync_schedules SET enabled = NOT enabled WHERE id = $1 RETURNING *",
        schedule_id,
    )
    if not row:
        return None
    return SyncSchedule(
        id=row["id"], owner=row["owner"], repo=row["repo"],
        interval_minutes=row["interval_minutes"], enabled=row["enabled"],
        last_run=row["last_run"], next_run=row["next_run"],
    )


async def start_scheduler(sync_fn) -> None:
    global _running
    _running = True

    async def _loop():
        while _running:
            try:
                pool = await get_pool()
                now = datetime.now(timezone.utc)
                due = await pool.fetch(
                    "SELECT * FROM sync_schedules WHERE enabled = true AND (next_run IS NULL OR next_run <= $1)",
                    now,
                )
                for row in due:
                    logger.info("scheduled_sync", owner=row["owner"], repo=row["repo"])
                    try:
                        await sync_fn(row["owner"], row["repo"])
                    except Exception as e:
                        logger.error("scheduled_sync_failed", error=str(e))
                    next_run = now + timedelta(minutes=row["interval_minutes"])
                    await pool.execute(
                        "UPDATE sync_schedules SET last_run = $1, next_run = $2 WHERE id = $3",
                        now, next_run, row["id"],
                    )
            except Exception as e:
                logger.error("scheduler_error", error=str(e))
            await asyncio.sleep(30)

    asyncio.create_task(_loop())
    logger.info("scheduler_started")


async def stop_scheduler() -> None:
    global _running
    _running = False
