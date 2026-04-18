import pytest
from src.graph.store import (
    GraphNode,
    GraphEdge,
    GraphSnapshot,
    nodes_to_cytoscape,
    edges_to_cytoscape,
)


class TestGraphModels:
    def test_graph_node_creation(self):
        node = GraphNode(
            id="lib/transfer.c",
            name="transfer.c",
            type="service",
            domain="lib",
            status="healthy",
            source="github",
            meta={"path": "lib/transfer.c"},
        )
        assert node.id == "lib/transfer.c"
        assert node.type == "service"

    def test_graph_edge_creation(self):
        edge = GraphEdge(
            id="e1",
            source="lib/transfer.c",
            target="lib/url.h",
            type="depends",
        )
        assert edge.source == "lib/transfer.c"
        assert edge.target == "lib/url.h"


class TestCytoscapeConversion:
    def test_nodes_to_cytoscape_format(self):
        nodes = [
            GraphNode(id="a", name="a", type="service", domain="", source="github"),
            GraphNode(id="b", name="b", type="external", domain="", source="github"),
        ]
        result = nodes_to_cytoscape(nodes)
        assert len(result) == 2
        assert result[0]["data"]["id"] == "a"
        assert result[0]["data"]["type"] == "service"

    def test_edges_to_cytoscape_format(self):
        edges = [
            GraphEdge(id="e1", source="a", target="b", type="depends"),
        ]
        result = edges_to_cytoscape(edges)
        assert len(result) == 1
        assert result[0]["data"]["source"] == "a"
        assert result[0]["data"]["target"] == "b"
