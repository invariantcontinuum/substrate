import json
import time
import structlog
import asyncpg
from dataclasses import dataclass, field

from src.config import settings

logger = structlog.get_logger()

_pool: asyncpg.Pool | None = None

# AGE requires (a) the shared library loaded into the session via LOAD 'age'
# and (b) ag_catalog on the search_path so cypher() and agtype resolve.
# We can't rely solely on `SET search_path` from the init callback because
# asyncpg's pool runs `RESET ALL` when releasing a connection, which wipes
# any per-session SET. Instead we set search_path via `server_settings`,
# which becomes the connection's startup default and survives RESET ALL.
# LOAD is not a GUC so it persists for the connection's lifetime once run
# in the init callback.


@dataclass
class GraphNode:
    id: str
    name: str
    type: str
    domain: str = ""
    status: str = "healthy"
    source: str = "github"
    meta: dict = field(default_factory=dict)
    first_seen: str = ""
    last_seen: str = ""


@dataclass
class GraphEdge:
    id: str
    source: str
    target: str
    type: str = "depends"
    label: str = ""
    weight: float = 1.0


@dataclass
class GraphSnapshot:
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    meta: dict = field(default_factory=dict)


def nodes_to_cytoscape(nodes: list[GraphNode]) -> list[dict]:
    return [
        {
            "data": {
                "id": n.id,
                "name": n.name,
                "type": n.type,
                "domain": n.domain,
                "status": n.status,
                "source": n.source,
                "meta": n.meta,
            }
        }
        for n in nodes
    ]


def edges_to_cytoscape(edges: list[GraphEdge]) -> list[dict]:
    return [
        {
            "data": {
                "id": e.id,
                "source": e.source,
                "target": e.target,
                "type": e.type,
                "label": e.label,
                "weight": e.weight,
            }
        }
        for e in edges
    ]


async def _init_age(conn: asyncpg.Connection) -> None:
    """Load the AGE shared library into each new pool connection."""
    await conn.execute("LOAD 'age';")


async def connect() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url.replace("postgresql+asyncpg://", "postgresql://"),
        min_size=2,
        max_size=10,
        init=_init_age,
        server_settings={"search_path": "ag_catalog,public"},
    )
    logger.info("pg_pool_connected", dsn=settings.database_url)


async def disconnect() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("pg_pool_disconnected")


async def get_full_snapshot() -> GraphSnapshot:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("snapshot_query_start")
    start = time.monotonic()

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text, file_path, name, type, domain, language,
                   status, first_seen_at::text, last_seen_at::text
            FROM file_embeddings
            """
        )

    nodes = [
        GraphNode(
            id=r["id"],
            name=r["name"],
            type=r["type"],
            domain=r["domain"] or "",
            status=r["status"] or "healthy",
            source="github",
            meta={"file_path": r["file_path"], "language": r["language"] or ""},
            first_seen=r["first_seen_at"] or "",
            last_seen=r["last_seen_at"] or "",
        )
        for r in rows
    ]

    edges: list[GraphEdge] = []
    async with _pool.acquire() as conn:
        try:
            edge_rows = await conn.fetch(
                """
                SELECT * FROM cypher('substrate', $$
                    MATCH (a)-[r]->(b)
                    RETURN id(a)::text, id(b)::text, label(r), r.weight, a.file_id, b.file_id
                $$) AS (a_id agtype, b_id agtype, rel_type agtype, weight agtype, src_file agtype, tgt_file agtype)
                """
            )
            for r in edge_rows:
                src = json.loads(str(r["src_file"])) if r["src_file"] else str(r["a_id"])
                tgt = json.loads(str(r["tgt_file"])) if r["tgt_file"] else str(r["b_id"])
                rel_type = json.loads(str(r["rel_type"])) if r["rel_type"] else "depends"
                weight = json.loads(str(r["weight"])) if r["weight"] else 1.0
                edges.append(
                    GraphEdge(
                        id=f"{src}->{tgt}",
                        source=str(src),
                        target=str(tgt),
                        type=str(rel_type),
                        label=str(rel_type),
                        weight=float(weight),
                    )
                )
        except Exception as e:
            logger.warning("age_edge_query_failed", error=str(e))

    elapsed = time.monotonic() - start
    logger.info("snapshot_fetched", node_count=len(nodes), edge_count=len(edges),
                duration_ms=round(elapsed * 1000))

    return GraphSnapshot(
        nodes=nodes,
        edges=edges,
        meta={"node_count": len(nodes), "edge_count": len(edges)},
    )


async def get_node_with_neighbors(node_id: str) -> dict:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("node_query_start", node_id=node_id)

    async with _pool.acquire() as conn:
        node = await conn.fetchrow(
            """
            SELECT id::text, file_path, name, type, domain, language,
                   status, description, size_bytes, line_count,
                   first_seen_at::text, last_seen_at::text
            FROM file_embeddings
            WHERE id::text = $1
            """,
            node_id,
        )

    if not node:
        logger.info("node_not_found", node_id=node_id)
        return {}

    neighbors: list[dict] = []
    async with _pool.acquire() as conn:
        try:
            edge_rows = await conn.fetch(
                """
                SELECT * FROM cypher('substrate', $$
                    MATCH (a {file_id: %s})-[r]-(b)
                    RETURN b.file_id, label(r), r.weight
                $$) AS (neighbor_file agtype, rel_type agtype, weight agtype)
                """ % f"'{node_id}'"
            )
            for r in edge_rows:
                nf = json.loads(str(r["neighbor_file"])) if r["neighbor_file"] else None
                rt = json.loads(str(r["rel_type"])) if r["rel_type"] else "depends"
                w = json.loads(str(r["weight"])) if r["weight"] else 1.0
                if nf:
                    neighbors.append({"id": str(nf), "type": str(rt), "weight": float(w)})
        except Exception as e:
            logger.warning("age_neighbor_query_failed", error=str(e))

    logger.info("node_found", node_id=node_id, neighbor_count=len(neighbors))

    return {
        "node": {
            "id": node["id"],
            "name": node["name"],
            "type": node["type"],
            "domain": node["domain"] or "",
            "language": node["language"] or "",
            "status": node["status"] or "healthy",
            "description": node["description"] or "",
            "file_path": node["file_path"],
            "size_bytes": node["size_bytes"],
            "line_count": node["line_count"],
            "first_seen": node["first_seen_at"] or "",
            "last_seen": node["last_seen_at"] or "",
        },
        "neighbors": neighbors,
    }


async def get_stats() -> dict:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("stats_query_start")

    async with _pool.acquire() as conn:
        type_rows = await conn.fetch(
            "SELECT type, count(*) AS cnt FROM file_embeddings GROUP BY type"
        )
        nodes_by_type = {r["type"]: r["cnt"] for r in type_rows}

        total_nodes = await conn.fetchval("SELECT count(*) FROM file_embeddings")

        total_edges = 0
        try:
            edge_row = await conn.fetchrow(
                """
                SELECT * FROM cypher('substrate', $$
                    MATCH ()-[r]->()
                    RETURN count(r)
                $$) AS (cnt agtype)
                """
            )
            if edge_row:
                total_edges = json.loads(str(edge_row["cnt"]))
        except Exception as e:
            logger.warning("age_stats_query_failed", error=str(e))

    logger.info("stats_fetched", total_nodes=total_nodes, total_edges=total_edges,
                types=len(nodes_by_type))

    return {
        "nodes_by_type": nodes_by_type,
        "total_nodes": total_nodes,
        "total_edges": total_edges,
    }


async def search(query_embedding: list[float], limit: int = 10,
                 type_filter: str = "", domain_filter: str = "") -> list[dict]:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("search_start", limit=limit, type_filter=type_filter or None,
                domain_filter=domain_filter or None)
    start = time.monotonic()

    conditions = []
    args: list = [str(query_embedding), limit]

    if type_filter:
        conditions.append(f"f.type = ${len(args) + 1}")
        args.append(type_filter)
    if domain_filter:
        conditions.append(f"f.domain = ${len(args) + 1}")
        args.append(domain_filter)

    where = (" AND " + " AND ".join(conditions)) if conditions else ""

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT f.id::text, f.file_path, f.name, f.type, f.domain,
                   f.language, f.status, f.description,
                   f.embedding <=> $1::vector AS distance
            FROM file_embeddings f
            WHERE f.embedding IS NOT NULL{where}
            ORDER BY distance ASC
            LIMIT $2
            """,
            *args,
        )

    results = [
        {
            "id": r["id"],
            "file_path": r["file_path"],
            "name": r["name"],
            "type": r["type"],
            "domain": r["domain"] or "",
            "language": r["language"] or "",
            "status": r["status"] or "healthy",
            "description": r["description"] or "",
            "score": 1.0 - (r["distance"] or 0.0),
        }
        for r in rows
    ]

    elapsed = time.monotonic() - start
    distance_range = (
        (round(rows[0]["distance"], 4), round(rows[-1]["distance"], 4))
        if rows else None
    )
    logger.info("search_complete", result_count=len(results),
                distance_range=distance_range, duration_ms=round(elapsed * 1000))

    return results


async def ensure_node_summary(node_id: str, force: bool = False) -> dict:
    """Return a short natural-language summary for a node.

    Caches the result in `file_embeddings.description`. If a cached value
    exists and `force` is false, returns it without calling the LLM.

    Returns a dict with keys:
      - summary: str
      - cached: bool   (true if the description column already had content)
      - source: "cache" | "llm" | "fallback"
    """
    import httpx

    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("summary_start", node_id=node_id, force=force)

    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text, file_path, name, type, domain, language, description
            FROM file_embeddings
            WHERE id::text = $1
            """,
            node_id,
        )
        if not row:
            logger.info("summary_node_not_found", node_id=node_id)
            return {"summary": "", "cached": False, "source": "not_found"}

        if row["description"] and not force:
            logger.info("summary_cache_hit", node_id=node_id)
            return {"summary": row["description"], "cached": True, "source": "cache"}

        chunk_rows = await conn.fetch(
            """
            SELECT content, start_line, end_line
            FROM content_chunks
            WHERE file_id = $1::uuid
            ORDER BY chunk_index
            LIMIT 5
            """,
            node_id,
        )

    excerpts = []
    total_chars = 0
    for ch in chunk_rows:
        remaining = settings.summary_chunk_sample_chars - total_chars
        if remaining <= 0:
            break
        text = ch["content"][:remaining]
        excerpts.append(f"[lines {ch['start_line']}-{ch['end_line']}]\n{text}")
        total_chars += len(text)

    excerpts_block = "\n\n".join(excerpts) if excerpts else "(no indexed content available)"

    system_prompt = (
        "You are a senior engineer summarising a single source file in a "
        "knowledge graph. Write 2-3 plain sentences covering what the file "
        "does, the kind of code it contains, and anything notable. No "
        "markdown, no headings, no preamble."
    )
    user_prompt = (
        f"File path: {row['file_path']}\n"
        f"Name: {row['name']}\n"
        f"Type: {row['type']}\n"
        f"Language: {row['language'] or 'unknown'}\n"
        f"Domain: {row['domain'] or '-'}\n\n"
        f"Excerpts:\n{excerpts_block}\n\n"
        "Summary:"
    )

    summary_text = ""
    source = "fallback"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                settings.dense_llm_url,
                json={
                    "model": settings.dense_llm_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": settings.summary_max_tokens,
                    "temperature": 0.2,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            summary_text = (data.get("choices") or [{}])[0].get("message", {}).get(
                "content", ""
            ).strip()
            if summary_text:
                source = "llm"
        logger.info("summary_llm_ok", node_id=node_id, length=len(summary_text))
    except Exception as e:
        logger.warning("summary_llm_failed", node_id=node_id, error=str(e))

    if not summary_text:
        # Last-resort deterministic fallback so the UI still gets something.
        summary_text = (
            f"{row['name'] or row['file_path']} — {row['type'] or 'file'}"
            + (f" ({row['language']})" if row["language"] else "")
            + ". Indexed from "
            + f"{row['file_path']}."
        )
        source = "fallback"

    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE file_embeddings SET description = $1, updated_at = now() WHERE id::text = $2",
            summary_text,
            node_id,
        )

    logger.info("summary_persisted", node_id=node_id, source=source)
    return {"summary": summary_text, "cached": False, "source": source}


async def purge_all() -> None:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("purge_start")

    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM content_chunks")
        await conn.execute("DELETE FROM file_embeddings")
        await conn.execute("DELETE FROM repositories")
        try:
            await conn.execute(
                """
                SELECT * FROM cypher('substrate', $$
                    MATCH (n) DETACH DELETE n
                $$) AS (result agtype)
                """
            )
        except Exception as e:
            logger.warning("age_purge_failed", error=str(e))

    logger.info("graph_purged")
