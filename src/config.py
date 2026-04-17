from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion"
    graph_database_url: str = "postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph"
    github_token: str = ""
    app_port: int = 8081
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    # The llamacpp server ignores the `model` field in the request and
    # serves whatever model it was launched with; we keep the name here
    # only for logging/documentation. Dim must match the served model.
    # Current lazy-lamacpp embeddings model: nomic-embed-text-v2-moe
    # (768-dim, 512 ctx) — see /home/dany/github/CLAUDE.md.
    embedding_model: str = "nomic-ai/nomic-embed-text-v2-moe-GGUF"
    embedding_dim: int = 768
    # Bearer token for the OpenAI-compatible embedding endpoint.
    # Empty string skips the Authorization header entirely.
    llm_api_key: str = "test"
    chunk_size: int = 512
    chunk_overlap: int = 64
    retention_enabled: bool = True
    retention_age_days: int = 30
    retention_per_source_cap: int = 10
    retention_tick_interval_s: int = 3600


settings = Settings()
