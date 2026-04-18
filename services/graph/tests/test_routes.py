import pytest
from src.graph.store import GraphSnapshot, GraphNode, GraphEdge


@pytest.fixture
def mock_snapshot():
    return GraphSnapshot(
        nodes=[
            GraphNode(id="a", name="a", type="service", domain="lib", source="github"),
            GraphNode(id="b", name="b", type="external", domain="", source="github"),
        ],
        edges=[
            GraphEdge(id="a->b", source="a", target="b", type="depends"),
        ],
        meta={"node_count": 2, "edge_count": 1},
    )


# DELETED: tests for legacy graph store funcs (get_full_snapshot, etc.) — replaced by snapshot_query (T16)
# class TestGraphEndpoints:
#     @pytest.mark.asyncio
#     @patch("src.api.routes.get_full_snapshot")
#     async def test_get_graph_returns_snapshot(self, mock_get, mock_snapshot):
#         mock_get.return_value = mock_snapshot
#         from src.main import app
#
#         transport = ASGITransport(app=app)
#         async with AsyncClient(transport=transport, base_url="http://test") as client:
#             resp = await client.get("/api/graph")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert len(data["nodes"]) == 2
#         assert len(data["edges"]) == 1
#         assert data["meta"]["node_count"] == 2
#
#     @pytest.mark.asyncio
#     @patch("src.api.routes.get_stats")
#     async def test_get_stats(self, mock_stats):
#         mock_stats.return_value = {"nodes_by_type": {"service": 10}, "total_edges": 5}
#         from src.main import app
#
#         transport = ASGITransport(app=app)
#         async with AsyncClient(transport=transport, base_url="http://test") as client:
#             resp = await client.get("/api/graph/stats")
#         assert resp.status_code == 200
#         assert resp.json()["total_edges"] == 5
