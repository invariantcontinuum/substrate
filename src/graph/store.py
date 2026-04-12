import json
import structlog
import asyncpg
from dataclasses import dataclass, field

from src.config import settings

logger = structlog.get_logger()

_pool: asyncpg.Pool | None = None

AGE_PREAMBLE = "LOAD 'age'; SET search_path = ag_catalog, \"$user\", public;"


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
    """Run AGE preamble on a connection so cypher() is available."""
    await conn.execute(AGE_PREAMBLE)


async def connect() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url.replace("postgresql+asyncpg://", "postgresql://"),
        min_size=2,
        max_size=10,
        init=_init_age,
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

    return GraphSnapshot(
        nodes=nodes,
        edges=edges,
        meta={"node_count": len(nodes), "edge_count": len(edges)},
    )


async def get_node_with_neighbors(node_id: str) -> dict:
    if not _pool:
        raise RuntimeError("Database not connected")

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

    return {
        "nodes_by_type": nodes_by_type,
        "total_nodes": total_nodes,
        "total_edges": total_edges,
    }


async def search(query_embedding: list[float], limit: int = 10,
                 type_filter: str = "", domain_filter: str = "") -> list[dict]:
    if not _pool:
        raise RuntimeError("Database not connected")

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

    return [
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


async def purge_all() -> None:
    if not _pool:
        raise RuntimeError("Database not connected")

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
