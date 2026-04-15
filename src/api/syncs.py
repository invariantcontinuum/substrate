"""Sync read endpoints. Write endpoints live in ingestion."""
import base64
import binascii
from fastapi import APIRouter, HTTPException, Query
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
        raise HTTPException(400, f"invalid cursor: {e}")


@router.get("")
async def list_syncs(source_id: str | None = None, status: str | None = None,
                     limit: int = Query(25, le=100), cursor: str | None = None):
    pool = store.get_pool()
    where_parts, args = [], [limit + 1]
    if source_id:
        where_parts.append(f"source_id = ${len(args)+1}::uuid"); args.append(source_id)
    if status:
        where_parts.append(f"status = ${len(args)+1}"); args.append(status)
    if cursor:
        ts, sid = _decode_cursor(cursor)
        where_parts.append(
            f"(coalesce(completed_at, created_at), id) < (${len(args)+1}::timestamptz, ${len(args)+2}::uuid)"
        )
        args += [ts, sid]
    where = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id::text, source_id::text, status, ref,
                       progress_done, progress_total, progress_meta,
                       stats, schedule_id, triggered_by,
                       started_at::text, completed_at::text, created_at::text
                FROM sync_runs {where}
                ORDER BY coalesce(completed_at, created_at) DESC, id DESC
                LIMIT $1""",
            *args,
        )
    items = [dict(r) for r in rows[:limit]]
    next_cursor = (
        _encode_cursor(
            (rows[limit]["completed_at"] or rows[limit]["created_at"]),
            rows[limit]["id"],
        ) if len(rows) > limit else None
    )
    return {"items": items, "next_cursor": next_cursor, "total": None}


@router.get("/{sync_id}")
async def get_sync(sync_id: str):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id::text, source_id::text, status, ref, config_snapshot,
                      progress_done, progress_total, progress_meta, stats,
                      schedule_id, triggered_by, started_at::text,
                      completed_at::text, created_at::text
               FROM sync_runs WHERE id=$1::uuid""", sync_id,
        )
    if not row:
        raise HTTPException(404)
    return dict(row)


@router.get("/{sync_id}/issues")
async def list_issues(sync_id: str, level: str | None = None, phase: str | None = None):
    pool = store.get_pool()
    where_parts, args = ["sync_id=$1::uuid"], [sync_id]
    if level:
        where_parts.append(f"level=${len(args)+1}"); args.append(level)
    if phase:
        where_parts.append(f"phase=${len(args)+1}"); args.append(phase)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id, level, phase, code, message, context, occurred_at::text
                FROM sync_issues WHERE {' AND '.join(where_parts)}
                ORDER BY occurred_at DESC""",
            *args,
        )
    return [dict(r) for r in rows]
