"""Python fixture test — build_graph over tests/fixtures/python/ == expected.json."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from substrate_graph_builder import build_graph

if TYPE_CHECKING:
    from tests.conftest import LoadFixtureFn


def test_python_fixture_matches_golden(load_fixture: LoadFixtureFn) -> None:
    root, tree = load_fixture("python")
    doc = build_graph(tree, root)

    expected = json.loads((Path(root) / "expected.json").read_text())

    # Order-insensitive comparison of node ids.
    actual_ids = sorted(n.id for n in doc.nodes)
    assert actual_ids == sorted(expected["node_ids"]), \
        f"node id mismatch:\n  expected={sorted(expected['node_ids'])}\n  actual={actual_ids}"

    actual_edges = sorted(
        (e.source_id, e.target_id, e.type) for e in doc.edges
    )
    expected_edges = sorted(
        (e["source_id"], e["target_id"], e["type"]) for e in expected["edges"]
    )
    assert actual_edges == expected_edges, \
        f"edge mismatch:\n  expected={expected_edges}\n  actual={actual_edges}"
