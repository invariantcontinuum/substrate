from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@localhost:5432/substrate_graph"
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    # lazy-lamacpp exposes models by systemd-unit name, not HF path.
    embedding_model: str = "embeddings"
    embedding_dim: int = 768
    # Dense chat LLM used for node summaries. lazy-lamacpp dense slot:
    # Qwen3.5-4B Q4_K_M (65k ctx) on port 8102.
    dense_llm_url: str = "http://localhost:8102/v1/chat/completions"
    dense_llm_model: str = "dense"
    # Bearer token shared by both the embedding and chat endpoints.
    # Empty string skips the Authorization header entirely.
    llm_api_key: str = "test"
    summary_max_tokens: int = 400
    summary_edge_neighbors: int = 10
    # Full-file budget: tuned to Qwen3.5-4B's 65k-token context window.
    # ~4 chars/token ⇒ ~260k chars; leave ~60k headroom for system
    # prompt, neighbors, and completion. Previously 48k capped files at
    # ~1k lines and silently dropped the rest of large files.
    summary_total_budget_chars: int = 200_000
    summary_neighbor_chars: int = 1_200
    summary_file_budget_ratio: float = 0.85
    summary_neighbor_budget_ratio: float = 0.12
    summary_instruction: str = (
        "You are summarizing a source-code node in a project graph. "
        "Write 2-3 precise sentences: what this file does and how it "
        "connects to its neighbors. No speculation beyond the excerpts."
    )
    app_port: int = 8082
    graph_query_timeout_s: int = Field(default=60, alias="GRAPH_QUERY_TIMEOUT_SECONDS")


settings = Settings()
