"""GET /api/profile/idps — federated IDP providers used by the current user.

The Settings · Profile tab renders a "Signed in via" chip per provider when
this endpoint returns at least one entry. We resolve the list by minting a
service-account token for ``substrate-gateway`` and calling Keycloak's
``GET /admin/realms/{realm}/users/{sub}/federated-identity`` admin API.

Degrades silently when ``kc_gateway_client_secret`` is not configured (or
Keycloak rejects the lookup) — the UI just hides the chip rather than
surfacing a 5xx that has no actionable user remedy.
"""
from __future__ import annotations

import time
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends

from src.api.config import current_user
from src.config import settings

logger = structlog.get_logger()

router = APIRouter(prefix="/api/profile", tags=["profile"])


# Cache the service-account token by realm so repeated requests don't keep
# hitting the Keycloak token endpoint. Tokens are short-lived (typically
# 60s) — we refresh 5s before expiry to absorb clock skew.
_SERVICE_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


async def _service_account_token() -> str | None:
    """Mint or fetch a cached service-account token for the gateway client.

    Returns ``None`` when no client_secret is configured — the caller
    treats that as "no IDPs to display" and the UI hides the chip.
    """
    if not settings.kc_gateway_client_secret:
        return None
    cache_key = settings.keycloak_realm
    cached = _SERVICE_TOKEN_CACHE.get(cache_key)
    now = time.monotonic()
    if cached and cached[1] > now:
        return cached[0]
    token_url = (
        f"{settings.keycloak_url.rstrip('/')}"
        f"/realms/{settings.keycloak_realm}"
        f"/protocol/openid-connect/token"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": "substrate-gateway",
                    "client_secret": settings.kc_gateway_client_secret,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        logger.warning("idp_token_fetch_failed", error=str(exc))
        return None
    if resp.status_code >= 400:
        logger.warning(
            "idp_token_fetch_rejected",
            status=resp.status_code,
            body=resp.text[:200],
        )
        return None
    payload = resp.json()
    token = payload.get("access_token")
    if not token:
        return None
    expires_in = int(payload.get("expires_in") or 60)
    _SERVICE_TOKEN_CACHE[cache_key] = (token, now + max(expires_in - 5, 5))
    return token


def _user_sub_from_claims(claims: dict[str, Any]) -> str:
    for key in ("sub", "preferred_username", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


@router.get("/idps")
async def list_idps(
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, list[str]]:
    """Return the list of federated IDP provider aliases for the caller.

    Empty providers list is the explicit "I'm a native Keycloak user"
    signal — the frontend then hides the IDP chip on the Profile tab.
    """
    sub = _user_sub_from_claims(user)
    if not sub:
        return {"providers": []}
    token = await _service_account_token()
    if not token:
        return {"providers": []}
    admin_url = (
        f"{settings.keycloak_url.rstrip('/')}"
        f"/admin/realms/{settings.keycloak_realm}"
        f"/users/{sub}/federated-identity"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                admin_url,
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as exc:
        logger.warning("idp_list_fetch_failed", error=str(exc), sub=sub)
        return {"providers": []}
    if resp.status_code == 404:
        # Stale sub or user not in this realm — graceful empty response.
        return {"providers": []}
    if resp.status_code >= 400:
        logger.warning(
            "idp_list_fetch_rejected",
            status=resp.status_code,
            body=resp.text[:200],
            sub=sub,
        )
        return {"providers": []}
    rows = resp.json()
    if not isinstance(rows, list):
        return {"providers": []}
    providers: list[str] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        alias = row.get("identityProvider")
        if isinstance(alias, str) and alias:
            providers.append(alias)
    return {"providers": providers}
