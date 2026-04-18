from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    embedding_url: str = "http://host.docker.internal:8101/v1/embeddings"
    # lazy-lamacpp exposes models by systemd-unit name, not HF path.
    embedding_model: str = "embeddings"
    embedding_dim: int = 768
    # Dense chat LLM used for node summaries. lazy-lamacpp dense slot:
    # Qwen3.5-4B Q4_K_M (65k ctx) on port 8102.
    dense_llm_url: str = "http://host.docker.internal:8102/v1/chat/completions"
    dense_llm_model: str = "dense"
    # Bearer token shared by both the embedding and chat endpoints.
    # Empty string skips the Authorization header entirely.
    llm_api_key: str = "test"
    summary_max_tokens: int = 400
    summary_edge_neighbors: int = 10
    # Total budget is a WALL-CLOCK tradeoff, not a context-window cap.
    # At ~3 chars/token and ~800 tok/s prefill on Qwen3.5-4B Q4_K_M on
    # a 6 GB GPU, 100 k chars prefills in roughly 40 s; plus 400 gen
    # tokens at ~20 tok/s ≈ 20 s ⇒ ~60 s per summary, comfortably
    # under upstream proxy read-timeouts (~120 s NPM default). Files
    # larger than this are truncated — still ~2× the earlier 48 k cap
    # but small enough to not 504 at the edge proxy.
    summary_total_budget_chars: int = 100_000
    summary_neighbor_chars: int = 1_200
    summary_file_budget_ratio: float = 0.88
    summary_neighbor_budget_ratio: float = 0.10
    summary_instruction: str = (
        "You are summarizing a source-code node in a project graph. "
        "Write 2-3 precise sentences: what this file does and how it "
        "connects to its neighbors. No speculation beyond the excerpts."
    )
    app_port: int = 8082
    graph_query_timeout_s: int = Field(default=60, alias="GRAPH_QUERY_TIMEOUT_SECONDS")


settings = Settings()
