"""Internal-only route: ``GET /internal/config/{section}``.

Mirrors the contract in graph/gateway. Ingestion owns the
``llm_embedding`` section because the embedding endpoint is the
ingestion service's primary upstream (file-level embeddings for
indexing). Other LLM roles (dense, sparse, reranker) live on the graph
service.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src import config as _cfg


router = APIRouter(prefix="/internal/config", tags=["internal-config"])


# Storage keys exposed under each section. The gateway translates the
# role-prefixed keys back to the panel's simple field names on the read
# path (see ``services/gateway/src/api/config.py``).
_SECTIONS: dict[str, list[str]] = {
    "llm_embedding": [
        "embedding_url",
        "embedding_model",
        "embedding_api_key",
        "embedding_context_window_tokens",
        "embedding_timeout_s",
        "embedding_ssl_verify",
    ],
}


@router.get("/{section}")
async def get_internal_section(section: str) -> dict[str, Any]:
    if section not in _SECTIONS:
        raise HTTPException(
            status_code=404, detail=f"unknown section {section!r}",
        )
    s = _cfg.settings
    return {k: getattr(s, k, None) for k in _SECTIONS[section]}
