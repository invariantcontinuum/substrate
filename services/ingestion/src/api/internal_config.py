"""Internal-only route: ``GET /internal/config/{section}``.

Mirrors the contract in graph/gateway. Ingestion does not yet own any
config sections in the gateway registry — the per-sync Leiden knobs and
chunker tunables are exposed via the graph service for now — but the
route is wired so future sections (e.g. ``ingestion`` for retention /
runner cadence) can land without re-touching ingestion's lifespan.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src import config as _cfg


router = APIRouter(prefix="/internal/config", tags=["internal-config"])


# Sections owned by the ingestion service. Empty until a section in the
# gateway's REGISTRY routes to ``ingestion`` as its owner.
_SECTIONS: dict[str, list[str]] = {}


@router.get("/{section}")
async def get_internal_section(section: str) -> dict[str, Any]:
    if section not in _SECTIONS:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}",
        )
    s = _cfg.settings
    return {k: getattr(s, k, None) for k in _SECTIONS[section]}
