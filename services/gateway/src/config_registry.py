"""Registry mapping config sections to owning services + Pydantic schemas.

Each section is exposed by a Settings tab in the frontend. The gateway's
``PUT /api/config/{section}`` route validates the body against the
schema, writes to runtime_config, and emits SSE so owning services
refresh their overlay.

The mapping is intentionally per-section (not per-service): a single
service may own several sections. The four ``llm_*`` sections share a
single ``_LlmConnSchema`` (``name`` / ``url`` / ``api_key`` /
``context_window_tokens`` / ``timeout_s`` / ``ssl_verify``); the panel
sends those keys, and the gateway translates them to per-role storage
keys via ``LLM_FIELD_MAP`` before writing.
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
    chat_history_turns_default: int | None = None
    chat_total_budget_chars: int | None = None
    chat_context_token_budget: int | None = None


class _LlmConnSchema(BaseModel):
    """Wire shape for the LLM Connections panel.

    All four roles (``dense`` / ``sparse`` / ``embedding`` / ``reranker``)
    expose the same six fields. The panel never sends a "type" field —
    the role is implicit from the section path (``llm_<role>``).

    Storage uses role-prefixed keys (e.g. ``dense_llm_url``,
    ``embedding_api_key``) so the four roles coexist inside the single
    runtime overlay scope owned by the service. The gateway translates
    here-shaped bodies to storage keys via ``LLM_FIELD_MAP`` before the
    PUT lands in ``runtime_config``.
    """

    name: str | None = None
    url: str | None = None
    api_key: str | None = None
    context_window_tokens: int | None = None
    timeout_s: float | None = None
    ssl_verify: bool | None = None


# Per-role field map: panel field → storage key on the owning service.
# Mirrored on the read path inside ``services/<svc>/src/api/internal_config.py``
# so ``GET /api/config/llm_<role>`` returns simple panel keys.
LLM_FIELD_MAP: dict[str, dict[str, str]] = {
    "llm_dense": {
        "name": "dense_llm_model",
        "url": "dense_llm_url",
        "api_key": "dense_llm_api_key",
        "context_window_tokens": "dense_llm_context_size",
        "timeout_s": "dense_llm_timeout_s",
        "ssl_verify": "dense_llm_ssl_verify",
    },
    "llm_sparse": {
        "name": "sparse_llm_model",
        "url": "sparse_llm_url",
        "api_key": "sparse_llm_api_key",
        "context_window_tokens": "sparse_llm_context_size",
        "timeout_s": "sparse_llm_timeout_s",
        "ssl_verify": "sparse_llm_ssl_verify",
    },
    "llm_embedding": {
        "name": "embedding_model",
        "url": "embedding_url",
        "api_key": "embedding_api_key",
        "context_window_tokens": "embedding_context_window_tokens",
        "timeout_s": "embedding_timeout_s",
        "ssl_verify": "embedding_ssl_verify",
    },
    "llm_reranker": {
        "name": "reranker_model",
        "url": "reranker_url",
        "api_key": "reranker_api_key",
        "context_window_tokens": "reranker_context_window_tokens",
        "timeout_s": "reranker_timeout_s",
        "ssl_verify": "reranker_ssl_verify",
    },
}


class _PostgresConfigSchema(BaseModel):
    """Wire shape for the Settings → Postgres panel.

    The panel sends six discrete connection knobs (``host`` / ``port``
    / ``database`` / ``user`` / ``password`` / ``ssl_verify``) plus the
    standard pool tunables. The gateway translates these to the
    ``pg_*`` storage keys via ``POSTGRES_FIELD_MAP`` before writing
    into ``runtime_config``; the graph service composes a DSN from
    the discrete fields at startup.
    """

    host: str | None = None
    port: int | None = None
    database: str | None = None
    user: str | None = None
    password: str | None = None
    ssl_verify: bool | None = None
    pool_min_size: int | None = None
    pool_max_size: int | None = None
    pool_recycle_seconds: int | None = None
    statement_timeout_ms: int | None = None
    lock_timeout_ms: int | None = None


# Postgres-section panel-key → storage-key map. Mirrors
# ``LLM_FIELD_MAP`` so the gateway's read/write paths stay symmetrical.
POSTGRES_FIELD_MAP: dict[str, str] = {
    "host": "pg_host",
    "port": "pg_port",
    "database": "pg_database",
    "user": "pg_user",
    "password": "pg_password",
    "ssl_verify": "pg_ssl_verify",
    "pool_min_size": "pg_pool_min_size",
    "pool_max_size": "pg_pool_max_size",
    "pool_recycle_seconds": "pg_pool_recycle_seconds",
    "statement_timeout_ms": "pg_statement_timeout_ms",
    "lock_timeout_ms": "pg_lock_timeout_ms",
}


class _AuthConfigSchema(BaseModel):
    keycloak_account_console_url: str | None = None


class _GithubConfigSchema(BaseModel):
    github_pat: str | None = None


# Section name -> (owning service name, Pydantic schema).
# Owning service name is the docker-compose hostname (matches
# ``http://<owner>:<port>`` for internal calls).
REGISTRY: dict[str, tuple[str, type[BaseModel]]] = {
    "graph":         ("graph",     _GraphConfigSchema),
    "chat":          ("graph",     _ChatConfigSchema),
    "llm_dense":     ("graph",     _LlmConnSchema),
    "llm_sparse":    ("graph",     _LlmConnSchema),
    "llm_embedding": ("ingestion", _LlmConnSchema),
    "llm_reranker":  ("graph",     _LlmConnSchema),
    "postgres":      ("graph",     _PostgresConfigSchema),
    "auth":          ("gateway",   _AuthConfigSchema),
    "github":        ("gateway",   _GithubConfigSchema),
}


def lookup_section(section: str) -> tuple[str, type[BaseModel]]:
    """Return ``(owner_service, schema_class)`` for ``section``.

    Raises ``KeyError`` if the section is not registered. Callers in the
    HTTP layer translate that into a 404.
    """
    if section not in REGISTRY:
        raise KeyError(section)
    return REGISTRY[section]
