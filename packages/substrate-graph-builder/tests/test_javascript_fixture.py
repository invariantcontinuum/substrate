"""JavaScript fixture test — build_graph over tests/fixtures/javascript/ == expected.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from substrate_graph_builder import build_graph

if TYPE_CHECKING:
    from tests.conftest import LoadFixtureFn


def test_javascript_fixture_matches_golden(load_fixture: LoadFixtureFn) -> None:
    root, tree = load_fixture("javascript")
    doc = build_graph(tree, root)
    expected = json.loads((Path(root) / "expected.json").read_text())

    assert sorted(n.id for n in doc.nodes) == sorted(expected["node_ids"])
    actual_edges = sorted((e.source_id, e.target_id, e.type) for e in doc.edges)
    expected_edges = sorted(
        (e["source_id"], e["target_id"], e["type"]) for e in expected["edges"]
    )
    assert actual_edges == expected_edges
