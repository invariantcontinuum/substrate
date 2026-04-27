"""Enriched node-summary pipeline.

Given a node id, reconstruct its file, fetch edges via AGE Cypher, pull
top-K edge neighbors ranked by embedding cosine similarity, and assemble
a structured prompt sent to DENSE_LLM_URL. Cache the response in
file_embeddings.description + description_generated_at.

This module intentionally avoids re-implementing the chunk reconstruction
helper — it reuses `reconstruct_chunks` from file_reconstruct.

Graceful-degradation contract:
  * missing node              -> source == "not_found"
  * ingested but no chunks    -> source == "no_content"
  * AGE fetch fails or empty  -> neighbors=[], pipeline still calls LLM
  * source has no embedding   -> ranked=[], pipeline still calls LLM
"""
from __future__ import annotations

import json
import math
from typing import Iterable

import httpx
import structlog

from src.config import settings
from src.graph.chat_context_resolver import _fetch_edge_neighbors  # noqa: F401
from src.graph.file_reconstruct import FileTooLargeForReconstruct, reconstruct_chunks

logger = structlog.get_logger()

# Retry scales are read from settings so deployers can tune them without
# a code change. Accessed via settings.summary_retry_scales_tuple.


def _parse_vector(raw) -> list[float] | None:
    """Coerce an asyncpg pgvector column into a list[float].

    pgvector's default binary/text codec returns the value as a string
    like ``"[0.1,0.2,...]"``. We also tolerate iterables (list/tuple)
    in case a non-default codec is registered. ``None`` / empty returns
    ``None`` so callers can short-circuit.
    """
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        vec = list(raw)
        return vec if vec else None
    if isinstance(raw, str):
        s = raw.strip()
        if not s or s == "[]":
            return None
        try:
            parsed = json.loads(s)
        except ValueError:
            return None
        if isinstance(parsed, list) and parsed:
            return [float(x) for x in parsed]
        return None
    return None


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def rank_neighbors_by_similarity(
    source_embedding: list[float],
    neighbors: list[dict],
    k: int,
) -> list[dict]:
    """Return top-K neighbors by cosine similarity to the source embedding.

    Neighbors without an embedding are dropped. Stable wrt input order
    for tied scores (Python's sort is stable; we include the original
    index explicitly to make that guarantee obvious).
    """
    scored: list[tuple[float, int, dict]] = []
    for i, n in enumerate(neighbors):
        emb = n.get("embedding")
        if not emb:
            continue
        scored.append((cosine(source_embedding, emb), i, n))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [t[2] for t in scored[:k]]


def build_system_prompt() -> str:
    return settings.summary_instruction


def _is_context_window_error(exc: Exception) -> bool:
    if not isinstance(exc, httpx.HTTPStatusError):
        return False
    if exc.response.status_code != 400:
        return False
    detail = exc.response.text.lower()
    return (
        "available context size" in detail
        or ("context size" in detail and "exceeds" in detail)
    )


def _truncate(s: str, cap: int, marker: str) -> str:
    if cap <= 0:
        return ""
    if len(s) <= cap:
        return s
    return s[: max(0, cap - len(marker))] + marker


def assemble_prompt(
    file_path: str,
    language: str,
    line_count: int,
    file_content: str,
    neighbors: Iterable[dict],
    total_budget_chars: int,
    neighbor_budget_chars: int,
    file_ratio: float = 0.70,
    neighbor_ratio: float = 0.25,
) -> str:
    """Assemble the final USER message.

    File content is capped at ``total_budget_chars * file_ratio``; each
    neighbor block is capped at ``neighbor_budget_chars`` and the sum of
    neighbor blocks at ``total_budget_chars * neighbor_ratio``. Remaining
    budget is intentionally left for the system prompt + headers.
    """
    # Reserve a sliver for fixed wrapper text (file path header + section
    # headings + closing instruction). Without this the rendered prompt
    # consistently overshoots `total_budget_chars` on small budgets.
    file_cap = max(0, int(total_budget_chars * file_ratio) - 16)
    neighbor_total = max(0, int(total_budget_chars * neighbor_ratio) - 8)

    file_text = _truncate(
        file_content, file_cap,
        "\n[… file truncated for context window …]\n",
    )

    grouped: dict[str, list[dict]] = {}
    for n in neighbors:
        key = f"{n['edge_type']} ({n['direction']})"
        grouped.setdefault(key, []).append(n)

    # Reserve a sliver of the per-neighbor cap for the group label + the
    # surrounding separators so a single-entry block stays close to the
    # neighbor_total budget. Without this the group header (e.g.
    # "## imports (out)\n") tips the rendered context past the budget.
    entry_cap = max(8, neighbor_budget_chars - 24)

    edge_blocks: list[str] = []
    spent = 0
    entry_count = 0
    for group_label, items in grouped.items():
        block_header = f"## {group_label}"
        block = [block_header]
        block_overhead = len(block_header) + 1  # header + trailing newline
        for n in items:
            entry = (
                f"- {n['name']}  ({n['type']})\n"
                f"  description: {n.get('description') or '—'}\n"
                f"  first-lines: {n.get('first_lines') or ''}"
            )
            entry = _truncate(
                entry, entry_cap,
                "\n  [… neighbor truncated …]",
            )
            cost = len(entry) + 1
            if entry_count == 0:
                cost += block_overhead  # first-ever entry pays for the header
            # Always emit at least one neighbor when there is one to emit.
            if entry_count > 0 and spent + cost > neighbor_total:
                break
            block.append(entry)
            spent += cost
            entry_count += 1
        if len(block) > 1:
            edge_blocks.append("\n".join(block))
        if entry_count > 0 and spent >= neighbor_total:
            break

    ctx = (
        "\n\n" + "\n\n".join(edge_blocks)
        if edge_blocks
        else "\n\n(no edge neighbors indexed)"
    )

    return (
        f"# File  {file_path}  ({language}, {line_count} lines)\n\n"
        f"{file_text}\n\n"
        f"# Graph context (top-K by embedding similarity)"
        f"{ctx}\n\n"
        f"Return a short paragraph summary."
    )


async def _post_llm(*, url: str, payload: dict) -> dict:
    """Isolated httpx POST so tests can patch a single symbol.

    Read timeout is sized to fit under upstream proxy budgets (~120 s
    NPM default): if the local Qwen3.5-4B hasn't returned within 90 s
    we fail-fast with TimeoutException and translate to
    ``source="llm_failed"`` in the caller, so the user sees a clean
    retry path instead of the edge proxy closing the socket with 504.
    """
    headers: dict[str, str] = {}
    if settings.dense_llm_api_key:
        headers["Authorization"] = f"Bearer {settings.dense_llm_api_key}"
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=90.0, write=10.0, pool=10.0),
        verify=settings.dense_llm_ssl_verify,
    ) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()



async def generate_enriched_summary(
    pool,
    node_id: str,
    sync_id: str | None,
) -> dict:
    """Generate a summary using full file + top-K edge neighbor context.

    Holds a pooled connection only for the read phase (file content,
    chunks, neighbors) and the final UPDATE write — the slow LLM call
    runs with **no connection held**, so a stuck dense-LLM never
    saturates the small asyncpg pool and block unrelated endpoints
    (``/file``, ``/stats``, …).
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id::text AS id, file_path, language, line_count, embedding
                 FROM file_embeddings
                WHERE id = $1::uuid
                  AND ($2::uuid IS NULL OR sync_id = $2::uuid)
                ORDER BY created_at DESC LIMIT 1""",
            node_id, sync_id,
        )
        if not row:
            return {
                "summary": "",
                "cached": False,
                "source": "not_found",
                "chunk_count": 0,
                "neighbor_count": 0,
                "truncated_file": False,
            }

        chunk_rows = await conn.fetch(
            """SELECT chunk_index, content, start_line, end_line
                 FROM content_chunks
                WHERE file_id = $1::uuid
                ORDER BY chunk_index""",
            row["id"],
        )
        if not chunk_rows:
            return {
                "summary": "",
                "cached": False,
                "source": "no_content",
                "chunk_count": 0,
                "neighbor_count": 0,
                "truncated_file": False,
            }
        try:
            rec = reconstruct_chunks(
                [dict(c) for c in chunk_rows],
                cap_bytes=settings.file_reconstruct_max_bytes,
                total_lines=row["line_count"] or None,
                file_id=row["id"],
            )
        except FileTooLargeForReconstruct as exc:
            logger.warning(
                "enriched_summary_file_too_large",
                node_id=node_id,
                covered_lines=exc.covered_lines,
                total_lines=exc.total_lines,
                cap_bytes=exc.cap_bytes,
            )
            return {
                "summary": "",
                "cached": False,
                "source": "file_too_large",
                "chunk_count": 0,
                "neighbor_count": 0,
                "truncated_file": True,
            }

        edge_triples = await _fetch_edge_neighbors(conn, row["id"])
        neighbor_ids = [t["neighbor_id"] for t in edge_triples]

        neighbor_rows = []
        if neighbor_ids:
            neighbor_rows = await conn.fetch(
                """SELECT id::text AS id, name, file_path, type, domain,
                          language, description, embedding
                     FROM file_embeddings
                    WHERE id = ANY($1::uuid[])""",
                neighbor_ids,
            )
        by_id = {r["id"]: dict(r) for r in neighbor_rows}

        neighbors: list[dict] = []
        for t in edge_triples:
            nrow = by_id.get(t["neighbor_id"])
            if not nrow:
                continue
            neighbors.append({
                "id": t["neighbor_id"],
                "edge_type": t["edge_type"],
                "direction": t["direction"],
                "name": nrow["name"],
                "file_path": nrow["file_path"],
                "type": nrow["type"],
                "domain": nrow.get("domain") or "",
                "language": nrow.get("language") or "",
                "description": nrow.get("description") or "",
                "embedding": _parse_vector(nrow.get("embedding")),
                "first_lines": "",
            })

        source_emb = _parse_vector(row["embedding"])

        if source_emb and neighbors:
            ranked = rank_neighbors_by_similarity(
                source_emb, neighbors, k=settings.summary_edge_neighbors,
            )
        else:
            ranked = []

        # Best-effort: pull first 8 lines of each ranked neighbor's first chunk.
        for n in ranked:
            first = await conn.fetchval(
                """SELECT content FROM content_chunks
                    WHERE file_id = $1::uuid ORDER BY chunk_index LIMIT 1""",
                n["id"],
            )
            if first:
                n["first_lines"] = "\n".join(first.split("\n")[:8])

    # Connection released before the slow LLM call — see docstring.
    llm_resp: dict | None = None
    last_error: Exception | None = None
    for idx, scale in enumerate(settings.summary_retry_scales_tuple):
        prompt = assemble_prompt(
            file_path=row["file_path"],
            language=row["language"] or "",
            line_count=row["line_count"] or 0,
            file_content=rec["content"],
            neighbors=ranked,
            total_budget_chars=max(2_048, int(settings.summary_total_budget_chars * scale)),
            neighbor_budget_chars=max(160, int(settings.summary_neighbor_chars * scale)),
            file_ratio=settings.summary_file_budget_ratio,
            neighbor_ratio=settings.summary_neighbor_budget_ratio,
        )

        try:
            llm_resp = await _post_llm(
                url=settings.dense_llm_url,
                payload={
                    "model": settings.dense_llm_model,
                    "messages": [
                        {"role": "system", "content": build_system_prompt()},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": settings.summary_max_tokens,
                    # Qwen-family reasoning models can spend the full
                    # decode budget on internal thinking and leave
                    # `content` empty. Disable that path for terse
                    # source-file summaries.
                    "chat_template_kwargs": {"enable_thinking": False},
                },
            )
            break
        except (httpx.HTTPError, httpx.TimeoutException) as exc:
            last_error = exc
            if _is_context_window_error(exc) and idx < len(settings.summary_retry_scales_tuple) - 1:
                logger.warning(
                    "enriched_summary_llm_context_retry",
                    node_id=node_id,
                    scale=scale,
                    next_scale=settings.summary_retry_scales_tuple[idx + 1],
                    error=str(exc),
                )
                continue
            logger.warning("enriched_summary_llm_failed", node_id=node_id, error=str(exc))
            return {
                "summary": "",
                "cached": False,
                "source": "llm_failed",
                "chunk_count": rec["chunk_count"],
                "neighbor_count": len(ranked),
                "truncated_file": False,
            }

    if llm_resp is None:
        logger.warning("enriched_summary_llm_failed", node_id=node_id, error=str(last_error))
        return {
            "summary": "",
            "cached": False,
            "source": "llm_failed",
            "chunk_count": rec["chunk_count"],
            "neighbor_count": len(ranked),
            "truncated_file": False,
        }

    message = (llm_resp.get("choices") or [{}])[0].get("message", {}) or {}
    # Prefer the conventional `content` field; if the thinking flag is
    # ignored by the server or a future model routes answer text into
    # `reasoning_content`, use that as a fallback rather than losing
    # the whole response.
    summary = (message.get("content") or message.get("reasoning_content") or "").strip()

    if not summary:
        # Empty-response path: do NOT persist — a blank description with
        # a fresh generated_at would masquerade as a valid cache entry.
        logger.warning("enriched_summary_empty_response", node_id=node_id)
        return {
            "summary": "",
            "cached": False,
            "source": "llm_failed",
            "chunk_count": rec["chunk_count"],
            "neighbor_count": len(ranked),
            "truncated_file": False,
        }

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE file_embeddings
                  SET description = $2,
                      description_generated_at = now()
                WHERE id = $1::uuid""",
            row["id"], summary,
        )

    logger.info(
        "enriched_summary_generated",
        node_id=node_id,
        chunk_count=rec["chunk_count"],
        neighbor_count=len(ranked),
        truncated_file=rec["truncated"],
    )
    return {
        "summary": summary,
        "cached": False,
        "source": "llm_enriched",
        "chunk_count": rec["chunk_count"],
        "neighbor_count": len(ranked),
        "truncated_file": False,
    }
