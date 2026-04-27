"""Tokenize a chat-context preview against the dense LLM.

``POST /api/llm/dense/tokenize`` assembles the prompt that the chat pipeline
would build for the supplied ``entries`` + ``message``, then proxies the
assembled text to the dense LLM's llama.cpp-compatible ``/tokenize`` endpoint
to get a precise token count.  A graceful fallback is returned when the
upstream tokenizer is unreachable (e.g. model not loaded) so the UI can
degrade to a char-based estimate rather than erroring out.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.api.config import current_user
from src.config import settings

log = structlog.get_logger()

router = APIRouter(prefix="/api/llm/dense", tags=["llm-tokenize"])


class TokenizeRequest(BaseModel):
    entries: list[dict[str, Any]]
    message: str = ""


class TokenizeResponse(BaseModel):
    tokens: int | None
    prompt_chars: int
    error: str | None = None


@router.post("/tokenize", response_model=TokenizeResponse)
async def tokenize(
    payload: TokenizeRequest,
    user: dict[str, Any] = Depends(current_user),
) -> TokenizeResponse:
    # Extract sub from claims — same logic as other endpoints.
    user_sub: str = (
        user.get("sub")
        or user.get("preferred_username")
        or user.get("email")
        or "unknown"
    )

    # 1. Build the prompt via the graph internal preview endpoint.
    graph_preview_url = (
        settings.graph_service_url.rstrip("/") + "/internal/chat/preview-prompt"
    )
    async with httpx.AsyncClient(timeout=20.0) as client:
        preview_resp = await client.post(
            graph_preview_url,
            json={
                "entries": payload.entries,
                "message": payload.message,
                "user_sub": user_sub,
            },
        )
        preview_resp.raise_for_status()
    preview = preview_resp.json()
    prompt: str = preview["prompt"]
    prompt_chars: int = preview["prompt_chars"]

    # 2. Tokenize against the dense LLM's /tokenize endpoint.
    tokenize_url = settings.llm_dense_url.rstrip("/") + "/tokenize"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(tokenize_url, json={"content": prompt})
            resp.raise_for_status()
        tokens = len(resp.json()["tokens"])
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        log.warning("tokenize_upstream_unreachable", url=tokenize_url, error=str(exc))
        return TokenizeResponse(
            tokens=None,
            prompt_chars=prompt_chars,
            error="tokenizer_unreachable",
        )

    log.info("tokenize_ok", tokens=tokens, prompt_chars=prompt_chars)
    return TokenizeResponse(tokens=tokens, prompt_chars=prompt_chars)
