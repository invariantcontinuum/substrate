import json

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field

from substrate_common import ValidationError

from src.api.auth import require_user_sub
from src.graph import store

router = APIRouter(prefix="/api/users")


def _role_from_header(x_user_roles: str | None) -> str:
    if not x_user_roles:
        return "viewer"
    roles = [r.strip() for r in x_user_roles.split(",") if r.strip()]
    if "admin" in roles:
        return "admin"
    if "engineer" in roles:
        return "engineer"
    return "viewer"


class UserMePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    preferred_username: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=254)


class DeviceUpsert(BaseModel):
    label: str | None = Field(default=None, max_length=120)
    last_loaded_sync_ids: list[str] = Field(default_factory=list)


async def _touch_profile(
    conn,
    *,
    user_sub: str,
    preferred_username: str | None,
    email: str | None,
    display_name: str | None,
    role: str,
):
    return await conn.fetchrow(
        """
        INSERT INTO user_profiles (
            user_sub,
            preferred_username,
            email,
            display_name,
            role,
            created_at,
            updated_at,
            last_seen_at
        )
        VALUES ($1, $2, $3, $4, $5, now(), now(), now())
        ON CONFLICT (user_sub) DO UPDATE
        SET preferred_username = COALESCE(NULLIF(EXCLUDED.preferred_username, ''), user_profiles.preferred_username),
            email = COALESCE(NULLIF(EXCLUDED.email, ''), user_profiles.email),
            display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), user_profiles.display_name),
            role = COALESCE(NULLIF(EXCLUDED.role, ''), user_profiles.role),
            updated_at = now(),
            last_seen_at = now()
        RETURNING user_sub, preferred_username, email, display_name, role,
                  created_at::text, updated_at::text, last_seen_at::text
        """,
        user_sub,
        preferred_username or "",
        email or "",
        display_name or "",
        role,
    )


def _device_row(row) -> dict:
    context = row["context_meta"]
    if isinstance(context, str):
        context = json.loads(context)
    context = context or {}
    ids = context.get("last_loaded_sync_ids") or []
    if not isinstance(ids, list):
        ids = []
    return {
        "device_id": row["device_id"],
        "label": row["label"] or "",
        "last_loaded_sync_ids": [str(x) for x in ids],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_seen_at": row["last_seen_at"],
    }


@router.get("/me")
async def get_me(
    user_sub: str = Depends(require_user_sub),
    x_user_email: str | None = Header(default=None, alias="X-User-Email"),
    x_user_name: str | None = Header(default=None, alias="X-User-Name"),
    x_user_roles: str | None = Header(default=None, alias="X-User-Roles"),
):
    pool = store.get_pool()
    role = _role_from_header(x_user_roles)
    async with pool.acquire() as conn:
        async with conn.transaction():
            profile = await _touch_profile(
                conn,
                user_sub=user_sub,
                preferred_username=x_user_name,
                email=x_user_email,
                display_name=x_user_name,
                role=role,
            )
            devices = await conn.fetch(
                """
                SELECT device_id, label, context_meta,
                       created_at::text AS created_at,
                       updated_at::text AS updated_at,
                       last_seen_at::text AS last_seen_at
                FROM user_devices
                WHERE user_sub = $1
                ORDER BY last_seen_at DESC, updated_at DESC
                """,
                user_sub,
            )
    return {"profile": dict(profile), "devices": [_device_row(d) for d in devices]}


@router.patch("/me")
async def patch_me(
    patch: UserMePatch,
    user_sub: str = Depends(require_user_sub),
):
    if (
        patch.display_name is None
        and patch.preferred_username is None
        and patch.email is None
    ):
        raise ValidationError("no fields to update")
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE user_profiles
            SET display_name = COALESCE($2, display_name),
                preferred_username = COALESCE($3, preferred_username),
                email = COALESCE($4, email),
                updated_at = now()
            WHERE user_sub = $1
            RETURNING user_sub, preferred_username, email, display_name, role,
                      created_at::text, updated_at::text, last_seen_at::text
            """,
            user_sub,
            patch.display_name,
            patch.preferred_username,
            patch.email,
        )
    if row is None:
        raise ValidationError("user profile missing; call GET /api/users/me first")
    return dict(row)


@router.put("/me/devices/{device_id}")
async def upsert_device(
    device_id: str,
    body: DeviceUpsert,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    context = {"last_loaded_sync_ids": body.last_loaded_sync_ids}
    async with pool.acquire() as conn:
        async with conn.transaction():
            await _touch_profile(
                conn,
                user_sub=user_sub,
                preferred_username=None,
                email=None,
                display_name=None,
                role="viewer",
            )
            row = await conn.fetchrow(
                """
                INSERT INTO user_devices (
                    user_sub, device_id, label, context_meta, created_at, updated_at, last_seen_at
                )
                VALUES ($1, $2, COALESCE($3, ''), $4::jsonb, now(), now(), now())
                ON CONFLICT (user_sub, device_id) DO UPDATE
                SET label = COALESCE(NULLIF(EXCLUDED.label, ''), user_devices.label),
                    context_meta = EXCLUDED.context_meta,
                    updated_at = now(),
                    last_seen_at = now()
                RETURNING device_id, label, context_meta,
                          created_at::text AS created_at,
                          updated_at::text AS updated_at,
                          last_seen_at::text AS last_seen_at
                """,
                user_sub,
                device_id,
                body.label,
                context,
            )
    return _device_row(row)


@router.delete("/me/devices/{device_id}")
async def delete_device(
    device_id: str,
    user_sub: str = Depends(require_user_sub),
):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM user_devices WHERE user_sub = $1 AND device_id = $2",
            user_sub,
            device_id,
        )
    return {"status": "deleted", "deleted": result == "DELETE 1"}
