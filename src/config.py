from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    nats_url: str = "nats://local-nats-1:4222"
    database_url: str = "postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion"
    github_token: str = ""
    app_port: int = 8081
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "embeddinggemma-300M-Q8_0.gguf"
    llm_url: str = "http://localhost:8102/v1/chat/completions"
    llm_model: str = "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "substrate_nodes"


settings = Settings()
