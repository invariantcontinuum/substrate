"""Reciprocal Rank Fusion — pure-function unit tests (no DB)."""
from __future__ import annotations


def test_rrf_fuse_basic() -> None:
    from src.graph.rrf import rrf_fuse

    a = [{"file_id": "a"}, {"file_id": "b"}, {"file_id": "c"}]
    b = [{"file_id": "c"}, {"file_id": "a"}, {"file_id": "d"}]
    fused = rrf_fuse([a, b], k=60)
    ids = [f["file_id"] for f in fused]
    # `a` appears at rank 0 and rank 1 — it should win.
    assert ids[0] == "a"
    # `d` only appears in the second ranking — it must still survive.
    assert "d" in ids


def test_rrf_fuse_empty() -> None:
    from src.graph.rrf import rrf_fuse

    assert rrf_fuse([], k=60) == []
    assert rrf_fuse([[]], k=60) == []


def test_rrf_fuse_drops_items_without_file_id() -> None:
    from src.graph.rrf import rrf_fuse

    rankings = [[{"file_id": "x"}, {"no_id": "skip"}]]
    fused = rrf_fuse(rankings, k=60)
    assert [f["file_id"] for f in fused] == ["x"]


def test_rrf_fuse_first_occurrence_wins_repr() -> None:
    from src.graph.rrf import rrf_fuse

    a = [{"file_id": "x", "source": "dense"}]
    b = [{"file_id": "x", "source": "sparse"}]
    fused = rrf_fuse([a, b], k=60)
    assert fused == [{"file_id": "x", "source": "dense"}]
