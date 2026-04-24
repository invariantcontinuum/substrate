"""Account deletion request (spec §9.7, stub).

Stubbed because full account deletion is a staged, multi-system workflow
(Keycloak user delete + substrate data purge + audit row) that needs
manual approval gating pre-MVP. For now the endpoint returns 501 so the
frontend can render the danger-zone button with an "available post-MVP"
tooltip rather than silently succeeding."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from src.api.auth import require_user_sub

router = APIRouter(prefix="/api/users/me")


@router.post("/deletion-request")
async def deletion_request(
    user_sub: str = Depends(require_user_sub),  # noqa: ARG001 — auth only
) -> None:
    raise HTTPException(
        501,
        {
            "error": "not_implemented",
            "detail": "account deletion will be available post-MVP",
        },
    )
