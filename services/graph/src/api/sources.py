import base64
import binascii
import json

from fastapi import APIRouter, Query
from pydantic import BaseModel

from substrate_common import NotFoundError, ValidationError

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
async def list_sources(limit: int = Query(25, le=100), cursor: str | None = None):
    pool = store.get_pool()
    args = [limit + 1]
    where = ""
    if cursor:
        ts, sid = _decode_cursor(cursor)
        where = "WHERE (updated_at, id) < ($2::timestamptz, $3::uuid)"
        args += [ts, sid]
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT id::text, source_type, owner, name, url, default_branch,
                       config, enabled, last_sync_id::text, last_synced_at::text,
                       updated_at::text
                FROM sources {where}
                ORDER BY updated_at DESC, id DESC
                LIMIT $1""",
            *args,
        )
    items = [dict(r) for r in rows[:limit]]
    next_cursor = (
        _encode_cursor(rows[limit]["updated_at"], rows[limit]["id"])
        if len(rows) > limit else None
    )
    return {"items": items, "next_cursor": next_cursor, "total": None}


@router.post("")
async def create_source(req: SourceCreate):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO sources (source_type, owner, name, url, config)
               VALUES ($1, $2, $3, $4, $5::jsonb)
               ON CONFLICT (source_type, owner, name) DO UPDATE
                   SET url=EXCLUDED.url, config=EXCLUDED.config, updated_at=now()
               RETURNING id::text""",
            req.source_type, req.owner, req.name, req.url, json.dumps(req.config),
        )
    return {"id": row["id"]}


@router.get("/{source_id}")
async def get_source(source_id: str):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id::text, source_type, owner, name, url, default_branch,
                      config, enabled, last_sync_id::text, last_synced_at::text
               FROM sources WHERE id=$1::uuid""",
            source_id,
        )
    if not row:
        raise NotFoundError("source not found")
    return dict(row)


@router.patch("/{source_id}")
async def patch_source(source_id: str, req: SourcePatch):
    if req.config is None and req.enabled is None:
        raise ValidationError("no fields to update")
    pool = store.get_pool()
    async with pool.acquire() as conn:
        if req.config is not None and req.enabled is not None:
            result = await conn.execute(
                "UPDATE sources SET config=$2::jsonb, enabled=$3, updated_at=now() WHERE id=$1::uuid",
                source_id, json.dumps(req.config), req.enabled,
            )
        elif req.config is not None:
            result = await conn.execute(
                "UPDATE sources SET config=$2::jsonb, updated_at=now() WHERE id=$1::uuid",
                source_id, json.dumps(req.config),
            )
        else:
            result = await conn.execute(
                "UPDATE sources SET enabled=$2, updated_at=now() WHERE id=$1::uuid",
                source_id, req.enabled,
            )
    if result != "UPDATE 1":
        raise NotFoundError("source not found")
    return {"status": "ok"}


@router.delete("/{source_id}")
async def delete_source(source_id: str):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute("DELETE FROM sources WHERE id=$1::uuid", source_id)
    if result != "DELETE 1":
        raise NotFoundError("source not found")
    return {"status": "deleted"}
