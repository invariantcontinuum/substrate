from datetime import datetime, timedelta, timezone
from src import graph_writer



async def list_schedules(source_id: str | None = None) -> list[dict]:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        if source_id:
            rows = await conn.fetch(
                "SELECT * FROM sync_schedules WHERE source_id=$1::uuid ORDER BY id", source_id
            )
        else:
            rows = await conn.fetch("SELECT * FROM sync_schedules ORDER BY id")
    return [dict(r) for r in rows]


async def create_schedule(
    source_id: str,
    interval_minutes: int,
    config_overrides: dict,
    user_sub: str,
) -> dict | None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO sync_schedules (source_id, interval_minutes, config_overrides, next_run_at)
               SELECT s.id, $2, $3::jsonb, now()
               FROM sources s
               WHERE s.id = $1::uuid AND s.user_sub = $4
               ON CONFLICT (source_id, interval_minutes) DO UPDATE
                   SET config_overrides=$3::jsonb, enabled=true
               RETURNING *""",
            source_id, interval_minutes, config_overrides, user_sub,
        )
    return dict(row) if row else None


async def update_schedule(schedule_id: int, interval_minutes: int | None,
                           enabled: bool | None,
                           config_overrides: dict | None,
                           user_sub: str) -> dict | None:
    pool = graph_writer.get_pool()
    if interval_minutes is None and enabled is None and config_overrides is None:
        return None
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE sync_schedules sch
            SET interval_minutes = COALESCE($1, sch.interval_minutes),
                enabled = COALESCE($2, sch.enabled),
                config_overrides = COALESCE($3::jsonb, sch.config_overrides)
            FROM sources s
            WHERE sch.source_id = s.id
              AND sch.id = $4
              AND s.user_sub = $5
            RETURNING sch.*
            """,
            interval_minutes,
            enabled,
            config_overrides,
            schedule_id,
            user_sub,
        )
    return dict(row) if row else None


async def delete_schedule(schedule_id: int, user_sub: str) -> bool:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            DELETE FROM sync_schedules sch
            USING sources s
            WHERE sch.source_id = s.id
              AND sch.id = $1
              AND s.user_sub = $2
            """,
            schedule_id,
            user_sub,
        )
    return result == "DELETE 1"


async def claim_due_schedules() -> list[dict]:
    """Atomically fetch+advance schedules whose next_run_at is past.

    Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction so two
    scheduler workers can't double-claim the same row.
    """
    pool = graph_writer.get_pool()
    now = datetime.now(timezone.utc)
    async with pool.acquire() as conn:
        async with conn.transaction():
            rows = await conn.fetch(
                """SELECT * FROM sync_schedules
                   WHERE enabled = true AND (next_run_at IS NULL OR next_run_at <= $1)
                   FOR UPDATE SKIP LOCKED""",
                now,
            )
            for r in rows:
                await conn.execute(
                    "UPDATE sync_schedules SET last_run_at=$1, next_run_at=$2 WHERE id=$3",
                    now, now + timedelta(minutes=r["interval_minutes"]), r["id"],
                )
    return [dict(r) for r in rows]
