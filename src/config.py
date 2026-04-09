from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    nats_url: str = "nats://local-nats-1:4222"
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph"
    neo4j_url: str = "bolt://local-neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"
    redis_url: str = "redis://local-redis:6379"
    app_port: int = 8082
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "embeddinggemma-300M-Q8_0.gguf"
    reranker_url: str = "http://localhost:8104/v1/embeddings"
    qdrant_url: str = "http://localhost:6333"
    qdrant_collection: str = "substrate_nodes"


settings = Settings()
