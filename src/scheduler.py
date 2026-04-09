import asyncio
import json
from datetime import datetime, timezone, timedelta
import structlog
from src.db import get_pool
from src.schema import JobSchedule

logger = structlog.get_logger()

_running = False


async def get_schedules() -> list[JobSchedule]:
    pool = await get_pool()
    rows = await pool.fetch("SELECT * FROM job_schedules ORDER BY id")
    return [JobSchedule(
        id=r["id"], job_type=r["job_type"], owner=r.get("owner", ""), repo=r.get("repo", ""),
        interval_minutes=r["interval_minutes"], enabled=r["enabled"],
        scope=r.get("scope", {}) if isinstance(r.get("scope"), dict) else {},
        last_run=r["last_run"], next_run=r["next_run"],
    ) for r in rows]


async def upsert_schedule(job_type: str, owner: str, repo: str, interval_minutes: int, scope: dict) -> JobSchedule:
    pool = await get_pool()
    scope_json = json.dumps(scope) if scope else "{}"
    row = await pool.fetchrow(
        """INSERT INTO job_schedules (job_type, owner, repo, interval_minutes, scope, next_run)
           VALUES ($1, $2, $3, $4, $5::jsonb, now())
           ON CONFLICT (job_type, owner, repo) DO UPDATE
           SET interval_minutes = $4, scope = $5::jsonb, enabled = true
           RETURNING *""",
        job_type, owner, repo, interval_minutes, scope_json,
    )
    return JobSchedule(
        id=row["id"], job_type=row["job_type"], owner=row.get("owner", ""), repo=row.get("repo", ""),
        interval_minutes=row["interval_minutes"], enabled=row["enabled"],
        scope=row.get("scope", {}) if isinstance(row.get("scope"), dict) else {},
        last_run=row["last_run"], next_run=row["next_run"],
    )


async def delete_schedule(schedule_id: int) -> None:
    pool = await get_pool()
    await pool.execute("DELETE FROM job_schedules WHERE id = $1", schedule_id)


async def toggle_schedule(schedule_id: int) -> JobSchedule | None:
    pool = await get_pool()
    row = await pool.fetchrow(
        "UPDATE job_schedules SET enabled = NOT enabled WHERE id = $1 RETURNING *",
        schedule_id,
    )
    if not row:
        return None
    return JobSchedule(
        id=row["id"], job_type=row["job_type"], owner=row.get("owner", ""), repo=row.get("repo", ""),
        interval_minutes=row["interval_minutes"], enabled=row["enabled"],
        scope=row.get("scope", {}) if isinstance(row.get("scope"), dict) else {},
        last_run=row["last_run"], next_run=row["next_run"],
    )


async def start_scheduler(run_job_fn) -> None:
    global _running
    _running = True

    async def _loop():
        while _running:
            try:
                pool = await get_pool()
                now = datetime.now(timezone.utc)
                due = await pool.fetch(
                    "SELECT * FROM job_schedules WHERE enabled = true AND (next_run IS NULL OR next_run <= $1)",
                    now,
                )
                for row in due:
                    logger.info("scheduled_job", job_type=row["job_type"], owner=row.get("owner", ""))
                    try:
                        scope = row.get("scope", {}) or {}
                        if isinstance(scope, str):
                            scope = json.loads(scope)
                        scope["owner"] = row.get("owner", "")
                        scope["repo"] = row.get("repo", "")
                        await run_job_fn(row["job_type"], scope)
                    except Exception as e:
                        logger.error("scheduled_job_failed", error=str(e))
                    next_run = now + timedelta(minutes=row["interval_minutes"])
                    await pool.execute(
                        "UPDATE job_schedules SET last_run = $1, next_run = $2 WHERE id = $3",
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
