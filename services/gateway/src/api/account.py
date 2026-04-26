"""User-facing account API: API tokens (and, in subsequent commits,
password / 2FA / profile / avatar).

This module is the single place where the gateway holds *direct* domain
logic instead of proxying to ``graph``/``ingestion``. The reason is that
every route here is tied to *authentication itself*:

* ``POST/GET/DELETE /api/users/me/api-tokens`` mint, list, and revoke
  personal access tokens (PATs). The bearer-auth fast-path in
  ``main._authenticate`` looks PATs up by sha256 hash, so a round-trip
  to graph would be one extra hop on every authenticated request.
"""
from __future__ import annotations

import hashlib
import secrets

import asyncpg
import structlog
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from substrate_common import UnauthorizedError

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


__all__ = ["router", "hash_token"]
