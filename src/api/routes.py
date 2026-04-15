import time
import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query
from src.config import settings
from src.graph import store
from src.graph.snapshot_query import get_merged_graph, get_node_detail
from src.graph.store import get_stats, search, ensure_node_summary

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
async def get_graph(sync_ids: str = Query(..., description="Comma-separated active sync_ids")):
    ids = [s for s in sync_ids.split(",") if s]
    if not ids:
        raise HTTPException(400, "sync_ids required")
    try:
        return await get_merged_graph(ids)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/nodes/{node_id:path}/summary")
async def get_node_summary(node_id: str, sync_id: str | None = None, force: bool = False):
    return await ensure_node_summary(node_id, sync_id=sync_id, force=force)


@router.get("/nodes/{node_id:path}")
async def get_node(node_id: str, sync_id: str | None = None):
    data = await get_node_detail(node_id, sync_id=sync_id)
    if not data:
        raise HTTPException(404, "node not found")
    return data


@router.get("/stats")
async def graph_stats():
    return await get_stats()


@router.get("/search")
async def search_graph(q: str = "", type: str = "", limit: int = 10):
    if not q:
        return {"results": []}
    try:
        embedding = await _embed_query(q)
    except httpx.ConnectError:
        return {"results": []}
    return {"results": await search(embedding, limit=limit, type_filter=type)}
