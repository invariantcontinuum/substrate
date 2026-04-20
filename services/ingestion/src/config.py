"""Ingestion settings — schema only; loader lives in substrate_common.config."""
from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _IngestionSettings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    github_token: str = ""
    app_port: int = 8081
    embedding_url: str = "http://host.docker.internal:8101/v1/embeddings"
    # lazy-lamacpp exposes the model by the systemd-unit name (`embeddings`),
    # not the underlying HF path. Dim must match the served model
    # (jina-code-embeddings-0.5b → 896).
    embedding_model: str = "embeddings"
    embedding_dim: int = 896
    llm_api_key: str = "test"
    chunk_size: int = 512
    chunk_overlap: int = 64
    retention_enabled: bool = True
    retention_age_days: int = 30
    retention_per_source_cap: int = 10
    retention_tick_interval_s: int = 3600
    service_name: str = "ingestion"


settings = load_settings("", _IngestionSettings)
