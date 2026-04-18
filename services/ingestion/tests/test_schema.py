import pytest
from datetime import datetime, timezone
from src.schema import GraphEvent, NodeAffected, EdgeAffected


class TestGraphEvent:
    def test_create_graph_event(self):
        event = GraphEvent(
            source="github",
            event_type="push",
            nodes_affected=[
                NodeAffected(id="lib/newmodule", name="newmodule", type="service", action="add")
            ],
            edges_affected=[
                EdgeAffected(
                    source_id="lib/transfer",
                    target_id="lib/newmodule",
                    type="depends",
                    action="add",
                )
            ],
        )
        assert event.source == "github"
        assert len(event.nodes_affected) == 1
        assert event.nodes_affected[0].action == "add"

    def test_graph_event_serializes_to_json(self):
        event = GraphEvent(
            source="github",
            event_type="push",
            nodes_affected=[],
            edges_affected=[],
        )
        data = event.model_dump_json()
        assert "github" in data
        assert "push" in data

    def test_graph_event_roundtrip(self):
        event = GraphEvent(
            source="github",
            event_type="push",
            nodes_affected=[
                NodeAffected(id="svc-a", name="svc-a", type="service", action="add")
            ],
            edges_affected=[],
        )
        json_str = event.model_dump_json()
        restored = GraphEvent.model_validate_json(json_str)
        assert restored.nodes_affected[0].id == "svc-a"
