from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    nats_url: str = "nats://local-nats-1:4222"
    database_url: str = "postgresql+asyncpg://substrate_ingestion:changeme@local-postgres:5432/substrate_ingestion"
    github_token: str = ""
    app_port: int = 8081
    poll_interval_seconds: int = 60


settings = Settings()
