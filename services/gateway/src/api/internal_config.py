"""Internal-only route: ``GET /internal/config/{section}``.

Mirrors the per-service contract in graph/ingestion. Gateway owns the
``auth`` and ``github`` sections; the rest are owned elsewhere and the
gateway only proxies their reads via ``fetch_effective_section()``.

``github_pat`` is intentionally NOT exposed — echoing the PAT back over
``GET /api/config/github`` would leak the credential to anyone with
admin role on the gateway. Future GET requests for ``github`` therefore
return an empty dict; the PUT route stays as the only path that touches
the value.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src import config as _cfg


router = APIRouter(prefix="/internal/config", tags=["internal-config"])


_SECTIONS: dict[str, list[str]] = {
    "auth": [
        "keycloak_url",
        "keycloak_realm",
        "keycloak_account_console_url",
        "keycloak_public_client_id",
    ],
    # github_pat is deliberately omitted — never echo a PAT in GET responses.
    "github": [],
}


@router.get("/{section}")
async def get_internal_section(section: str) -> dict[str, Any]:
    if section not in _SECTIONS:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}",
        )
    s = _cfg.settings
    return {k: getattr(s, k, None) for k in _SECTIONS[section]}
