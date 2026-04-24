"""Third-party integration validation (spec §9.9).

Currently only GitHub PAT validation: Account · Integrations pastes a
token, we probe ``GET https://api.github.com/user`` and return the login
+ granted scopes. We never persist the token here — the user rotates
secrets in their ingestion-worker env separately."""
from __future__ import annotations

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.auth import require_user_sub
from src.config import settings

logger = structlog.get_logger()
router = APIRouter(prefix="/api/integrations/github")


class GitHubAuthError(Exception):
    """Raised when GitHub rejects the PAT (401 / invalid)."""


class ValidateBody(BaseModel):
    token: str = Field(min_length=8, max_length=400)


async def _probe_github(token: str) -> dict[str, object]:
    """Hit ``GET /user``. Returns ``{login, scopes}`` on success, raises
    ``GitHubAuthError`` on 401, and re-raises transport failures."""
    timeout = httpx.Timeout(
        connect=5.0, read=settings.github_validate_timeout_s,
        write=5.0, pool=10.0,
    )
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "substrate-graph",
            },
        )
    if resp.status_code == 401:
        raise GitHubAuthError("401 Unauthorized")
    if resp.status_code >= 400:
        raise GitHubAuthError(f"GitHub returned {resp.status_code}")
    scopes_hdr = resp.headers.get("X-OAuth-Scopes", "")
    scopes = [s.strip() for s in scopes_hdr.split(",") if s.strip()]
    data = resp.json()
    return {"login": data.get("login"), "scopes": scopes}


@router.post("/validate")
async def validate_github(
    body: ValidateBody,
    user_sub: str = Depends(require_user_sub),  # noqa: ARG001 — auth only
) -> dict[str, object]:
    try:
        info = await _probe_github(body.token)
    except GitHubAuthError as exc:
        raise HTTPException(
            422, {"error": "invalid_token", "detail": str(exc)},
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            502, {"error": "github_unreachable", "detail": str(exc)},
        ) from exc
    return info
