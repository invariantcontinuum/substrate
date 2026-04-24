"""End all Keycloak sessions for the current user (spec §9.7).

Account · Profile calls this when the user presses "Sign out of every
device". Revocation is delegated to Keycloak's admin API via a service-
account token. An empty ``keycloak_admin_client_secret`` short-circuits
with 501 so unconfigured environments fail loudly rather than silently."""
from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import require_user_sub
from src.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/api/users/me/sessions")


async def _service_token(client: httpx.AsyncClient) -> str:
    resp = await client.post(
        settings.keycloak_token_url,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.keycloak_admin_client_id,
            "client_secret": settings.keycloak_admin_client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise HTTPException(502, {"error": "keycloak_admin_no_token"})
    return token


async def _keycloak_logout_all(user_sub: str) -> None:
    """Call Keycloak admin ``POST /users/{id}/logout``. Assumes
    ``sub == Keycloak user id`` (default realm config). Raises
    ``HTTPException`` on transport or status errors so the caller can
    surface the precise failure to the frontend."""
    base = settings.keycloak_admin_url.rstrip("/")
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            token = await _service_token(client)
        except httpx.HTTPError as exc:
            raise HTTPException(
                502, {"error": "keycloak_admin_unreachable",
                      "detail": str(exc)},
            ) from exc
        try:
            resp = await client.post(
                f"{base}/users/{user_sub}/logout",
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError as exc:
            raise HTTPException(
                502, {"error": "keycloak_logout_failed",
                      "detail": str(exc)},
            ) from exc
    if resp.status_code == 404:
        raise HTTPException(404, {"error": "user_not_found_in_keycloak"})
    if resp.status_code not in (200, 204):
        raise HTTPException(
            502, {"error": "keycloak_logout_rejected",
                  "status": resp.status_code, "body": resp.text[:200]},
        )


@router.post("/revoke-all")
async def revoke_all(
    user_sub: str = Depends(require_user_sub),
) -> dict[str, bool]:
    if not settings.keycloak_admin_client_secret:
        raise HTTPException(
            501, {"error": "keycloak_admin_not_configured",
                  "hint": ("Set KEYCLOAK_ADMIN_CLIENT_ID and "
                           "KEYCLOAK_ADMIN_CLIENT_SECRET in the graph env.")},
        )
    await _keycloak_logout_all(user_sub)
    logger.info("user_sessions_revoked", user_sub=user_sub)
    return {"ok": True}
