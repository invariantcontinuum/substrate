import httpx
import structlog
from src.config import settings

logger = structlog.get_logger()

VECTOR_DIM = 768
_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.qdrant_url,
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=30.0, pool=10.0),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def ensure_collection() -> None:
    client = await _get_client()
    resp = await client.get(f"/collections/{settings.qdrant_collection}")
    if resp.status_code == 200:
        return
    await client.put(
        f"/collections/{settings.qdrant_collection}",
        json={
            "vectors": {"size": VECTOR_DIM, "distance": "Cosine"},
        },
    )
    logger.info("qdrant_collection_created", name=settings.qdrant_collection)


async def upsert_nodes_batch(points: list[dict]) -> None:
    client = await _get_client()
    for i in range(0, len(points), 100):
        chunk = points[i:i + 100]
        await client.put(
            f"/collections/{settings.qdrant_collection}/points",
            json={"points": chunk},
        )
    logger.info("qdrant_upserted", count=len(points))


async def search(vector: list[float], limit: int = 20, filters: dict | None = None) -> list[dict]:
    client = await _get_client()
    body: dict = {"vector": vector, "limit": limit, "with_payload": True}
    if filters:
        must = []
        for key, value in filters.items():
            if value:
                must.append({"key": key, "match": {"value": value}})
        if must:
            body["filter"] = {"must": must}
    resp = await client.post(
        f"/collections/{settings.qdrant_collection}/points/search",
        json=body,
    )
    resp.raise_for_status()
    return resp.json().get("result", [])


async def delete_collection() -> None:
    client = await _get_client()
    await client.delete(f"/collections/{settings.qdrant_collection}")
    logger.info("qdrant_collection_deleted", name=settings.qdrant_collection)
