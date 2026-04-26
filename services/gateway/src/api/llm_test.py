"""``POST /api/llm/{role}/test`` — probe an LLM endpoint with the panel's
current form values, before the user saves them.

The Settings → LLM Connections panel sends the live (unsaved) form
values; the gateway does a single role-appropriate request against
the supplied URL with the supplied bearer token / SSL trust setting,
then reports ``{ok, latency_ms, model, error}`` so the panel can show
an inline pass/fail indicator without round-tripping a save.

The endpoint is auth-gated against the same JWT as the rest of
``/api/*``. It does not touch ``runtime_config`` and does not emit SSE.
"""
from __future__ import annotations

import time
from typing import Any, Literal

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.config import current_user


log = structlog.get_logger()

router = APIRouter(prefix="/api/llm", tags=["llm-test"])


Role = Literal["dense", "sparse", "embedding", "reranker"]


class LlmProbeRequest(BaseModel):
    """Mirrors the LLM Connections panel form fields. ``name`` is the
    upstream model name (``dense`` / ``embeddings`` / …); ``url`` is the
    endpoint to probe; ``api_key`` is sent as ``Authorization: Bearer``
    when non-empty; ``timeout_s`` bounds the probe (httpx read timeout);
    ``ssl_verify`` toggles certificate verification."""

    name: str = ""
    url: str
    api_key: str = ""
    context_window_tokens: int | None = None
    timeout_s: float = Field(default=10.0, gt=0.0, le=120.0)
    ssl_verify: bool = True


class LlmProbeResponse(BaseModel):
    ok: bool
    latency_ms: int
    model: str
    error: str | None = None


_ALLOWED_ROLES: set[str] = {"dense", "sparse", "embedding", "reranker"}


def _build_probe_payload(role: Role, name: str) -> dict[str, Any]:
    """Pick the smallest possible request body that exercises the role
    without burning context. Each shape matches the upstream protocol
    used by the live pipelines (see ``services/graph/src/graph/*`` and
    ``services/ingestion/src/llm.py``)."""
    if role in ("dense", "sparse"):
        return {
            "model": name,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }
    if role == "embedding":
        return {"input": ["ping"], "model": name}
    if role == "reranker":
        return {"query": "ping", "documents": ["x"], "model": name}
    raise ValueError(f"unsupported role {role!r}")


@router.post("/{role}/test", response_model=LlmProbeResponse)
async def test_llm(
    role: str,
    body: LlmProbeRequest,
    _user: dict[str, Any] = Depends(current_user),
) -> LlmProbeResponse:
    if role not in _ALLOWED_ROLES:
        raise HTTPException(
            status_code=404, detail=f"unknown role {role!r}"
        )
    if not body.url:
        raise HTTPException(status_code=422, detail="url is required")

    headers: dict[str, str] = {}
    if body.api_key:
        headers["Authorization"] = f"Bearer {body.api_key}"

    payload = _build_probe_payload(role, body.name or role)  # type: ignore[arg-type]

    start = time.perf_counter()
    error: str | None = None
    ok = False
    try:
        async with httpx.AsyncClient(
            timeout=body.timeout_s, verify=body.ssl_verify,
        ) as client:
            resp = await client.post(body.url, headers=headers, json=payload)
        if resp.status_code >= 400:
            error = f"HTTP {resp.status_code}: {resp.text[:200]}"
        else:
            ok = True
    except httpx.TimeoutException as exc:
        error = f"timeout after {body.timeout_s:.1f}s ({exc!s})"
    except httpx.ConnectError as exc:
        error = f"connect error: {exc!s}"
    except httpx.RequestError as exc:  # transport / TLS / DNS / etc.
        error = f"transport error: {exc!s}"
    latency_ms = int((time.perf_counter() - start) * 1000)

    log.info(
        "llm_probe",
        role=role,
        url=body.url,
        ok=ok,
        latency_ms=latency_ms,
        error=error,
    )
    return LlmProbeResponse(
        ok=ok,
        latency_ms=latency_ms,
        model=body.name or role,
        error=error,
    )
