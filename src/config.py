from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion"
    graph_database_url: str = "postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph"
    github_token: str = ""
    app_port: int = 8081
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "embeddinggemma-300M-Q8_0.gguf"
    embedding_dim: int = 384
    chunk_size: int = 512
    chunk_overlap: int = 64


settings = Settings()
