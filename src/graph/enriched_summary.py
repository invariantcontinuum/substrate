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
from src.graph.file_reconstruct import reconstruct_chunks

logger = structlog.get_logger()


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
    """Isolated httpx POST so tests can patch a single symbol."""
    headers: dict[str, str] = {}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        return r.json()


async def _fetch_edge_neighbors(conn, file_id: str) -> list[dict]:
    """Fetch (neighbor_id, edge_type, direction) triples for the node via AGE.

    Uses the inline-quoted ``MATCH (a:File {file_id: '...'})`` pattern
    established in ``snapshot_query.py`` — the labeled-node + property
    shape is required for AGE to use its label index; an unlabeled
    ``MATCH (n)-[r]-(m) WHERE n.file_id=...`` would full-scan the graph
    (~188k nodes in production) and wedge the connection.

    Falls back to an empty list on any error — AGE may legitimately be
    empty or the `substrate` graph may not yet hold edges for this
    node's sync.
    """
    try:
        # NB: f-string inlining matches snapshot_query.py. file_id came
        # from our own DB row (UUID string) and is therefore safe to
        # inline — no external/user input path reaches this quoting.
        rows = await conn.fetch(
            f"""
            SELECT * FROM cypher('substrate', $$
                MATCH (a:File {{file_id: '{file_id}'}})-[r]-(b:File)
                RETURN b.file_id AS neighbor_file_id,
                       label(r)  AS edge_type,
                       CASE WHEN startNode(r).file_id = '{file_id}' THEN 'out'
                            WHEN endNode(r).file_id   = '{file_id}' THEN 'in'
                            ELSE 'undirected' END AS direction
            $$) AS (neighbor_file_id agtype, edge_type agtype, direction agtype)
            """
        )
    except Exception as exc:
        logger.warning("enriched_summary_edge_fetch_failed", error=str(exc))
        return []

    out: list[dict] = []
    seen: set[str] = set()
    for r in rows:
        raw_nid = r["neighbor_file_id"]
        raw_etype = r["edge_type"]
        raw_dir = r["direction"]
        try:
            nid = json.loads(str(raw_nid)) if raw_nid is not None else None
            etype = json.loads(str(raw_etype)) if raw_etype is not None else ""
            direction = json.loads(str(raw_dir)) if raw_dir is not None else "undirected"
        except ValueError:
            continue
        if not nid or nid in seen:
            continue
        seen.add(nid)
        out.append({
            "neighbor_id": str(nid),
            "edge_type": str(etype) or "depends_on",
            "direction": str(direction) or "undirected",
        })
    return out


async def generate_enriched_summary(
    conn,
    node_id: str,
    sync_id: str | None,
) -> dict:
    """Generate a summary using full file + top-K edge neighbor context.

    Writes back to ``file_embeddings.description`` and
    ``description_generated_at``. Returns a dict with keys
    ``summary``, ``cached``, ``source``, ``chunk_count``,
    ``neighbor_count``, ``truncated_file``.

    Accepts ``node_id`` as a raw ``file_embeddings.id`` UUID. Synthetic
    ids (``src_<uuid>:<path>``) are translated in ``ensure_node_summary``
    before we reach this coroutine.
    """
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
    rec = reconstruct_chunks([dict(c) for c in chunk_rows])

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

    prompt = assemble_prompt(
        file_path=row["file_path"],
        language=row["language"] or "",
        line_count=row["line_count"] or 0,
        file_content=rec["content"],
        neighbors=ranked,
        total_budget_chars=settings.summary_total_budget_chars,
        neighbor_budget_chars=settings.summary_neighbor_chars,
        file_ratio=settings.summary_file_budget_ratio,
        neighbor_ratio=settings.summary_neighbor_budget_ratio,
    )

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
        },
    )
    summary = (llm_resp.get("choices") or [{}])[0].get("message", {}).get(
        "content", ""
    ).strip()

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
        "truncated_file": rec["truncated"],
    }
