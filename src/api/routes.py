import time
import httpx
import structlog
from fastapi import APIRouter

from src.config import settings
from src.graph.store import (
    get_full_snapshot,
    get_node_with_neighbors,
    get_stats,
    nodes_to_cytoscape,
    edges_to_cytoscape,
    search,
    purge_all,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/api/graph")


async def _embed_query(query: str) -> list[float]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.embedding_url,
            json={"input": query, "model": settings.embedding_model},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]


@router.get("")
async def get_graph():
    logger.info("endpoint_get_graph")
    snapshot = await get_full_snapshot()
    return {
        "nodes": nodes_to_cytoscape(snapshot.nodes),
        "edges": edges_to_cytoscape(snapshot.edges),
        "meta": snapshot.meta,
    }


@router.get("/nodes/{node_id:path}")
async def get_node(node_id: str):
    logger.info("endpoint_get_node", node_id=node_id)
    data = await get_node_with_neighbors(node_id)
    if not data:
        logger.info("endpoint_get_node_not_found", node_id=node_id)
        return {"error": "Node not found"}, 404
    return data


@router.get("/stats")
async def graph_stats():
    logger.info("endpoint_get_stats")
    return await get_stats()


@router.delete("")
async def purge_graph():
    logger.info("endpoint_purge_graph")
    await purge_all()
    return {"status": "purged"}


@router.get("/search")
async def search_graph(q: str = "", type: str = "", limit: int = 10):
    logger.info("endpoint_search", query=q, type_filter=type or None, limit=limit)
    if not q:
        return {"results": []}
    try:
        embed_start = time.monotonic()
        embedding = await _embed_query(q)
        embed_elapsed = time.monotonic() - embed_start
        logger.info("search_embedding_complete", duration_ms=round(embed_elapsed * 1000))
    except httpx.ConnectError as e:
        logger.warning("search_embedding_unavailable", error=str(e), query=q)
        return {"results": []}
    except Exception as e:
        logger.warning("search_embedding_failed", error=str(e), query=q)
        return {"results": []}
    results = await search(embedding, limit=limit, type_filter=type)
    logger.info("endpoint_search_complete", result_count=len(results))
    return {"results": results}
