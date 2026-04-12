from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph"
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "embeddinggemma-300M-Q8_0.gguf"
    app_port: int = 8082


settings = Settings()
