"""Internal-only route: ``GET /internal/config/{section}``.

Called by the gateway's ``fetch_effective_section()`` proxy. Not authed
publicly; relies on the ``substrate_internal`` docker network being
non-routable from outside.

The map below names every settings field exposed under each section.
Storage uses role-prefixed keys for the LLM sections; the gateway
translates them back to the panel's simple field names on the read
path (see ``services/gateway/src/api/config.py``).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from src import config as _cfg


router = APIRouter(prefix="/internal/config", tags=["internal-config"])


# Owning service: ``graph`` owns ``graph``, ``chat``, the dense / sparse /
# reranker LLM sections, and ``postgres``. The frontend consumes these
# via the gateway's ``GET /api/config/{section}`` proxy.
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
        "dense_llm_api_key",
        "dense_llm_context_size",
        "dense_llm_timeout_s",
        "dense_llm_ssl_verify",
    ],
    "llm_sparse": [
        "sparse_llm_url",
        "sparse_llm_model",
        "sparse_llm_api_key",
        "sparse_llm_context_size",
        "sparse_llm_timeout_s",
        "sparse_llm_ssl_verify",
    ],
    "llm_reranker": [
        "reranker_url",
        "reranker_model",
        "reranker_api_key",
        "reranker_context_window_tokens",
        "reranker_timeout_s",
        "reranker_ssl_verify",
    ],
    # Postgres section: six discrete connection knobs + five pool/timeout
    # tunables. Storage uses `pg_*` prefix on the settings class so the
    # column space stays disjoint from the rest of the graph scope; the
    # gateway's POSTGRES_FIELD_MAP translates the panel's bare keys
    # (`host`, `port`, …) to these storage keys before writing, and back
    # to the bare panel shape on the read path.
    "postgres": [
        "pg_host",
        "pg_port",
        "pg_database",
        "pg_user",
        "pg_password",
        "pg_ssl_verify",
        "pg_pool_min_size",
        "pg_pool_max_size",
        "pg_pool_recycle_seconds",
        "pg_statement_timeout_ms",
        "pg_lock_timeout_ms",
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
