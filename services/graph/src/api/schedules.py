"""Schedule read endpoints. Write endpoints live in ingestion."""
from fastapi import APIRouter, Depends

from src.api.auth import require_user_sub
from src.api.json_fields import normalize_row_json_fields
from src.graph import store

router = APIRouter(prefix="/api/schedules")


@router.get("")
async def list_schedules(
    source_id: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        if source_id:
            rows = await conn.fetch(
                """SELECT sch.id, sch.source_id::text, sch.interval_minutes, sch.config_overrides, sch.enabled,
                          sch.last_run_at::text, sch.next_run_at::text, sch.created_at::text
                   FROM sync_schedules sch
                   JOIN sources s ON s.id = sch.source_id
                   WHERE sch.source_id=$1::uuid AND s.user_sub = $2
                   ORDER BY sch.id""",
                source_id, user_sub,
            )
        else:
            rows = await conn.fetch(
                """SELECT sch.id, sch.source_id::text, sch.interval_minutes, sch.config_overrides, sch.enabled,
                          sch.last_run_at::text, sch.next_run_at::text, sch.created_at::text
                   FROM sync_schedules sch
                   JOIN sources s ON s.id = sch.source_id
                   WHERE s.user_sub = $1
                   ORDER BY sch.id""",
                user_sub,
            )
    return [normalize_row_json_fields(r, "config_overrides") for r in rows]
