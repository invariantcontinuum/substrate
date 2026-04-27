"""Internal: assemble the chat prompt body for the gateway's tokenize proxy.

Not auth-gated — relies on the ``substrate_internal`` docker network being
non-routable from outside. Called only by the gateway's
``POST /api/llm/dense/tokenize`` handler.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from src.graph import store
from src.graph.chat_context_resolver import _parse_entry, resolve_entries
from src.graph.chat_pipeline import (
    _format_full_files_section,
    _format_graph_context_section,
)

router = APIRouter(prefix="/internal/chat", tags=["internal-chat"])


class PreviewRequest(BaseModel):
    entries: list[dict[str, Any]]
    message: str = ""
    user_sub: str


class PreviewResponse(BaseModel):
    prompt: str
    prompt_chars: int


@router.post("/preview-prompt", response_model=PreviewResponse)
async def preview_prompt(req: PreviewRequest) -> PreviewResponse:
    pool = store.get_pool()
    entries = [_parse_entry(e) for e in req.entries]
    scope = await resolve_entries(entries, pool, req.user_sub)
    files_s = await _format_full_files_section(pool, scope.file_ids)
    graph_s = await _format_graph_context_section(scope.neighbors, pool)
    user_s = f"## User\n\n{req.message}" if req.message else ""
    prompt = "\n\n".join(s for s in (files_s, graph_s, user_s) if s)
    return PreviewResponse(prompt=prompt, prompt_chars=len(prompt))
