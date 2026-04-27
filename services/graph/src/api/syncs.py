"""Sync read endpoints. Write endpoints live in ingestion (with the one
exception below: POST /{id}/resync creates a child sync row with the
parent's resume_cursor, then ingestion's pending-sync runner picks it up
via the existing job loop)."""
import base64
import binascii
import json as _json
from typing import Any
from uuid import UUID

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
                       sr.started_at::text, sr.completed_at::text, sr.created_at::text,
                       sr.resume_cursor, sr.parent_sync_id::text
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
            "resume_cursor",
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
                      sr.completed_at::text, sr.created_at::text,
                      sr.resume_cursor, sr.parent_sync_id::text
               FROM sync_runs sr
               JOIN sources s ON s.id = sr.source_id
               WHERE sr.id=$1::uuid AND s.user_sub = $2""",
            sync_id, user_sub,
        )
    if not row:
        raise NotFoundError("sync not found")
    return normalize_row_json_fields(row, "config_snapshot", "progress_meta", "stats", "resume_cursor")


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


@router.get("/{sync_id}/delta")
async def get_sync_delta(
    sync_id: str, user_sub: str = Depends(require_user_sub),
) -> dict[str, object]:
    """Delta between this sync's final stats and the nearest prior completed
    sync on the same source. Returns ``{"delta": null}`` when no prior run
    exists — caller should render a "baseline" row rather than a delta chip.

    The comparison uses ``completed_at`` for ordering (wall-clock), not
    ``created_at``, so a re-queued older run that completes after a newer
    one does not become "prior" to it."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        this_row = await conn.fetchrow(
            "SELECT sr.id::text, sr.source_id::text, sr.stats, "
            "       sr.completed_at "
            "FROM sync_runs sr JOIN sources s ON s.id = sr.source_id "
            "WHERE sr.id = $1::uuid AND s.user_sub = $2",
            sync_id, user_sub,
        )
        if not this_row:
            raise NotFoundError(f"sync {sync_id} not found")

        prior = None
        if this_row["completed_at"] is not None:
            prior = await conn.fetchrow(
                "SELECT id::text, stats, completed_at::text AS completed_at "
                "FROM sync_runs "
                "WHERE source_id = $1::uuid "
                "  AND id::text <> $2 "
                "  AND status = 'completed' "
                "  AND completed_at < $3 "
                "ORDER BY completed_at DESC LIMIT 1",
                this_row["source_id"], sync_id, this_row["completed_at"],
            )

    if not prior:
        return {
            "prior_sync_id": None,
            "prior_completed_at": None,
            "delta": None,
        }

    this_stats = this_row["stats"] or {}
    prior_stats = prior["stats"] or {}
    if isinstance(this_stats, str):
        this_stats = _json.loads(this_stats)
    if isinstance(prior_stats, str):
        prior_stats = _json.loads(prior_stats)
    if not isinstance(this_stats, dict):
        this_stats = {}
    if not isinstance(prior_stats, dict):
        prior_stats = {}

    def _get(obj: dict, *path: str, default: float = 0) -> float:
        cur: object = obj
        for p in path:
            if not isinstance(cur, dict):
                return default
            cur = cur.get(p, {} if p != path[-1] else default)
        return cur if isinstance(cur, (int, float)) else default

    delta = {
        "node_count": _get(this_stats, "counts", "node_count")
                    - _get(prior_stats, "counts", "node_count"),
        "edge_count": _get(this_stats, "counts", "edge_count")
                    - _get(prior_stats, "counts", "edge_count"),
        "files_indexed": _get(this_stats, "counts", "files_indexed")
                       - _get(prior_stats, "counts", "files_indexed"),
        "community_count": _get(this_stats, "leiden", "count")
                         - _get(prior_stats, "leiden", "count"),
        "modularity": round(
            _get(this_stats, "leiden", "modularity")
            - _get(prior_stats, "leiden", "modularity"),
            6,
        ),
        "storage_bytes": (
            _get(this_stats, "storage", "graph_bytes")
            + _get(this_stats, "storage", "embedding_bytes")
        ) - (
            _get(prior_stats, "storage", "graph_bytes")
            + _get(prior_stats, "storage", "embedding_bytes")
        ),
    }
    return {
        "prior_sync_id": prior["id"],
        "prior_completed_at": prior["completed_at"],
        "delta": delta,
    }


@router.post("/{sync_id}/resync")
async def resync_sync(
    sync_id: UUID,
    user_sub: str = Depends(require_user_sub),
) -> dict[str, Any]:
    """Create a child sync that resumes a failed or cancelled parent.
    Rejected with 422 if the parent succeeded or never wrote a cursor.
    Authz: 404 if the parent is owned by another user (anti-enumeration).
    The new sync row inherits the parent's resume_cursor — ingestion's
    pending-sync runner picks it up via the existing job loop."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        parent = await conn.fetchrow(
            """
            SELECT r.id, r.status, r.resume_cursor, r.source_id
            FROM sync_runs r
            JOIN sources s ON s.id = r.source_id
            WHERE r.id = $1 AND s.user_sub = $2
            """,
            sync_id, user_sub,
        )
        if not parent:
            raise NotFoundError("sync not found")
        if parent["status"] not in {"failed", "cancelled"}:
            status_value = parent["status"]
            raise ValidationError(
                f"cannot resync a {status_value} sync — only failed "
                "or cancelled syncs may be resumed",
            )
        if parent["resume_cursor"] is None:
            raise ValidationError(
                "parent sync has no resume cursor; start a fresh sync",
            )
        child = await conn.fetchrow(
            """
            INSERT INTO sync_runs
              (source_id, status, parent_sync_id, resume_cursor)
            VALUES ($1, 'pending', $2, $3)
            RETURNING id::text AS id, source_id::text AS source_id,
                      status, parent_sync_id::text AS parent_sync_id,
                      resume_cursor, started_at
            """,
            parent["source_id"], sync_id, parent["resume_cursor"],
        )
    return dict(child)

