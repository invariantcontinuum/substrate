from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    nats_url: str = "nats://local-nats-1:4222"
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@local-postgres:5432/substrate_graph"
    neo4j_url: str = "bolt://local-neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"
    redis_url: str = "redis://local-redis:6379"
    app_port: int = 8082


settings = Settings()
