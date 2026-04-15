"""Schedule read endpoints. Write endpoints live in ingestion."""
from fastapi import APIRouter
from src.graph import store

router = APIRouter(prefix="/api/schedules")


@router.get("")
async def list_schedules(source_id: str | None = None):
    pool = store._pool
    async with pool.acquire() as conn:
        if source_id:
            rows = await conn.fetch(
                """SELECT id, source_id::text, interval_minutes, config_overrides, enabled,
                          last_run_at::text, next_run_at::text, created_at::text
                   FROM sync_schedules WHERE source_id=$1::uuid ORDER BY id""",
                source_id,
            )
        else:
            rows = await conn.fetch(
                """SELECT id, source_id::text, interval_minutes, config_overrides, enabled,
                          last_run_at::text, next_run_at::text, created_at::text
                   FROM sync_schedules ORDER BY id"""
            )
    return [dict(r) for r in rows]
