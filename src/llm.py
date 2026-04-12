import httpx
import structlog
from src.config import settings

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=10.0))
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def embed(text: str) -> list[float]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": text, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def embed_batch(texts: list[str]) -> list[list[float]]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": texts, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    data = resp.json()["data"]
    return [item["embedding"] for item in sorted(data, key=lambda x: x["index"])]
