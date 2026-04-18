import json
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


async def create_schedule(source_id: str, interval_minutes: int,
                           config_overrides: dict) -> dict:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO sync_schedules (source_id, interval_minutes, config_overrides, next_run_at)
               VALUES ($1::uuid, $2, $3::jsonb, now())
               ON CONFLICT (source_id, interval_minutes) DO UPDATE
                   SET config_overrides=$3::jsonb, enabled=true
               RETURNING *""",
            source_id, interval_minutes, json.dumps(config_overrides),
        )
    return dict(row)


async def update_schedule(schedule_id: int, interval_minutes: int | None,
                           enabled: bool | None,
                           config_overrides: dict | None) -> dict | None:
    pool = graph_writer.get_pool()
    sets: list[str] = []
    args: list = []
    if interval_minutes is not None:
        sets.append(f"interval_minutes=${len(args)+1}")
        args.append(interval_minutes)
    if enabled is not None:
        sets.append(f"enabled=${len(args)+1}")
        args.append(enabled)
    if config_overrides is not None:
        sets.append(f"config_overrides=${len(args)+1}::jsonb")
        args.append(json.dumps(config_overrides))
    if not sets:
        return None
    args.append(schedule_id)
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"UPDATE sync_schedules SET {', '.join(sets)} WHERE id=${len(args)} RETURNING *",
            *args,
        )
    return dict(row) if row else None


async def delete_schedule(schedule_id: int) -> None:
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_schedules WHERE id=$1", schedule_id)


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
