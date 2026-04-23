"""Graph settings — schema only; loader lives in substrate_common.config."""
from pydantic import Field
from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _GraphSettings(BaseSettings):
    # ── Service ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    app_port: int = 8082
    service_name: str = "graph"

    # ── Embedding endpoint ───────────────────────────────────────────
    embedding_url: str = "http://host.docker.internal:8101/v1/embeddings"
    # lazy-lamacpp exposes models by systemd-unit name, not HF path.
    embedding_model: str = "embeddings"
    # Must match the pgvector column dim (migrations V4/V7/V8/V9/V10).
    # The startup guard fails fast on mismatch.
    embedding_dim: int = 896
    # Query-side prefix paired with ingestion's document prefix. jina-
    # code-embeddings uses "search_query: "; override when swapping
    # models (EMBEDDING_QUERY_PREFIX=query:  for E5, empty for BGE, …).
    embedding_query_prefix: str = "search_query: "
    # Hard cap on the query string sent to the embedding server, same
    # shape as ingestion's cap. Must fit inside the embedding model's
    # context window after the prefix.
    embedding_max_input_chars: int = 1400

    # ── Dense LLM (summary generation) ───────────────────────────────
    # lazy-lamacpp serves the Qwen3.5-2B Q8_0 GGUF on port 8102 with a
    # 60 k-token context slot by default. Changing the served model or
    # its CONTEXT_SIZE (in ops/llm/lazy-lamacpp/config/models/dense.env)
    # MUST be reflected in SUMMARY_TOTAL_BUDGET_CHARS below, otherwise
    # prompts will either overflow or waste context.
    dense_llm_url: str = "http://host.docker.internal:8102/v1/chat/completions"
    dense_llm_model: str = "dense"
    # Bearer token shared by both the embedding and chat endpoints.
    # Empty string skips the Authorization header entirely.
    llm_api_key: str = "test"

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

    # ── Ask (RAG chat) ───────────────────────────────────────────────
    # Top-K retrieval count per turn. Higher = more context for the LLM,
    # longer prefill time. Retrieval scope is always the user-supplied
    # sync_ids (the client passes the active sync set at turn time).
    ask_top_k: int = 10
    # Number of prior user+assistant turns to include in the prompt.
    # Higher = better conversational continuity, larger prompt cost.
    ask_history_turns: int = 6
    # Total prompt char budget. Keep ≤ ~3× dense LLM CONTEXT_SIZE (set in
    # ops/llm/lazy-lamacpp/config/models/dense.env). If the budget would
    # be exceeded the pipeline drops the oldest prior turns first, then
    # trims per-node context entries.
    ask_total_budget_chars: int = 40_000
    # Decode cap for answers. Pre-MVP 1–3 short paragraphs → ~800 tokens.
    ask_max_tokens: int = 800
    # Comma-separated retry scales on HTTP-400 context-window errors,
    # same shape as summary_context_retry_scales.
    ask_context_retry_scales: str = "1.0,0.5,0.25"
    # Sampling temperature for ask answers. Lower = more deterministic
    # and grounded; higher = more varied phrasing. 0.2 matches the pre-MVP
    # baseline for RAG-grounded answers.
    ask_temperature: float = 0.2
    # HTTP read timeout (seconds) for the dense LLM call from the pipeline.
    # Must stay ≤ the gateway's long-LLM timeout (115s) so the gateway
    # doesn't clip the request mid-flight.
    ask_llm_timeout_s: float = 110.0
    # System prompt for the ask pipeline. Changing this reshapes every
    # future answer — keep short, task-focused, and format-strict.
    ask_system_instruction: str = (
        "You are answering questions about a codebase knowledge graph. "
        "Use ONLY the node context provided below; if the answer is not "
        "supported by that context, say so plainly. Respond as a single "
        "JSON object: {\"answer\": \"<prose>\", \"cited_node_ids\": "
        "[\"<id1>\", ...]}. Keep the answer to 1-3 short paragraphs. "
        "Cite every node you actually used."
    )

    @property
    def summary_retry_scales_tuple(self) -> tuple[float, ...]:
        """Parse the comma-separated env value into a tuple of floats."""
        parts = [p.strip() for p in self.summary_context_retry_scales.split(",") if p.strip()]
        return tuple(float(p) for p in parts) or (1.0,)

    @property
    def ask_retry_scales_tuple(self) -> tuple[float, ...]:
        parts = [p.strip() for p in self.ask_context_retry_scales.split(",") if p.strip()]
        return tuple(float(p) for p in parts) or (1.0,)


settings = load_settings("", _GraphSettings)
