"""Sync read endpoints. Write endpoints live in ingestion."""
import base64
import binascii

from fastapi import APIRouter, Depends, Query

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub
from src.api.json_fields import normalize_row_json_fields
from src.graph import store

router = APIRouter(prefix="/api/syncs")


def _encode_cursor(ts: str, sid: str) -> str:
    return base64.b64encode(f"{ts}|{sid}".encode()).decode()


def _decode_cursor(cur: str) -> tuple[str, str]:
    try:
        parts = base64.b64decode(cur.encode()).decode().split("|", 1)
        if len(parts) != 2:
            raise ValueError("malformed cursor")
        return parts[0], parts[1]
    except (binascii.Error, UnicodeDecodeError, ValueError) as e:
        raise ValidationError(f"invalid cursor: {e}") from e


@router.get("")
async def list_syncs(
    source_id: str | None = None,
    status: str | None = None,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    where_parts: list[str] = ["s.user_sub = $1"]
    args: list = [user_sub, limit + 1]
    if source_id:
        where_parts.append(f"sr.source_id = ${len(args)+1}::uuid")
        args.append(source_id)
    if status:
        where_parts.append(f"sr.status = ${len(args)+1}")
        args.append(status)
    if cursor:
        ts, sid = _decode_cursor(cursor)
        where_parts.append(
            f"(coalesce(sr.completed_at, sr.created_at), sr.id) < (${len(args)+1}::timestamptz, ${len(args)+2}::uuid)"
        )
        args += [ts, sid]
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT sr.id::text, sr.source_id::text, sr.status, sr.ref,
                       sr.progress_done, sr.progress_total, sr.progress_meta,
                       sr.stats, sr.schedule_id, sr.triggered_by,
                       sr.started_at::text, sr.completed_at::text, sr.created_at::text
                FROM sync_runs sr
                JOIN sources s ON s.id = sr.source_id
                {where}
                ORDER BY coalesce(sr.completed_at, sr.created_at) DESC, sr.id DESC
                LIMIT $2""",
            *args,
        )
    items = [
        normalize_row_json_fields(
            r,
            "config_snapshot",
            "progress_meta",
            "stats",
        )
        for r in rows[:limit]
    ]
    next_cursor = (
        _encode_cursor(
            (rows[limit]["completed_at"] or rows[limit]["created_at"]),
            rows[limit]["id"],
        ) if len(rows) > limit else None
    )
    return {"items": items, "next_cursor": next_cursor, "total": None}


@router.get("/{sync_id}")
async def get_sync(sync_id: str, user_sub: str = Depends(require_user_sub)):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT sr.id::text, sr.source_id::text, sr.status, sr.ref, sr.config_snapshot,
                      sr.progress_done, sr.progress_total, sr.progress_meta, sr.stats,
                      sr.schedule_id, sr.triggered_by, sr.started_at::text,
                      sr.completed_at::text, sr.created_at::text
               FROM sync_runs sr
               JOIN sources s ON s.id = sr.source_id
               WHERE sr.id=$1::uuid AND s.user_sub = $2""",
            sync_id, user_sub,
        )
    if not row:
        raise NotFoundError("sync not found")
    return normalize_row_json_fields(row, "config_snapshot", "progress_meta", "stats")


@router.get("/{sync_id}/issues")
async def list_issues(
    sync_id: str,
    level: str | None = None,
    phase: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    where_parts: list[str] = ["i.sync_id=$1::uuid", "s.user_sub = $2"]
    args: list = [sync_id, user_sub]
    if level:
        where_parts.append(f"level=${len(args)+1}")
        args.append(level)
    if phase:
        where_parts.append(f"phase=${len(args)+1}")
        args.append(phase)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT i.id, i.level, i.phase, i.code, i.message, i.context, i.occurred_at::text
                FROM sync_issues i
                JOIN sync_runs sr ON sr.id = i.sync_id
                JOIN sources s ON s.id = sr.source_id
                WHERE {' AND '.join(where_parts)}
                ORDER BY i.occurred_at DESC""",
            *args,
        )
    return [normalize_row_json_fields(r, "context") for r in rows]
