"""User-facing account API: API tokens, password change, 2FA, profile
PATCH, and avatar upload/serve/delete.

This module is the single place where the gateway holds *direct* domain
logic instead of proxying to ``graph``/``ingestion``. The reason is that
every route here is tied to *authentication itself*:

* ``POST/GET/DELETE /api/users/me/api-tokens`` mint, list, and revoke
  personal access tokens (PATs). The bearer-auth fast-path in
  ``main._authenticate`` looks PATs up by sha256 hash, so a round-trip
  to graph would be one extra hop on every authenticated request.
* ``POST /api/users/me/password`` forwards the user's bearer JWT to
  the Keycloak account API at
  ``{keycloak_url}/realms/{realm}/account/credentials/password``.
* ``POST /api/users/me/2fa/setup`` mints a TOTP secret, generates the
  QR code locally (no external service ever sees the secret), and
  returns the otpauth URL plus a ``data:image/png;base64,...`` blob.
  ``POST /api/users/me/2fa/verify`` validates a user-supplied code and,
  on success, writes the credential to Keycloak via the admin API.
  ``DELETE /api/users/me/2fa`` removes every existing OTP credential.
* ``PATCH /api/users/me`` updates first/last/email/phone via the
  Keycloak admin API (the realm is the source of truth for those
  fields; the local ``user_profiles`` row is just a cache).
* ``POST/GET/DELETE /api/users/me/avatar`` upload, serve, and delete
  user avatars stored as PNG bytes in ``user_profiles.avatar_image``.
  The upload path validates content-type + size, then centre-crops +
  resizes to a square via Pillow before persisting.

All routes require a valid bearer (JWT or PAT) — the authentication
dependency lives below in ``_account_auth``. Routes that touch the
Keycloak admin API surface a clean ``501`` when
``keycloak_admin_client_secret`` is unset.
"""
from __future__ import annotations

import base64
import hashlib
import io
import secrets
from typing import Any

import asyncpg
import httpx
import pyotp
import qrcode
import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image
from pydantic import BaseModel, Field

from substrate_common import UnauthorizedError, ValidationError

from src.config import settings

logger = structlog.get_logger()


async def _account_auth(request: Request) -> str:
    """Account-API auth dependency.

    Resolves the bearer credential (JWT or PAT) by delegating to the
    same ``_authenticate`` helper used by the catch-all ``/api/*``
    proxy. Returns the resolved ``user_sub`` and (importantly) populates
    ``request.state`` so the route body can read claims/JWT directly.
    """
    # Late import to avoid the import cycle: ``main`` imports this
    # module's ``router`` and ``hash_token`` at module load time.
    from src.main import _authenticate

    await _authenticate(request)
    sub = getattr(request.state, "user_sub", None)
    if not sub:
        raise UnauthorizedError("user_sub missing on request state")
    return sub


router = APIRouter(
    prefix="/api/users/me",
    dependencies=[Depends(_account_auth)],
)


# ─────────────────────────────────────────────────────────────────────
# Auth dependency — both JWT-issued bearers and PATs land here. The
# verify+lookup happens in ``main._authenticate``; this dependency is
# only the FastAPI plumbing that exposes the resolved user_sub.
# ─────────────────────────────────────────────────────────────────────


def _user_sub_from_request(request: Request) -> str:
    sub = getattr(request.state, "user_sub", None)
    if not sub:
        raise UnauthorizedError("user_sub missing on request state")
    return sub


# ─────────────────────────────────────────────────────────────────────
# Database access — the gateway already initialises a single asyncpg
# pool inside ``sse_endpoint``. We reuse it instead of opening a
# parallel one.
# ─────────────────────────────────────────────────────────────────────


def _pool() -> asyncpg.Pool:
    from src import sse_endpoint

    pool = sse_endpoint._pool
    if pool is None:
        raise RuntimeError("gateway db pool not initialised")
    return pool


# ─────────────────────────────────────────────────────────────────────
# API tokens
# ─────────────────────────────────────────────────────────────────────


def hash_token(plaintext: str) -> str:
    """sha256 hex digest used both at creation and at bearer-auth lookup."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def _mint_plaintext() -> tuple[str, str, str]:
    """Return ``(plaintext, prefix, hash)`` for a fresh token.

    The plaintext is ``<scheme><url-safe random>``. The display prefix
    is the first ``api_token_display_prefix_len`` chars of the random
    portion (so users can disambiguate tokens in the UI without leaking
    the secret). The hash is sha256 of the plaintext.
    """
    random_part = secrets.token_urlsafe(settings.api_token_random_bytes)
    plaintext = f"{settings.api_token_plaintext_prefix}{random_part}"
    prefix = random_part[: settings.api_token_display_prefix_len]
    return plaintext, prefix, hash_token(plaintext)


class ApiTokenCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    expires_at: str | None = None  # ISO-8601 timestamp; None = no expiry


class ApiTokenCreateResponse(BaseModel):
    id: str
    label: str
    prefix: str
    token: str  # plaintext, returned ONCE on creation
    created_at: str
    expires_at: str | None


class ApiTokenListEntry(BaseModel):
    id: str
    label: str
    prefix: str
    created_at: str
    last_used_at: str | None
    expires_at: str | None
    revoked_at: str | None


class ApiTokenRevokeResponse(BaseModel):
    revoked: bool


@router.post("/api-tokens", response_model=ApiTokenCreateResponse)
async def create_api_token(
    body: ApiTokenCreateRequest,
    request: Request,
):
    user_sub = _user_sub_from_request(request)
    plaintext, prefix, token_hash = _mint_plaintext()
    pool = _pool()
    async with pool.acquire() as conn:
        # Ensure a user_profiles row exists. The graph service touches
        # it on every GET /api/users/me, but a fresh user who calls
        # this endpoint before loading the dashboard would otherwise
        # FK-violate. Insert a stub row that GET /api/users/me will
        # later fill in from the JWT claims.
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub)
            VALUES ($1)
            ON CONFLICT (user_sub) DO NOTHING
            """,
            user_sub,
        )
        row = await conn.fetchrow(
            """
            INSERT INTO api_tokens (user_sub, label, token_hash, prefix, expires_at)
            VALUES ($1, $2, $3, $4, $5::timestamptz)
            RETURNING id::text, label, prefix,
                      created_at::text AS created_at,
                      expires_at::text AS expires_at
            """,
            user_sub,
            body.label,
            token_hash,
            prefix,
            body.expires_at,
        )
    return ApiTokenCreateResponse(
        id=row["id"],
        label=row["label"],
        prefix=row["prefix"],
        token=plaintext,
        created_at=row["created_at"],
        expires_at=row["expires_at"],
    )


@router.get("/api-tokens", response_model=list[ApiTokenListEntry])
async def list_api_tokens(request: Request):
    user_sub = _user_sub_from_request(request)
    pool = _pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text                 AS id,
                   label,
                   prefix,
                   created_at::text         AS created_at,
                   last_used_at::text       AS last_used_at,
                   expires_at::text         AS expires_at,
                   revoked_at::text         AS revoked_at
            FROM api_tokens
            WHERE user_sub = $1
            ORDER BY created_at DESC
            """,
            user_sub,
        )
    return [ApiTokenListEntry(**dict(r)) for r in rows]


@router.delete("/api-tokens/{token_id}", response_model=ApiTokenRevokeResponse)
async def revoke_api_token(token_id: str, request: Request):
    user_sub = _user_sub_from_request(request)
    pool = _pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            UPDATE api_tokens
            SET revoked_at = now()
            WHERE id = $1::uuid
              AND user_sub = $2
              AND revoked_at IS NULL
            """,
            token_id,
            user_sub,
        )
    return ApiTokenRevokeResponse(revoked=result == "UPDATE 1")


# ─────────────────────────────────────────────────────────────────────
# Keycloak proxied endpoints — password / 2FA / profile PATCH
# ─────────────────────────────────────────────────────────────────────


_TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=5.0, pool=10.0)


def _user_jwt_from_request(request: Request) -> str:
    """Return the user's bearer JWT — used to forward to the Keycloak
    account API. PATs cannot drive the account API, so endpoints that
    proxy to it require a JWT-issued bearer."""
    token = getattr(request.state, "bearer_jwt", None)
    if not token:
        raise UnauthorizedError(
            "this endpoint requires a Keycloak-issued bearer token, not a PAT"
        )
    return token


async def _admin_token(client: httpx.AsyncClient) -> str:
    """Mint a Keycloak service-account token for admin API calls.

    Reuses the ``substrate-gateway`` confidential client — its service
    account is granted realm-management roles in
    ``ops/infra/keycloak/substrate-realm.template.json``.
    ``kc_gateway_client_secret`` empty => 501 so a misconfigured deploy
    fails loudly.
    """
    if not settings.kc_gateway_client_secret:
        raise HTTPException(
            501,
            {
                "error": "keycloak_admin_not_configured",
                "hint": (
                    "Set KC_GATEWAY_CLIENT_SECRET in the gateway env "
                    "(matches the substrate-gateway client secret in "
                    "the realm)."
                ),
            },
        )
    resp = await client.post(
        settings.keycloak_token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.keycloak_admin_client_id,
            "client_secret": settings.kc_gateway_client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise HTTPException(502, {"error": "keycloak_admin_no_token"})
    return token


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=200)


@router.post("/password")
async def change_password(body: PasswordChangeRequest, request: Request):
    user_jwt = _user_jwt_from_request(request)
    url = (
        f"{settings.keycloak_url.rstrip('/')}/realms/"
        f"{settings.keycloak_realm}/account/credentials/password"
    )
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {user_jwt}",
                "Content-Type": "application/json",
            },
            json={
                "currentPassword": body.current_password,
                "newPassword": body.new_password,
                "confirmation": body.new_password,
            },
        )
    if resp.status_code in (200, 204):
        return {"ok": True}
    # Bubble Keycloak's structured error so the UI can display
    # password-policy violations etc. verbatim.
    try:
        body_json: Any = resp.json()
    except ValueError:
        body_json = {"raw": resp.text[:200]}
    raise HTTPException(resp.status_code, body_json)


class TotpSetupResponse(BaseModel):
    secret: str
    qr_data_url: str
    otpauth_url: str


def _build_otpauth_url(secret: str, account: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(
        name=account, issuer_name=settings.totp_issuer,
    )


def _otpauth_to_qr_data_url(otpauth_url: str) -> str:
    qr = qrcode.QRCode(border=2)
    qr.add_data(otpauth_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


@router.post("/2fa/setup", response_model=TotpSetupResponse)
async def totp_setup(request: Request):
    # The authenticator app shows ``issuer:account``. Use email when
    # available so the user recognises the entry; fall back to the
    # username and finally to the sub if neither is set.
    claims = getattr(request.state, "claims", None) or {}
    account = (
        claims.get("email")
        or claims.get("preferred_username")
        or _user_sub_from_request(request)
    )
    secret = pyotp.random_base32()
    otpauth = _build_otpauth_url(secret, account)
    return TotpSetupResponse(
        secret=secret,
        qr_data_url=_otpauth_to_qr_data_url(otpauth),
        otpauth_url=otpauth,
    )


class TotpVerifyRequest(BaseModel):
    secret: str = Field(min_length=16, max_length=64)
    code: str = Field(min_length=6, max_length=10)


class TotpStatusResponse(BaseModel):
    enabled: bool


@router.get("/2fa/status", response_model=TotpStatusResponse)
async def totp_status(request: Request):
    """Whether the user has at least one OTP credential registered.

    Reads the user's credentials list from the Keycloak admin API and
    returns ``enabled = any(cred.type == "otp" for cred in creds)``.
    Used by the Authentication settings tab to decide whether to render
    the "Set up 2FA" or "Disable 2FA" branch.
    """
    user_sub = _user_sub_from_request(request)
    base = settings.keycloak_admin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        admin = await _admin_token(client)
        resp = await client.get(
            f"{base}/users/{user_sub}/credentials",
            headers={"Authorization": f"Bearer {admin}"},
        )
    if resp.status_code != 200:
        raise HTTPException(resp.status_code, resp.text[:200])
    creds = resp.json() or []
    return TotpStatusResponse(
        enabled=any(c.get("type") == "otp" for c in creds),
    )


@router.post("/2fa/verify")
async def totp_verify(body: TotpVerifyRequest, request: Request):
    if not pyotp.TOTP(body.secret).verify(body.code, valid_window=1):
        raise ValidationError("invalid TOTP code")
    user_sub = _user_sub_from_request(request)
    base = settings.keycloak_admin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        admin = await _admin_token(client)
        resp = await client.post(
            f"{base}/users/{user_sub}/credentials",
            headers={
                "Authorization": f"Bearer {admin}",
                "Content-Type": "application/json",
            },
            json={
                "type": "otp",
                "value": body.secret,
                "temporary": False,
                "userLabel": "Authenticator app",
            },
        )
    if resp.status_code in (200, 201, 204):
        return {"ok": True}
    raise HTTPException(resp.status_code, resp.text[:200])


@router.delete("/2fa")
async def totp_disable(request: Request):
    user_sub = _user_sub_from_request(request)
    base = settings.keycloak_admin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        admin = await _admin_token(client)
        resp = await client.get(
            f"{base}/users/{user_sub}/credentials",
            headers={"Authorization": f"Bearer {admin}"},
        )
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, resp.text[:200])
        creds = resp.json() or []
        otp_ids = [c["id"] for c in creds if c.get("type") == "otp"]
        for cred_id in otp_ids:
            del_resp = await client.delete(
                f"{base}/users/{user_sub}/credentials/{cred_id}",
                headers={"Authorization": f"Bearer {admin}"},
            )
            if del_resp.status_code not in (200, 204):
                raise HTTPException(
                    del_resp.status_code, del_resp.text[:200],
                )
    return {"ok": True, "removed": len(otp_ids)}


# ─────────────────────────────────────────────────────────────────────
# Active sessions — sign out from all devices
# ─────────────────────────────────────────────────────────────────────


class SessionsRevokeAllResponse(BaseModel):
    ok: bool


@router.post("/sessions/revoke-all", response_model=SessionsRevokeAllResponse)
async def sessions_revoke_all(request: Request):
    """Invalidate every Keycloak session belonging to the current user.

    Hits ``DELETE /admin/realms/{realm}/users/{id}/logout`` on the admin
    API, which terminates all browser/SSO sessions for the user across
    every client. The current bearer JWT continues to verify until its
    ``exp`` ticks past — the frontend follows up by calling
    ``signoutRedirect()`` so the local OIDC session is also cleared.
    """
    user_sub = _user_sub_from_request(request)
    base = settings.keycloak_admin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        admin = await _admin_token(client)
        resp = await client.post(
            f"{base}/users/{user_sub}/logout",
            headers={"Authorization": f"Bearer {admin}"},
        )
    if resp.status_code not in (200, 204):
        raise HTTPException(resp.status_code, resp.text[:200])
    return SessionsRevokeAllResponse(ok=True)


class ProfilePatchRequest(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=64)


@router.patch("")
async def patch_profile(body: ProfilePatchRequest, request: Request):
    if body.model_dump(exclude_none=True) == {}:
        raise ValidationError("no fields to update")
    user_sub = _user_sub_from_request(request)
    base = settings.keycloak_admin_url.rstrip("/")
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        admin = await _admin_token(client)
        # Keycloak's PUT /users/{id} is a partial-merge on the user
        # representation — fields we do NOT include are left untouched.
        # ``attributes`` is a map of array-of-strings, so phone goes in
        # as ``{"phone": [body.phone]}``.
        payload: dict[str, Any] = {}
        if body.first_name is not None:
            payload["firstName"] = body.first_name
        if body.last_name is not None:
            payload["lastName"] = body.last_name
        if body.email is not None:
            payload["email"] = body.email
        if body.phone is not None:
            payload["attributes"] = {"phone": [body.phone]}
        resp = await client.put(
            f"{base}/users/{user_sub}",
            headers={
                "Authorization": f"Bearer {admin}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(resp.status_code, resp.text[:200])
        # Read back the full representation so the frontend can refresh
        # without an extra round-trip.
        get_resp = await client.get(
            f"{base}/users/{user_sub}",
            headers={"Authorization": f"Bearer {admin}"},
        )
        if get_resp.status_code != 200:
            raise HTTPException(get_resp.status_code, get_resp.text[:200])
        kc_user = get_resp.json() or {}
    attrs = kc_user.get("attributes") or {}
    phone_arr = attrs.get("phone") or []
    # Mirror first/last/email/phone into ``user_profiles`` so the local
    # display_name + email cache stays in sync without a round-trip to
    # GET /api/users/me. Keycloak remains the source of truth.
    pool = _pool()
    composite_name = " ".join(
        part for part in (
            kc_user.get("firstName") or "",
            kc_user.get("lastName") or "",
        ) if part
    ).strip() or kc_user.get("username") or ""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub) VALUES ($1)
            ON CONFLICT (user_sub) DO NOTHING
            """,
            user_sub,
        )
        await conn.execute(
            """
            UPDATE user_profiles
            SET display_name = $2,
                email        = $3,
                updated_at   = now()
            WHERE user_sub = $1
            """,
            user_sub,
            composite_name,
            kc_user.get("email") or "",
        )
    return {
        "id": kc_user.get("id"),
        "username": kc_user.get("username"),
        "first_name": kc_user.get("firstName") or "",
        "last_name": kc_user.get("lastName") or "",
        "email": kc_user.get("email") or "",
        "phone": phone_arr[0] if phone_arr else "",
    }


# ─────────────────────────────────────────────────────────────────────
# Avatar upload / serve / delete
# ─────────────────────────────────────────────────────────────────────


_AVATAR_ALLOWED_MIMES = {"image/png", "image/jpeg", "image/webp"}


def _square_centre_crop_to_png(image_bytes: bytes, target: int) -> bytes:
    """Centre-crop the largest square from ``image_bytes`` and resize to
    ``target x target``. Returns PNG bytes. Raises ``ValidationError`` if
    Pillow can't open the input or it isn't a recognised image."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.load()
            # Avatars are sRGB. Drop palette/alpha so the PNG re-encode
            # is consistent regardless of the source format.
            normalized = (
                img.convert("RGBA") if img.mode == "P" else img.convert("RGB")
            )
            w, h = normalized.size
            edge = min(w, h)
            left = (w - edge) // 2
            top = (h - edge) // 2
            cropped = normalized.crop((left, top, left + edge, top + edge))
            resized = cropped.resize((target, target), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            resized.save(out, format="PNG", optimize=True)
            return out.getvalue()
    except (OSError, ValueError) as exc:
        raise ValidationError(
            f"avatar image could not be processed: {exc}"
        ) from exc


@router.post("/avatar")
async def upload_avatar(request: Request, file: UploadFile = File(...)):
    user_sub = _user_sub_from_request(request)
    if file.content_type not in _AVATAR_ALLOWED_MIMES:
        raise ValidationError(
            f"unsupported avatar content-type: {file.content_type!r}; "
            f"allowed: {sorted(_AVATAR_ALLOWED_MIMES)}"
        )
    raw = await file.read(settings.avatar_max_upload_bytes + 1)
    if len(raw) > settings.avatar_max_upload_bytes:
        raise ValidationError(
            f"avatar exceeds {settings.avatar_max_upload_bytes} bytes"
        )
    png = _square_centre_crop_to_png(raw, settings.avatar_target_size_px)
    pool = _pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub) VALUES ($1)
            ON CONFLICT (user_sub) DO NOTHING
            """,
            user_sub,
        )
        await conn.execute(
            """
            UPDATE user_profiles
            SET avatar_image      = $2,
                avatar_mime       = 'image/png',
                avatar_updated_at = now(),
                updated_at        = now()
            WHERE user_sub = $1
            """,
            user_sub,
            png,
        )
    return {
        "ok": True,
        "size_bytes": len(png),
        "mime": "image/png",
        "edge_px": settings.avatar_target_size_px,
    }


@router.get("/avatar")
async def get_avatar(request: Request):
    user_sub = _user_sub_from_request(request)
    pool = _pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT avatar_image, avatar_mime
            FROM user_profiles
            WHERE user_sub = $1
            """,
            user_sub,
        )
    if row is None or row["avatar_image"] is None:
        # "No avatar yet" is a normal state for new users; returning
        # 404 here causes browser-side console error noise on every
        # fresh dashboard load. Return 200 with an explicit null so
        # the frontend can branch without treating it as a transport
        # error. max-age=0 because an upload may land seconds later.
        return JSONResponse(
            content={"avatar": None},
            headers={"Cache-Control": "public, max-age=0"},
        )
    return Response(
        content=bytes(row["avatar_image"]),
        media_type=row["avatar_mime"] or "image/png",
        headers={
            "Cache-Control": (
                f"public, max-age={settings.avatar_cache_max_age_s}"
            ),
        },
    )


@router.delete("/avatar")
async def delete_avatar(request: Request):
    user_sub = _user_sub_from_request(request)
    pool = _pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE user_profiles
            SET avatar_image      = NULL,
                avatar_mime       = NULL,
                avatar_updated_at = NULL,
                updated_at        = now()
            WHERE user_sub = $1
            """,
            user_sub,
        )
    return {"ok": True}


__all__ = ["router", "hash_token"]
