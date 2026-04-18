import pytest
import json

# DELETED: tests for legacy graph store funcs (get_full_snapshot, etc.) — replaced by snapshot_query (T16)
# from src.events.consumer import parse_graph_event
# from src.graph.store import GraphNode, GraphEdge
#
#
# class TestParseGraphEvent:
#     def test_parses_nodes_from_event(self):
#         event_data = {
#             "id": "evt-1",
#             "source": "github",
#             "event_type": "sync",
#             "nodes_affected": [
#                 {"id": "a.c", "name": "a.c", "type": "service", "action": "add", "domain": "", "meta": {}},
#                 {"id": "b.h", "name": "b.h", "type": "service", "action": "add", "domain": "", "meta": {}},
#             ],
#             "edges_affected": [
#                 {"source_id": "a.c", "target_id": "b.h", "type": "depends", "action": "add", "label": ""},
#             ],
#             "timestamp": "2026-04-08T14:00:00Z",
#         }
#         nodes, edges = parse_graph_event(event_data)
#         assert len(nodes) == 2
#         assert isinstance(nodes[0], GraphNode)
#         assert nodes[0].id == "a.c"
#         assert len(edges) == 1
#         assert isinstance(edges[0], GraphEdge)
#         assert edges[0].source == "a.c"
#
#     def test_handles_empty_event(self):
#         event_data = {
#             "id": "evt-2",
#             "source": "github",
#             "event_type": "sync",
#             "nodes_affected": [],
#             "edges_affected": [],
#             "timestamp": "2026-04-08T14:00:00Z",
#         }
#         nodes, edges = parse_graph_event(event_data)
#         assert nodes == []
#         assert edges == []
