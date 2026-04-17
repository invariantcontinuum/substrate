from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://substrate_graph:changeme@localhost:5432/substrate_graph"
    embedding_url: str = "http://localhost:8101/v1/embeddings"
    embedding_model: str = "Qwen3-Embedding-0.6B-Q8_0.gguf"
    embedding_dim: int = 1024
    # Dense chat LLM used for node summaries. Defaults to the lazy-llamacpp
    # `dense` model on port 8102.
    dense_llm_url: str = "http://localhost:8102/v1/chat/completions"
    dense_llm_model: str = "qwen2.5-7b-instruct"
    summary_max_tokens: int = 160
    summary_chunk_sample_chars: int = 4000
    app_port: int = 8082


settings = Settings()
