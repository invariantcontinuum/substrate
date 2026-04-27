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
from src.config_registry import (
    LLM_FIELD_MAP,
    POSTGRES_FIELD_MAP,
    lookup_section,
)
from src.config_runtime import (
    fetch_effective_section,
    reset_runtime_section,
    upsert_runtime_section,
)

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
    raw = await fetch_effective_section(section=section, owner=owner)
    # Translate role-prefixed storage keys back to the panel's simple
    # field names so the frontend never has to know about per-role
    # storage prefixes. Each `llm_<role>` section reads the same
    # six-field shape; the section is the only thing that varies.
    llm_map = LLM_FIELD_MAP.get(section)
    if llm_map is not None:
        return {wire_key: raw.get(storage_key) for wire_key, storage_key in llm_map.items()}
    if section == "postgres":
        # Mirror image of the PUT translation — read the `pg_*` storage
        # keys back into the panel's bare field shape (host/port/…).
        # The `password` value is intentionally returned verbatim;
        # the panel re-renders it into a `<input type="password">` so
        # the credential is masked in the DOM rather than scrubbed on
        # the wire (the gateway already authenticates the read).
        return {
            wire_key: raw.get(storage_key)
            for wire_key, storage_key in POSTGRES_FIELD_MAP.items()
        }
    return raw


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

    # Translate per-role wire keys ("name", "url", …) into the owning
    # service's storage keys ("dense_llm_url", …) so the runtime overlay
    # — keyed by the owner's SCOPE — picks them up directly. The four
    # `llm_*` sections share storage with the rest of the owner's
    # settings, but use disjoint role-prefixed keys to avoid collisions.
    llm_map = LLM_FIELD_MAP.get(section)
    if llm_map is not None:
        payload = {llm_map[k]: v for k, v in payload.items() if k in llm_map}
    elif section == "postgres":
        # Postgres uses the same panel-key/storage-key pattern as the
        # LLM sections, but lives in its own field map so the wire shape
        # stays explicit in the registry (host/port/database/… → pg_*).
        payload = {
            POSTGRES_FIELD_MAP[k]: v
            for k, v in payload.items()
            if k in POSTGRES_FIELD_MAP
        }

    sub = _user_sub(user)
    # Scope = owner service so the rows merge into the same overlay the
    # service reads at startup (graph.SCOPE = "graph", ingestion.SCOPE =
    # "ingestion"). Sections are a UI/wire partition only — once the
    # body is validated and translated, every key is just a field on the
    # owner's settings instance.
    await upsert_runtime_section(scope=owner, payload=payload, updated_by=sub)
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


@router.delete("/{section}")
async def reset_section(
    section: str,
    user: dict[str, Any] = Depends(current_user),
    confirm_risk: str | None = Header(default=None, alias="X-Substrate-Confirm-Risk"),
) -> dict[str, Any]:
    """Clear all runtime overrides for ``section`` so the effective config
    falls back to ``services/<svc>/config.yaml`` defaults (then env, then
    Pydantic class defaults). Same risk gate as PUT for the postgres
    section because resetting it can change the active database URL.
    """
    try:
        owner, _schema = lookup_section(section)
    except KeyError as exc:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}"
        ) from exc

    if section == "postgres" and confirm_risk != "postgres":
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="postgres section reset requires X-Substrate-Confirm-Risk: postgres header",
        )

    sub = _user_sub(user)
    # For LLM sections, drop only the storage keys that this role owns —
    # the four `llm_*` sections share the owning service's overlay scope
    # but use role-prefixed keys, so a global delete-by-scope would wipe
    # peer roles' overrides too. Same applies to postgres: the
    # ``pg_*`` keys live in the graph scope, but the section only
    # owns those — a scope-wide delete would also drop graph + chat
    # tunables.
    llm_map = LLM_FIELD_MAP.get(section)
    if llm_map is not None:
        rows_cleared = await reset_runtime_section(
            scope=owner, keys=list(llm_map.values()),
        )
    elif section == "postgres":
        rows_cleared = await reset_runtime_section(
            scope=owner, keys=list(POSTGRES_FIELD_MAP.values()),
        )
    else:
        rows_cleared = await reset_runtime_section(scope=owner)
    await safe_publish(
        Event(
            type="config.updated",
            user_sub=sub,
            payload={
                "scope": owner,
                "section": section,
                "reset": True,
                "rows_cleared": rows_cleared,
                "updated_by": sub,
            },
        )
    )
    log.info(
        "config_section_reset",
        section=section,
        owner=owner,
        rows_cleared=rows_cleared,
        updated_by=sub,
    )
    return {"section": section, "scope": owner, "rows_cleared": rows_cleared}
