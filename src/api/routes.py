from fastapi import APIRouter
from src.graph.store import (
    get_full_snapshot,
    get_node_with_neighbors,
    get_stats,
    nodes_to_cytoscape,
    edges_to_cytoscape,
    purge_all,
)

router = APIRouter(prefix="/api/graph")


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
