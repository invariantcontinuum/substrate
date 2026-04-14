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
    embedding_model: str = "Qwen3-Embedding-0.6B-Q8_0.gguf"
    embedding_dim: int = 1024
    chunk_size: int = 512
    chunk_overlap: int = 64


settings = Settings()
