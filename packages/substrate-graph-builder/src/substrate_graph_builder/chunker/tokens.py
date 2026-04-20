"""Token estimator shared across chunkers. Kept intentionally cheap —
the embedding model has its own hard cap downstream."""
from __future__ import annotations


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text.split()) * 1.3))
