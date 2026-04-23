"""Ingestion settings — schema only; loader lives in substrate_common.config."""
from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _IngestionSettings(BaseSettings):
    # ── Service ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    app_port: int = 8081
    service_name: str = "ingestion"
    github_token: str = ""

    # ── Embedding endpoint ───────────────────────────────────────────
    embedding_url: str = "http://host.docker.internal:8101/v1/embeddings"
    # lazy-lamacpp exposes the model by its systemd-unit name ("embeddings"),
    # not the underlying HF path. Dim must match the served model
    # (nomic-embed-text-v2-moe → 768).
    embedding_model: str = "embeddings"
    embedding_dim: int = 768
    llm_api_key: str = "test"

    # Prefix scheme for clustering corpus vs query vectors. jina-code-
    # embeddings recognises "search_document: " / "search_query: ".
    # Other models (E5, BGE, …) use different prefixes; set to "" when
    # using a model that has none.
    embedding_document_prefix: str = "search_document: "

    # Hard cap on per-input payload bytes sent to the embedding server.
    # Must fit inside the embedding model's context window after the
    # prefix has been prepended. At ~3 chars/token, 1400 chars is safe
    # for any context window ≥ 512 tokens; raise when switching to a
    # bigger-context model to reduce truncation-driven quality loss.
    embedding_max_input_chars: int = 1400

    # Embeddings batched per HTTP call. Larger = fewer round-trips but
    # worse bisect granularity on a poison-pill input.
    embed_batch_size: int = 32

    # HTTP timeout + pool sizing for the embedding endpoint. Raise read
    # timeout for slower host models; raise pool/max_connections only if
    # you intentionally parallelise embedding calls beyond the current
    # single-sync worker behaviour.
    embedding_http_timeout_connect_s: float = 5.0
    embedding_http_timeout_read_s: float = 120.0
    embedding_http_timeout_write_s: float = 10.0
    embedding_http_timeout_pool_s: float = 10.0

    # ── Chunker ──────────────────────────────────────────────────────
    # Target tokens per chunk produced by substrate_graph_builder.chunker.
    # Should be ≤ embedding model context (minus prefix + breadcrumb).
    chunk_size: int = 512
    # Token overlap between adjacent chunks — applied only in fallback /
    # markdown / text paths. AST chunks rely on breadcrumbs instead.
    chunk_overlap: int = 64
    # Lines of file prepended to file_summary_text() before embedding.
    # Bigger = more context per file-level vector, but more aggressive
    # truncation after the 1400-char cap.
    file_summary_preview_lines: int = 100

    # ── AGE batching ─────────────────────────────────────────────────
    # Rows per UNWIND batch for node/edge writes. Smaller = more SQL
    # round-trips; larger = bigger transaction rollback window on failure.
    age_batch_size: int = 500

    # ── Runner / scheduler loops ────────────────────────────────────
    # Poll cadence for the pending-sync runner. Lower = faster pickup,
    # more idle DB churn.
    runner_poll_interval_s: float = 2.0
    # Pending rows claimed per runner tick. Higher = more parallel syncs,
    # more DB/LLM pressure.
    runner_claim_batch_size: int = 5
    # Grace period when shutting down before cancelling in-flight syncs.
    runner_shutdown_timeout_s: float = 30.0
    # Frequency of cancellation checks inside the file-write loop. Lower
    # = faster cancel response, more status reads.
    sync_cancellation_poll_every_n: int = 50
    # Poll cadence for schedule dispatch. Lower = tighter cron latency,
    # more idle DB churn.
    scheduler_poll_interval_s: int = 30

    # ── GitHub API client ────────────────────────────────────────────
    # HTTP client sizing for GitHub metadata/commit lookups. Raise only
    # if you add more parallel GitHub API work per sync.
    github_api_max_connections: int = 30
    github_api_max_keepalive_connections: int = 20
    github_api_timeout_connect_s: float = 5.0
    github_api_timeout_read_s: float = 30.0
    github_api_timeout_write_s: float = 10.0
    github_api_timeout_pool_s: float = 10.0

    # ── Retention ────────────────────────────────────────────────────
    retention_enabled: bool = True
    retention_age_days: int = 30
    retention_per_source_cap: int = 10
    retention_tick_interval_s: int = 3600


settings = load_settings("", _IngestionSettings)
