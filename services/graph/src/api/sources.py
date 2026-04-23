import base64
import binascii

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from substrate_common import NotFoundError, ValidationError

from src.api.auth import require_user_sub
from src.api.json_fields import normalize_row_json_fields
from src.graph import store

router = APIRouter(prefix="/api/sources")


class SourceCreate(BaseModel):
    source_type: str = "github_repo"
    owner: str
    name: str
    url: str
    config: dict = {}


class SourcePatch(BaseModel):
    config: dict | None = None
    enabled: bool | None = None


def _encode_cursor(updated_at: str, sid: str) -> str:
    return base64.b64encode(f"{updated_at}|{sid}".encode()).decode()


def _decode_cursor(cur: str) -> tuple[str, str]:
    try:
        parts = base64.b64decode(cur.encode()).decode().split("|", 1)
        if len(parts) != 2:
            raise ValueError("malformed cursor")
        return parts[0], parts[1]
    except (binascii.Error, UnicodeDecodeError, ValueError) as e:
        raise ValidationError(f"invalid cursor: {e}") from e


@router.get("")
async def list_sources(
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    args: list = [user_sub, limit + 1]
    where = "WHERE user_sub = $1"
    if cursor:
        ts, sid = _decode_cursor(cursor)
        where += " AND (updated_at, id) < ($3::timestamptz, $4::uuid)"
        args += [ts, sid]
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id::text, source_type, owner, name, url, default_branch,
                       config, meta, enabled, last_sync_id::text, last_synced_at::text,
                       updated_at::text
                FROM sources {where}
                ORDER BY updated_at DESC, id DESC
                LIMIT $2""",
            *args,
        )
    items = [normalize_row_json_fields(r, "config", "meta") for r in rows[:limit]]
    next_cursor = (
        _encode_cursor(rows[limit]["updated_at"], rows[limit]["id"])
        if len(rows) > limit else None
    )
    return {"items": items, "next_cursor": next_cursor, "total": None}


@router.post("")
async def create_source(req: SourceCreate, user_sub: str = Depends(require_user_sub)):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO sources (user_sub, source_type, owner, name, url, config)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb)
               ON CONFLICT (user_sub, source_type, owner, name) DO UPDATE
                   SET url=EXCLUDED.url, config=EXCLUDED.config, updated_at=now()
               RETURNING id::text""",
            user_sub, req.source_type, req.owner, req.name, req.url, req.config,
        )
    return {"id": row["id"]}


@router.get("/{source_id}")
async def get_source(source_id: str, user_sub: str = Depends(require_user_sub)):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id::text, source_type, owner, name, url, default_branch,
                      config, meta, enabled, last_sync_id::text, last_synced_at::text
               FROM sources WHERE id=$1::uuid AND user_sub = $2""",
            source_id, user_sub,
        )
    if not row:
        raise NotFoundError("source not found")
    return normalize_row_json_fields(row, "config", "meta")


@router.patch("/{source_id}")
async def patch_source(source_id: str, req: SourcePatch, user_sub: str = Depends(require_user_sub)):
    if req.config is None and req.enabled is None:
        raise ValidationError("no fields to update")
    pool = store.get_pool()
    async with pool.acquire() as conn:
        if req.config is not None and req.enabled is not None:
            result = await conn.execute(
                "UPDATE sources SET config=$2::jsonb, enabled=$3, updated_at=now() WHERE id=$1::uuid AND user_sub = $4",
                source_id, req.config, req.enabled, user_sub,
            )
        elif req.config is not None:
            result = await conn.execute(
                "UPDATE sources SET config=$2::jsonb, updated_at=now() WHERE id=$1::uuid AND user_sub = $3",
                source_id, req.config, user_sub,
            )
        else:
            result = await conn.execute(
                "UPDATE sources SET enabled=$2, updated_at=now() WHERE id=$1::uuid AND user_sub = $3",
                source_id, req.enabled, user_sub,
            )
    if result != "UPDATE 1":
        raise NotFoundError("source not found")
    return {"status": "ok"}


@router.delete("/{source_id}")
async def delete_source(source_id: str, user_sub: str = Depends(require_user_sub)):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM sources WHERE id=$1::uuid AND user_sub = $2",
            source_id, user_sub,
        )
    if result != "DELETE 1":
        raise NotFoundError("source not found")
    return {"status": "deleted"}
