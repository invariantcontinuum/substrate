"""Config GET/PUT routes.

``GET /api/config/{section}`` returns the merged effective settings
from the owning service (defaults < yaml < env < runtime overlay).

``PUT /api/config/{section}`` validates the body against the section's
Pydantic schema, upserts each top-level key into ``runtime_config``,
and emits an SSE ``config.updated`` event so the owning service
refreshes its overlay live (no container restart).

The ``postgres`` section is risk-gated: it can disable the database
connection if mistuned, so PUT requires the explicit
``X-Substrate-Confirm-Risk: postgres`` header.
"""
from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import ValidationError

from substrate_common import Event, UnauthorizedError, safe_publish

from src.config import settings
from src.config_registry import lookup_section
from src.config_runtime import fetch_effective_section, upsert_runtime_section

log = structlog.get_logger()

router = APIRouter(prefix="/api/config", tags=["config"])


async def current_user(request: Request) -> dict[str, Any]:
    """JWT-validated claims for the caller.

    Mirrors ``src.main._authenticate`` but exposes a ``Depends``-friendly
    surface so the config routes stay declarative. ``AUTH_DISABLED=true``
    short-circuits to a stub admin claim — same behaviour as the proxy
    routes — to keep local dev frictionless.
    """
    if settings.auth_disabled:
        return {
            "sub": "dev",
            "preferred_username": "dev",
            "realm_access": {"roles": ["admin", "engineer", "viewer"]},
        }
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise UnauthorizedError("missing bearer token")
    # Late import: src.main imports this router, importing src.main here
    # at module load time would create a cycle.
    from src.main import jwt_verifier

    if jwt_verifier is None:
        raise UnauthorizedError("verifier not initialised")
    return await jwt_verifier.verify(auth_header[7:])


def _user_sub(claims: dict[str, Any]) -> str:
    for key in ("sub", "preferred_username", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value:
            return value
    return "unknown"


@router.get("/{section}")
async def get_section(
    section: str, user: dict[str, Any] = Depends(current_user)
) -> dict[str, Any]:
    try:
        owner, _schema = lookup_section(section)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}"
        ) from exc
    return await fetch_effective_section(section=section, owner=owner)


@router.put("/{section}")
async def put_section(
    section: str,
    body: dict[str, Any],
    user: dict[str, Any] = Depends(current_user),
    confirm_risk: str | None = Header(default=None, alias="X-Substrate-Confirm-Risk"),
) -> dict[str, Any]:
    try:
        owner, schema = lookup_section(section)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}"
        ) from exc

    if section == "postgres" and confirm_risk != "postgres":
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="postgres section requires X-Substrate-Confirm-Risk: postgres header",
        )

    try:
        validated = schema(**body)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors()) from exc

    payload = {k: v for k, v in validated.model_dump().items() if v is not None}
    if not payload:
        raise HTTPException(status_code=400, detail="empty body")

    sub = _user_sub(user)
    await upsert_runtime_section(section=section, payload=payload, updated_by=sub)
    await safe_publish(
        Event(
            type="config.updated",
            user_sub=sub,
            payload={
                "scope": owner,
                "section": section,
                "keys": list(payload.keys()),
                "updated_by": sub,
            },
        )
    )
    log.info(
        "config_section_updated",
        section=section,
        owner=owner,
        keys=list(payload.keys()),
        updated_by=sub,
    )
    return {"applied": payload, "scope": owner}
