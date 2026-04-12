import httpx
import structlog
from src.config import settings

logger = structlog.get_logger()

_client: httpx.AsyncClient | None = None


async def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=10.0))
    return _client


async def close_search_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def _embed_query(query: str) -> list[float]:
    client = await _get_client()
    resp = await client.post(
        settings.embedding_url,
        json={"input": query, "model": settings.embedding_model},
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


async def _rerank(query: str, documents: list[dict]) -> list[dict]:
    if not documents:
        return []
    client = await _get_client()
    try:
        texts = [d.get("description", d.get("node_id", "")) for d in documents]
        resp = await client.post(
            settings.reranker_url,
            json={"input": [[query, t] for t in texts], "model": "bge-reranker-v2-m3-Q4_K_M.gguf"},
        )
        resp.raise_for_status()
        embeddings = resp.json()["data"]
        scored = [(doc, emb["embedding"][0]) for doc, emb in zip(documents, embeddings)]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [s[0] for s in scored]
    except Exception as e:
        logger.warning("rerank_failed", error=str(e))
        return documents


async def search_nodes(query: str, limit: int = 10, type_filter: str = "", domain_filter: str = "") -> list[dict]:
    # Graceful degradation: if the embedding service (lazy-lamacpp) is not running,
    # return an empty result set with a warning log instead of crashing the request.
    # Per CLAUDE.md, LLM models are on-demand — search is unavailable until started.
    try:
        vector = await _embed_query(query)
    except httpx.ConnectError as e:
        logger.warning("search_embedding_unavailable", error=str(e), query=query)
        return []
    except Exception as e:
        logger.warning("search_embedding_failed", error=str(e), query=query)
        return []

    client = await _get_client()
    body: dict = {"vector": vector, "limit": limit * 2, "with_payload": True}

    must = []
    if type_filter:
        must.append({"key": "category", "match": {"value": type_filter}})
    if domain_filter:
        must.append({"key": "domain", "match": {"value": domain_filter}})
    if must:
        body["filter"] = {"must": must}

    try:
        resp = await client.post(
            f"{settings.qdrant_url}/collections/{settings.qdrant_collection}/points/search",
            json=body,
        )
        resp.raise_for_status()
    except httpx.ConnectError as e:
        logger.warning("search_qdrant_unavailable", error=str(e), query=query)
        return []
    except Exception as e:
        logger.warning("search_qdrant_failed", error=str(e), query=query)
        return []

    results = resp.json().get("result", [])

    candidates = [
        {**r["payload"], "score": r["score"]}
        for r in results
    ]

    reranked = await _rerank(query, candidates)
    return reranked[:limit]
