from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@localhost:5432/substrate_graph"
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "google/gemma-4-e4b"
    embedding_dim: int = 1024
    # Dense chat LLM used for node summaries. Defaults to the same
    # lazy-llamacpp gemma server on port 8101 which serves both
    # embeddings and chat completions via the OpenAI-compatible API.
    dense_llm_url: str = "http://localhost:8101/v1/chat/completions"
    dense_llm_model: str = "google/gemma-4-e4b"
    # Bearer token shared by both the embedding and chat endpoints.
    # Gemma/lazy-lamacpp expects "test" by default; empty string skips
    # the Authorization header entirely.
    llm_api_key: str = "test"
    summary_max_tokens: int = 160
    summary_chunk_sample_chars: int = 4000
    summary_edge_neighbors: int = 10
    summary_total_budget_chars: int = 48_000
    summary_neighbor_chars: int = 1_200
    summary_file_budget_ratio: float = 0.70
    summary_neighbor_budget_ratio: float = 0.25
    summary_instruction: str = (
        "You are summarizing a source-code node in a project graph. "
        "Write 2-3 precise sentences: what this file does and how it "
        "connects to its neighbors. No speculation beyond the excerpts."
    )
    app_port: int = 8082
    graph_query_timeout_s: int = Field(default=60, alias="GRAPH_QUERY_TIMEOUT_SECONDS")


settings = Settings()
