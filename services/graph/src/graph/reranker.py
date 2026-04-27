"""Reranker client — cross-encoder ranking via the llama.cpp ``/reranking``
endpoint. Falls back to the original candidate ordering on any HTTP /
JSON error so a flaky reranker can never deadlock the chat pipeline.
"""
from __future__ import annotations

from typing import Any

import httpx
import structlog

from src.config import settings


logger = structlog.get_logger()


async def rerank(
    *, query: str, candidates: list[dict], top_n: int,
) -> list[dict]:
    """Return ``candidates`` re-sorted by reranker score, truncated to ``top_n``.

    Each candidate dict should expose at least ``file_id``; the document text
    fed to the reranker is taken from ``description``, with ``file_path`` as a
    fallback when description is missing. On reranker failure (network, HTTP
    error, malformed JSON) the function logs a warning and returns the first
    ``top_n`` candidates in their original order.
    """
    if not candidates:
        return []
    documents = [
        ((c.get("description") or c.get("file_path") or "")[:settings.reranker_doc_text_max_chars])
        for c in candidates
    ]
    payload: dict[str, Any]
    headers: dict[str, str] = {}
    if settings.reranker_api_key:
        headers["Authorization"] = f"Bearer {settings.reranker_api_key}"
    try:
        async with httpx.AsyncClient(
            timeout=settings.reranker_timeout_s,
            verify=settings.reranker_ssl_verify,
        ) as client:
            r = await client.post(
                settings.reranker_url,
                headers=headers,
                json={
                    "query": query,
                    "documents": documents,
                    "model": settings.reranker_model,
                },
            )
            r.raise_for_status()
            payload = r.json()
    except Exception as exc:  # noqa: BLE001 — graceful degradation by design
        logger.warning(
            "reranker_call_failed",
            error=str(exc),
            top_n=top_n,
            candidate_count=len(candidates),
        )
        return candidates[:top_n]

    # llama.cpp /reranking responses observed in two shapes:
    #   1. {"results": [{"index": int, "relevance_score": float}, ...]}
    #   2. flat {"scores": [float, float, ...]} aligned with input order
    results = payload.get("results")
    scored: list[tuple[float, dict]] = []
    if isinstance(results, list) and results and isinstance(results[0], dict):
        for entry in results:
            idx = entry.get("index", -1)
            if 0 <= idx < len(candidates):
                score = float(entry.get("relevance_score") or 0.0)
                scored.append((score, candidates[idx]))
    else:
        scores = payload.get("scores") or results or []
        for score, candidate in zip(scores, candidates):
            try:
                scored.append((float(score), candidate))
            except (TypeError, ValueError):
                continue

    if not scored:
        # Reranker returned an unexpected shape — degrade gracefully.
        logger.warning(
            "reranker_unexpected_payload",
            keys=list(payload.keys()) if isinstance(payload, dict) else None,
        )
        return candidates[:top_n]

    scored.sort(key=lambda t: -t[0])
    return [c for _, c in scored[:top_n]]
