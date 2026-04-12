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
    snapshot = await get_full_snapshot()
    return {
        "nodes": nodes_to_cytoscape(snapshot.nodes),
        "edges": edges_to_cytoscape(snapshot.edges),
        "meta": snapshot.meta,
    }


@router.get("/nodes/{node_id:path}")
async def get_node(node_id: str):
    data = await get_node_with_neighbors(node_id)
    if not data:
        return {"error": "Node not found"}, 404
    return data


@router.get("/stats")
async def graph_stats():
    return await get_stats()


@router.delete("")
async def purge_graph():
    await purge_all()
    return {"status": "purged"}


@router.get("/search")
async def search_graph(q: str = "", type: str = "", limit: int = 10):
    if not q:
        return {"results": []}
    try:
        embedding = await _embed_query(q)
    except httpx.ConnectError as e:
        logger.warning("search_embedding_unavailable", error=str(e), query=q)
        return {"results": []}
    except Exception as e:
        logger.warning("search_embedding_failed", error=str(e), query=q)
        return {"results": []}
    results = await search(embedding, limit=limit, type_filter=type)
    return {"results": results}
