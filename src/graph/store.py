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



def get_pool() -> asyncpg.Pool:
    """Return the active asyncpg pool. Raises RuntimeError if not connected."""
    if _pool is None:
        raise RuntimeError("Database not connected")
    return _pool


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


async def ensure_node_summary(node_id: str, sync_id: str | None = None, force: bool = False) -> dict:
    """Return a short natural-language summary for a node.

    node_id format: 'src_<source_id>:<file_path>'. sync_id defaults to latest.

    Only calls the LLM when there is actual indexed content (chunks) to
    summarise. Without content, the LLM happily confabulates — describing
    the supposed shape of code it has never seen — which is worse than
    saying nothing.

    Caches real LLM output in `file_embeddings.description` so subsequent
    reads are free. Does NOT cache the "no content" state so that a later
    successful ingestion will produce a real summary on the next request.

    Returns a dict with keys:
      - summary:   str (empty when source is "no_content" or "not_found")
      - cached:    bool (true when served from description column)
      - source:    "cache" | "llm" | "no_content" | "llm_failed" | "not_found"
      - chunk_count: int (how many chunks were used as input)
    """
    import httpx
    import uuid as _uuid

    if not _pool:
        raise RuntimeError("Database not connected")

    if not node_id.startswith("src_") or ":" not in node_id:
        return {"summary": "", "cached": False, "source": "not_found", "chunk_count": 0}
    src_part, file_path = node_id[4:].split(":", 1)
    source_id = src_part
    try:
        source_id = str(_uuid.UUID(source_id))
    except (ValueError, AttributeError, TypeError):
        return {"summary": "", "cached": False, "source": "not_found", "chunk_count": 0}
    if sync_id is not None:
        try:
            sync_id = str(_uuid.UUID(sync_id))
        except (ValueError, AttributeError, TypeError):
            return {"summary": "", "cached": False, "source": "not_found", "chunk_count": 0}

    logger.info("summary_start", node_id=node_id, force=force)

    async with _pool.acquire() as conn:
        if sync_id is None:
            sync_id = await conn.fetchval(
                """SELECT fe.sync_id::text FROM file_embeddings fe
                   JOIN sync_runs sr ON sr.id = fe.sync_id
                   WHERE fe.source_id=$1::uuid AND fe.file_path=$2
                   ORDER BY sr.completed_at DESC NULLS LAST LIMIT 1""",
                source_id, file_path,
            )
            if not sync_id:
                logger.info("summary_node_not_found", node_id=node_id)
                return {"summary": "", "cached": False, "source": "not_found", "chunk_count": 0}

        row = await conn.fetchrow(
            """SELECT id::text, file_path, name, type, domain, language, description
               FROM file_embeddings WHERE source_id=$1::uuid AND file_path=$2 AND sync_id=$3::uuid""",
            source_id, file_path, sync_id,
        )
        if not row:
            logger.info("summary_node_not_found", node_id=node_id)
            return {"summary": "", "cached": False, "source": "not_found", "chunk_count": 0}

        if row["description"] and not force:
            logger.info("summary_cache_hit", node_id=node_id)
            return {"summary": row["description"], "cached": True, "source": "cache", "chunk_count": -1}

        chunk_rows = await conn.fetch(
            """SELECT content, start_line, end_line FROM content_chunks
               WHERE file_id=$1::uuid ORDER BY chunk_index LIMIT 5""",
            row["id"],
        )

    # No indexed content → refuse to summarise. Calling the LLM with only
    # a path and type produces plausible-sounding but fabricated prose.
    if not chunk_rows:
        logger.info("summary_no_content", node_id=node_id, file_path=row["file_path"])
        return {"summary": "", "cached": False, "source": "no_content", "chunk_count": 0}

    excerpts = []
    total_chars = 0
    for ch in chunk_rows:
        remaining = settings.summary_chunk_sample_chars - total_chars
        if remaining <= 0:
            break
        text = ch["content"][:remaining]
        excerpts.append(f"[lines {ch['start_line']}-{ch['end_line']}]\n{text}")
        total_chars += len(text)
    excerpts_block = "\n\n".join(excerpts)

    system_prompt = (
        "You are a senior engineer summarising a single source file in a "
        "knowledge graph. Write 2-3 plain sentences covering what the file "
        "does, the kind of code it contains, and anything notable. Only "
        "describe what you can see in the excerpts — do not invent details "
        "or speculate about what isn't shown. No markdown, no headings, "
        "no preamble."
    )
    user_prompt = (
        f"File path: {row['file_path']}\nName: {row['name']}\nType: {row['type']}\n"
        f"Language: {row['language'] or 'unknown'}\nDomain: {row['domain'] or '-'}\n\n"
        f"Excerpts:\n{excerpts_block}\n\nSummary:"
    )

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
    except Exception as e:
        logger.warning("summary_llm_failed", node_id=node_id, error=str(e))
        return {"summary": "", "cached": False, "source": "llm_failed", "chunk_count": len(chunk_rows)}

    if not summary_text:
        logger.warning("summary_llm_empty", node_id=node_id)
        return {"summary": "", "cached": False, "source": "llm_failed", "chunk_count": len(chunk_rows)}

    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE file_embeddings SET description=$1 WHERE id=$2::uuid",
            summary_text, row["id"],
        )

    logger.info("summary_persisted", node_id=node_id, chunks=len(chunk_rows))
    return {"summary": summary_text, "cached": False, "source": "llm", "chunk_count": len(chunk_rows)}


