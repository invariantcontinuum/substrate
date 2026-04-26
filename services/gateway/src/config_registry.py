"""Registry mapping config sections to owning services + Pydantic schemas.

Each section is exposed by a Settings tab in the frontend. The gateway's
``PUT /api/config/{section}`` route validates the body against the
schema, writes to runtime_config, and emits SSE so owning services
refresh their overlay.

The mapping is intentionally per-section (not per-service): a single
service may own several sections (graph owns ``graph``, ``chat``,
``llm_*``, ``postgres``), and the same schema (``_LlmConnSchema``) is
reused across the four ``llm_*`` sections.
"""
from __future__ import annotations

from pydantic import BaseModel


class _GraphConfigSchema(BaseModel):
    per_sync_leiden_resolution: float | None = None
    per_sync_leiden_beta: float | None = None
    per_sync_leiden_iterations: int | None = None
    per_sync_leiden_min_cluster_size: int | None = None
    per_sync_leiden_seed: int | None = None
    per_sync_leiden_timeout_s: int | None = None
    active_set_leiden_resolution: float | None = None
    active_set_leiden_beta: float | None = None
    active_set_leiden_iterations: int | None = None
    active_set_leiden_min_cluster_size: int | None = None
    active_set_leiden_seed: int | None = None
    active_set_leiden_timeout_s: int | None = None
    active_set_leiden_labeling_enabled: bool | None = None
    active_set_leiden_label_model: str | None = None
    layout: str | None = None


class _ChatConfigSchema(BaseModel):
    chat_top_k: int | None = None
    chat_history_turns: int | None = None
    chat_total_budget_chars: int | None = None
    chat_context_token_budget: int | None = None


class _LlmConnSchema(BaseModel):
    url: str | None = None
    model: str | None = None
    context_size: int | None = None
    timeout_s: float | None = None
    document_prefix: str | None = None
    query_prefix: str | None = None
    max_input_chars: int | None = None
    batch_size: int | None = None
    top_k: int | None = None
    top_n: int | None = None


class _PostgresConfigSchema(BaseModel):
    database_url: str | None = None
    pool_min_size: int | None = None
    pool_max_size: int | None = None
    pool_recycle_seconds: int | None = None
    statement_timeout_ms: int | None = None
    lock_timeout_ms: int | None = None


class _AuthConfigSchema(BaseModel):
    keycloak_account_console_url: str | None = None


class _GithubConfigSchema(BaseModel):
    github_pat: str | None = None


# Section name -> (owning service name, Pydantic schema).
# Owning service name is the docker-compose hostname (matches
# ``http://<owner>:<port>`` for internal calls).
REGISTRY: dict[str, tuple[str, type[BaseModel]]] = {
    "graph":         ("graph",   _GraphConfigSchema),
    "chat":          ("graph",   _ChatConfigSchema),
    "llm_dense":     ("graph",   _LlmConnSchema),
    "llm_sparse":    ("graph",   _LlmConnSchema),
    "llm_embedding": ("graph",   _LlmConnSchema),
    "llm_reranker":  ("graph",   _LlmConnSchema),
    "postgres":      ("graph",   _PostgresConfigSchema),
    "auth":          ("gateway", _AuthConfigSchema),
    "github":        ("gateway", _GithubConfigSchema),
}


def lookup_section(section: str) -> tuple[str, type[BaseModel]]:
    """Return ``(owner_service, schema_class)`` for ``section``.

    Raises ``KeyError`` if the section is not registered. Callers in the
    HTTP layer translate that into a 404.
    """
    if section not in REGISTRY:
        raise KeyError(section)
    return REGISTRY[section]
