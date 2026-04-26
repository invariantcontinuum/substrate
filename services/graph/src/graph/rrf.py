"""Reciprocal Rank Fusion.

Pure module — no DB, no settings, no HTTP. Trivially unit-testable.
Used by the chat retrieval pipeline to merge dense pgvector candidates
with sparse keyword (description tsvector) candidates into a single
ordered list before the optional cross-encoder rerank pass.
"""
from __future__ import annotations


def rrf_fuse(rankings: list[list[dict]], *, k: int) -> list[dict]:
    """Fuse multiple ranked lists into one ordered by RRF score.

    Each item is keyed by ``file_id``. Items missing from a ranking
    contribute zero to that ranking's RRF term — the standard formula
    is ``score_total = sum(1 / (k + rank + 1))`` over the rankings the
    item appears in. Lower ``k`` weights top results more heavily.

    The first occurrence of an item determines its representative dict
    in the fused output (later occurrences only add to its score).
    """
    scores: dict[str, float] = {}
    repr_: dict[str, dict] = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking):
            fid = item.get("file_id")
            if not fid:
                continue
            scores[fid] = scores.get(fid, 0.0) + 1.0 / (k + rank + 1)
            repr_.setdefault(fid, item)
    return sorted(repr_.values(), key=lambda it: -scores[it["file_id"]])
