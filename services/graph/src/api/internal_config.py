"""Internal-only route: ``GET /internal/config/{section}``.

Called by the gateway's ``fetch_effective_section()`` proxy. Not authed
publicly; relies on the ``substrate_internal`` docker network being
non-routable from outside.

The map below names every settings field exposed under each section.
Fields the service does not yet define resolve to ``None`` so the gateway
can advertise a new section ahead of the field actually landing on the
schema (Tasks 4.x add the missing ones).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src import config as _cfg


router = APIRouter(prefix="/internal/config", tags=["internal-config"])


# Owning service: ``graph`` owns ``graph``, ``chat``, every ``llm_*`` flavour,
# and ``postgres``. The frontend consumes these via the gateway's
# ``GET /api/config/{section}`` proxy.
_SECTIONS: dict[str, list[str]] = {
    "graph": [
        "per_sync_leiden_resolution",
        "per_sync_leiden_beta",
        "per_sync_leiden_iterations",
        "per_sync_leiden_min_cluster_size",
        "per_sync_leiden_seed",
        "per_sync_leiden_timeout_s",
        "active_set_leiden_resolution",
        "active_set_leiden_beta",
        "active_set_leiden_iterations",
        "active_set_leiden_min_cluster_size",
        "active_set_leiden_seed",
        "active_set_leiden_timeout_s",
        "active_set_leiden_labeling_enabled",
        "active_set_leiden_label_model",
    ],
    "chat": [
        "chat_top_k",
        "chat_history_turns",
        "chat_total_budget_chars",
        "chat_context_token_budget",
    ],
    "llm_dense": [
        "dense_llm_url",
        "dense_llm_model",
        "dense_llm_context_size",
        "chat_llm_timeout_s",
    ],
    "llm_sparse": [
        "sparse_llm_url",
        "sparse_llm_model",
        "sparse_llm_context_size",
        "sparse_llm_timeout_s",
        "sparse_keyword_top_k",
    ],
    "llm_embedding": [
        "embedding_url",
        "embedding_model",
        "embedding_dim",
        "embedding_max_input_chars",
        "embed_batch_size",
        "embedding_document_prefix",
        "embedding_query_prefix",
    ],
    "llm_reranker": [
        "reranker_url",
        "reranker_model",
        "reranker_top_n",
        "reranker_timeout_s",
        "reranker_rrf_k",
    ],
    "postgres": [
        "database_url",
        "pool_min_size",
        "pool_max_size",
        "pool_recycle_seconds",
        "statement_timeout_ms",
        "lock_timeout_ms",
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
