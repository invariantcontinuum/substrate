"""Graph settings — schema only; loader lives in substrate_common.config."""
from typing import ClassVar

from pydantic import Field

from substrate_common.config import LayeredSettings, load_settings


class _GraphSettings(LayeredSettings):
    SCOPE: ClassVar[str] = "graph"

    # ── Service ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    app_port: int = 8082
    service_name: str = "graph"

    # ── Embedding endpoint ───────────────────────────────────────────
    # Per-role connection knobs (matches the LLM Connections panel
    # surface). Each role owns its own URL, name, api_key, context
    # window, timeout, and ssl_verify so deployers can point each role
    # at a different endpoint / different bearer token without sharing
    # a single global `llm_api_key`. The Settings → LLM Connections tab
    # writes these via `PUT /api/config/llm_<role>` with simple field
    # names (`name`, `url`, `api_key`, …); the gateway translates back
    # to the storage keys below.
    embedding_url: str = "http://host.docker.internal:8101/v1/embeddings"
    # lazy-lamacpp exposes models by systemd-unit name, not HF path.
    embedding_model: str = "embeddings"
    embedding_api_key: str = "test"
    embedding_ssl_verify: bool = True
    # Read budget (seconds) for the embedding HTTP call. Must fit one
    # query-time embedding round-trip on the host LLM stack.
    embedding_timeout_s: float = 30.0
    # ≤ <llm-stack>/config/models/embeddings.env CONTEXT_SIZE.
    embedding_context_window_tokens: int = 8192
    # Must match the pgvector column dim (migrations V4/V7/V8/V9/V10).
    # The startup guard fails fast on mismatch.
    embedding_dim: int = 768
    # Query-side prefix paired with ingestion's document prefix. jina-
    # code-embeddings uses "search_query: "; override when swapping
    # models (EMBEDDING_QUERY_PREFIX=query:  for E5, empty for BGE, …).
    embedding_query_prefix: str = "search_query: "
    # Hard cap on the query string sent to the embedding server, same
    # shape as ingestion's cap. Must fit inside the embedding model's
    # context window after the prefix.
    embedding_max_input_chars: int = 1400

    # ── Dense LLM (summary generation + chat answers) ────────────────
    # lazy-lamacpp serves the Qwen3.5-2B Q8_0 GGUF on port 8102 with a
    # 60 k-token context slot by default. Changing the served model or
    # its CONTEXT_SIZE (in <llm-stack>/config/models/dense.env)
    # MUST be reflected in SUMMARY_TOTAL_BUDGET_CHARS below, otherwise
    # prompts will either overflow or waste context.
    dense_llm_url: str = "http://host.docker.internal:8102/v1/chat/completions"
    dense_llm_model: str = "dense"
    dense_llm_api_key: str = "test"
    dense_llm_ssl_verify: bool = True
    # ≤ <llm-stack>/config/models/dense.env CONTEXT_SIZE.
    dense_llm_context_size: int = 60000
    # HTTP read timeout (seconds) for the dense LLM call. Must stay ≤
    # the gateway's long-LLM timeout (115s) so the gateway doesn't clip
    # the request mid-flight.
    dense_llm_timeout_s: float = 110.0

    # ── Sparse LLM (BM25-like keyword retrieval helper) ──────────────
    # Memory: ~1 GB VRAM. Latency: ~50ms per query expansion.
    sparse_llm_url: str = "http://host.docker.internal:8103/v1/chat/completions"
    sparse_llm_model: str = "sparse"
    sparse_llm_api_key: str = "test"
    sparse_llm_ssl_verify: bool = True
    # ≤ <llm-stack>/config/models/sparse.env CONTEXT_SIZE.
    sparse_llm_context_size: int = 16384
    sparse_llm_timeout_s: float = 20.0
    # Top-K candidates returned by the sparse keyword retriever.
    sparse_keyword_top_k: int = 20

    # ── Reranker (cross-encoder reranking) ───────────────────────────
    # Memory: ~2 GB VRAM. Latency: ~200ms for 20 candidates.
    reranker_url: str = "http://host.docker.internal:8104/reranking"
    reranker_model: str = "reranker"
    reranker_api_key: str = "test"
    reranker_ssl_verify: bool = True
    reranker_context_window_tokens: int = 8192
    reranker_top_n: int = 5
    reranker_timeout_s: float = 30.0
    # Reciprocal rank fusion constant; higher = flatter score curve.
    reranker_rrf_k: int = 60

    # ── Retrieval pipeline ───────────────────────────────────────────
    # Dense pgvector candidate count fed into the optional sparse fuse + reranker.
    retrieval_dense_top_k: int = 20
    # When false, skip sparse retrieval and RRF fusion — dense candidates feed
    # the reranker directly.
    retrieval_use_sparse: bool = True
    # When false, skip the reranker — RRF/dense top-N is used directly.
    retrieval_use_reranker: bool = True

    # Max tokens the model is allowed to produce for a summary. Keep in
    # sync with the system-prompt length guidance (2-3 sentences → ~400
    # tokens max). Raising this costs decode-time latency; lowering
    # truncates useful summaries.
    summary_max_tokens: int = 400

    # ── Enriched-summary prompt budget ──────────────────────────────
    # Total prompt char budget. Tune to your dense LLM's CONTEXT_SIZE:
    # at ~3 chars/token, 100 000 chars ≈ 33 k tokens, comfortably
    # under the 60 k context. For larger-context models (e.g. 128 k),
    # raise this to trade longer prefill time for higher-fidelity
    # summaries. Files larger than the file-portion of the budget are
    # truncated with "[… file truncated for context window …]".
    summary_total_budget_chars: int = 100_000
    # Top-K edge neighbors pulled per summary. Higher = more graph
    # context, longer prefill; lower = faster, thinner summaries.
    summary_edge_neighbors: int = 10
    # Per-neighbor block cap (char budget for one neighbor's context
    # entry — name, description, first-lines).
    summary_neighbor_chars: int = 1_200
    # Portion of summary_total_budget_chars spent on the file body.
    summary_file_budget_ratio: float = 0.88
    # Portion spent on the (top-K) neighbor block. The remainder
    # (1 - file - neighbor) is reserved for system prompt + section
    # headers and intentionally left unused.
    summary_neighbor_budget_ratio: float = 0.10
    # Retry scales on HTTP-400 context-window-error. Comma-separated
    # floats, applied in order. After exhausting the list the pipeline
    # returns source="llm_failed" rather than raise.
    summary_context_retry_scales: str = "1.0,0.5,0.25"
    # System prompt sent as the `system` message. Changing this
    # reshapes every future summary — keep it short, task-focused,
    # and model-agnostic.
    summary_instruction: str = (
        "You are summarizing a source-code node in a project graph. "
        "Write 2-3 precise sentences: what this file does and how it "
        "connects to its neighbors. No speculation beyond the excerpts."
    )

    # ── File reconstruction ─────────────────────────────────────────
    # Hard cap on the bytes returned from reconstruct_chunks().
    # Larger = more memory per request; smaller = more files get
    # returned with truncated=True. 5 MiB accommodates >99 % of source
    # files in practice.
    file_reconstruct_max_bytes: int = 5 * 1024 * 1024

    # ── AGE reads ────────────────────────────────────────────────────
    # Wall-clock cap for merged-graph Cypher queries — protects the
    # asyncpg pool against a stuck AGE plan (e.g. missing index).
    graph_query_timeout_s: int = Field(default=60, alias="GRAPH_QUERY_TIMEOUT_SECONDS")

    # ── SSE event retention ──────────────────────────────────────────
    # Toggle periodic pruning of old rows from public.sse_events.
    # Disable only for debugging; the table is append-only.
    sse_retention_enabled: bool = True
    # Keep SSE rows for this many hours before pruning.
    sse_retention_hours: int = 24
    # Prune cadence (seconds). Lower = fresher table, more delete work.
    sse_retention_tick_s: int = 3600
    # Max rows deleted per SQL round inside one prune pass.
    sse_retention_batch_size: int = 5_000

    # ── Chat (RAG chat) ───────────────────────────────────────────────
    # Top-K retrieval count per turn. Higher = more context for the LLM,
    # longer prefill time. Retrieval scope is always the user-supplied
    # sync_ids (the client passes the active sync set at turn time).
    chat_top_k: int = 10
    # Number of prior user+assistant turns to include in the prompt.
    # Higher = better conversational continuity, larger prompt cost.
    chat_history_turns: int = 6
    # Total prompt char budget. Keep ≤ ~3× dense LLM CONTEXT_SIZE (set in
    # <llm-stack>/config/models/dense.env). If the budget would
    # be exceeded the pipeline drops the oldest prior turns first, then
    # trims per-node context entries.
    chat_total_budget_chars: int = 40_000
    # Decode cap for answers. Pre-MVP 1–3 short paragraphs → ~800 tokens.
    chat_max_tokens: int = 800
    # Comma-separated retry scales on HTTP-400 context-window errors,
    # same shape as summary_context_retry_scales.
    chat_context_retry_scales: str = "1.0,0.5,0.25"
    # Sampling temperature for chat answers. Lower = more deterministic
    # and grounded; higher = more varied phrasing. 0.2 matches the pre-MVP
    # baseline for RAG-grounded answers.
    chat_temperature: float = 0.2

    # ── Chat context (spec 2026-04-25-backend-foundations §4.1) ─────
    # Hard cap on tokens summed across included context files in a single
    # thread. The pipeline returns 413 when the active set exceeds this;
    # the user must drop files in the modal to fit. Must be ≤ the dense
    # LLM CONTEXT_SIZE in <llm-stack>/config/models/dense.env.
    # Trade-off: larger = richer context, more VRAM + slower per-message
    # build; smaller = users must drop more files to fit.
    chat_context_token_budget: int = 24000

    # ── JSON export safety net (spec §4.4) ──────────────────────────
    # Refuse JSON export if the resolved scope contains more files than
    # this. Trade-off: larger = giant downloads possible; smaller =
    # better DX in monorepos but legitimately big graphs blocked.
    export_max_files: int = 10000

    # System prompt for the chat pipeline. Changing this reshapes every
    # future answer — keep short, task-focused, and format-strict.
    # Shell-quoted in .env examples so scripts/configure.sh can source them.
    chat_system_instruction: str = (
        "You are a code-aware assistant grounded in a knowledge graph of "
        "source files. Answer the user's question using markdown. Cite source "
        "nodes inline with [ref:UUID] markers, where UUID is exactly one of "
        "the candidate node IDs supplied in the user message context. "
        "Do not output JSON. Do not invent UUIDs. If the context doesn't "
        "support the answer, say so plainly."
    )

    # Appended to the chat system prompt when the cite_evidence tool is
    # advertised. The LLM is asked to call cite_evidence whenever it
    # quotes or paraphrases a specific code range so the UI can show a
    # collapsible "Evidence" affordance under each turn.
    # Shell-quote in .env examples — scripts/configure.sh sources them.
    chat_evidence_instruction: str = (
        "When you reference specific code or content from a file, also call "
        "the cite_evidence function with the precise line range that "
        "supports your claim. Call it once per distinct evidence range. "
        "If you cannot identify a precise range, omit the call rather than "
        "fabricating one."
    )

    # Toggle for advertising the cite_evidence tool to the dense LLM. Some
    # llama.cpp builds reject unknown request keys; flip this off to fall
    # back to the [CITE …] inline-marker regex without touching code.
    chat_tools_enabled: bool = True

    # Hard cap on inline [CITE …] markers parsed from the assistant text
    # when the LLM ignores the tools request body. Caps the worst-case
    # write storm if a hallucinating model emits hundreds of markers.
    chat_evidence_max_per_turn: int = 25

    # Bound on the regenerate background polling loop that links a
    # superseded assistant row to its replacement once stream_turn has
    # inserted the new chat_messages row. Must be ≥ dense_llm_timeout_s
    # so a slow-but-successful stream still gets linked; the headroom
    # above the LLM read budget absorbs gateway round-trips. Trade-off:
    # higher = correct linking even on the slowest streams; lower = a
    # task hung by a stuck pool releases its memory faster.
    chat_regenerate_link_timeout_s: float = 130.0

    @property
    def summary_retry_scales_tuple(self) -> tuple[float, ...]:
        """Parse the comma-separated env value into a tuple of floats."""
        parts = [p.strip() for p in self.summary_context_retry_scales.split(",") if p.strip()]
        return tuple(float(p) for p in parts) or (1.0,)

    @property
    def chat_retry_scales_tuple(self) -> tuple[float, ...]:
        parts = [p.strip() for p in self.chat_context_retry_scales.split(",") if p.strip()]
        return tuple(float(p) for p in parts) or (1.0,)

    # ── Active-set Leiden (spec §5.6) ────────────────────────────────
    # On-demand community detection over the active sync set, cached in
    # leiden_cache. Distinct from ingestion's per-sync Leiden: these knobs
    # are user-tunable (Sources · Config tab). Changing them here changes
    # only the defaults; the user's prefs override at request time.
    active_set_leiden_enabled: bool = True
    # Max seconds before graspologic is cancelled. Benchmark on host before
    # raising — Xeon E-2126G / 20k nodes currently ~5s.
    active_set_leiden_timeout_s: int = 15
    # LLM-generated community labels. Requires dense LLM on host (lazy-lamacpp).
    # Disabling is safe: labels fall back to "Community N".
    active_set_leiden_labeling_enabled: bool = True
    # Model name at the dense LLM endpoint. Depends on ops/llm/lazy-lamacpp.
    active_set_leiden_label_model: str = "dense"

    # ── Leiden cache lifecycle (spec §5.4) ──────────────────────────
    # Cache TTL. Longer = more hits after restarts; too long = stale rows
    # lingering past their sync-set invalidation.
    leiden_cache_ttl_hours: int = 24
    # Sweep interval for expired rows. Bounded delete (LIMIT 500) per sweep
    # to avoid long locks on large caches.
    leiden_cache_sweep_interval_s: int = 900
    # LRU cap per user. Heavy knob-tweaking still evicts.
    leiden_cache_max_rows_per_user: int = 20
    # Max node_ids attached to each CommunityEntry in the /api/communities
    # response. Full assignments stream via /api/communities/{key}/assignments.
    # Higher = larger payload + fewer drill-down round-trips; lower = smaller
    # payload but the UI must page through get_community_nodes more.
    leiden_community_sample_size: int = 20

    # ── Keycloak admin (spec §9.7, P4) ──────────────────────────────
    # Service-account access to Keycloak for end-all-sessions + account-
    # deletion flows. An empty client_secret short-circuits the sessions
    # endpoint with 501 so unconfigured stacks fail loudly.
    keycloak_admin_url: str = "http://keycloak:8080/admin/realms/substrate"
    keycloak_token_url: str = (
        "http://keycloak:8080/realms/substrate/protocol/openid-connect/token"
    )
    keycloak_admin_client_id: str = "substrate-admin"
    keycloak_admin_client_secret: str = ""

    # ── GitHub integration validation (spec §9.9, P4) ───────────────
    # Account · Integrations uses this timeout when hitting GitHub's
    # /user endpoint to validate a pasted PAT.
    github_validate_timeout_s: int = 10


settings = load_settings("", _GraphSettings)
