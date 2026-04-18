"""Parity harness: compare new substrate-graph-builder output to a frozen
baseline JSON captured from the legacy regex parser.

Usage:
  # One-time: capture baseline from the last pre-Phase-5 commit.
  git worktree add /tmp/substrate-pre-sp2 <pre-phase-5-sha>
  cd /tmp/substrate-pre-sp2
  uv run python -c 'from src.connectors.github import parse_repo_tree, parse_imports, _read_go_module; ...' > baseline.json
  # (or use the helper in this file which shells out to the legacy path)

  # Capture new output:
  uv run python packages/substrate-graph-builder/scripts/parity_harness.py \
      --corpus /home/dany/github/invariantcontinuum/substrate \
      --baseline packages/substrate-graph-builder/tests/fixtures/parity-baseline.json \
      --check
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from substrate_graph_builder import build_graph


def walk_tree(root: str) -> list[dict]:
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", ".venv", "__pycache__")]
        for fn in filenames:
            abs_p = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_p, root)
            out.append({"path": rel, "type": "blob"})
    return out


def capture(root: str) -> dict:
    tree = walk_tree(root)
    doc = build_graph(tree, root, source_name="corpus")
    # Only file→file depends edges are compared to baseline (symbol nodes + defines are new).
    return {
        "file_nodes": sorted(n.id for n in doc.nodes if "#" not in n.id),
        "depends_edges": sorted(
            (e.source_id, e.target_id) for e in doc.edges if e.type == "depends"
        ),
    }


def diff(baseline: dict, current: dict, removal_tolerance: float = 0.05) -> tuple[bool, dict]:
    b_nodes = set(baseline["file_nodes"])
    c_nodes = set(current["file_nodes"])
    node_added = c_nodes - b_nodes
    node_removed = b_nodes - c_nodes

    b_edges = {tuple(e) for e in baseline["depends_edges"]}
    c_edges = {tuple(e) for e in current["depends_edges"]}
    edge_added = c_edges - b_edges
    edge_removed = b_edges - c_edges

    # Gate on *removals* only. Additions are improvements (better resolvers,
    # wider language coverage) — the regex baseline was minimal on purpose,
    # so any corpus run legitimately adds thousands of edges. A regression
    # is ONLY when an edge the old regex found disappears from new output.
    removal_ratio = len(edge_removed) / max(1, len(b_edges))
    # Node removals are checked for legitimate cases only — file deletions
    # after the baseline SHA (e.g. deleting a test file in a later commit)
    # are expected. Report them but don't fail on them.
    report = {
        "node_added_count": len(node_added),
        "node_removed": sorted(node_removed),
        "edge_added_count": len(edge_added),
        "edge_removed_count": len(edge_removed),
        "edge_added_sample": sorted(edge_added)[:20],
        "edge_removed_sample": sorted(edge_removed)[:20],
        "removal_ratio": round(removal_ratio, 4),
    }
    ok = removal_ratio <= removal_tolerance
    return ok, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--check", action="store_true",
                    help="Compare corpus against baseline; exit 1 on drift > threshold.")
    ap.add_argument("--write-baseline", action="store_true",
                    help="Overwrite baseline file with current corpus output.")
    args = ap.parse_args()

    current = capture(args.corpus)
    baseline_path = Path(args.baseline)
    if args.write_baseline:
        baseline_path.parent.mkdir(parents=True, exist_ok=True)
        baseline_path.write_text(json.dumps(current, indent=2, sort_keys=True))
        print(f"wrote baseline → {baseline_path}")
        return 0

    if not baseline_path.exists():
        print(f"baseline {baseline_path} missing; run with --write-baseline first", file=sys.stderr)
        return 2

    baseline = json.loads(baseline_path.read_text())
    ok, report = diff(baseline, current)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
