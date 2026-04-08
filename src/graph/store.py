import structlog
from dataclasses import dataclass, field
from datetime import datetime, timezone
from neo4j import AsyncGraphDatabase, AsyncDriver

logger = structlog.get_logger()

_driver: AsyncDriver | None = None


@dataclass
class GraphNode:
    id: str
    name: str
    type: str  # service | database | cache | external
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
            }
        }
        for e in edges
    ]


async def connect(url: str, user: str, password: str) -> None:
    global _driver
    _driver = AsyncGraphDatabase.driver(url, auth=(user, password))
    await _driver.verify_connectivity()
    logger.info("neo4j_connected", url=url)


async def disconnect() -> None:
    global _driver
    if _driver:
        await _driver.close()
        _driver = None
        logger.info("neo4j_disconnected")


def _label_for_type(node_type: str) -> str:
    return {"service": "Service", "database": "Database", "cache": "Cache", "external": "External"}.get(
        node_type, "Service"
    )


async def merge_node(node: GraphNode) -> None:
    if not _driver:
        raise RuntimeError("Neo4j not connected")
    label = _label_for_type(node.type)
    now = datetime.now(timezone.utc).isoformat()
    async with _driver.session() as session:
        await session.run(
            f"""
            MERGE (n:{label} {{id: $id}})
            ON CREATE SET n.first_seen = $now
            SET n.name = $name,
                n.domain = $domain,
                n.status = $status,
                n.source = $source,
                n.meta = $meta,
                n.last_seen = $now
            """,
            id=node.id,
            name=node.name,
            domain=node.domain,
            status=node.status,
            source=node.source,
            meta=str(node.meta),
            now=now,
        )


async def merge_edge(edge: GraphEdge) -> None:
    if not _driver:
        raise RuntimeError("Neo4j not connected")
    now = datetime.now(timezone.utc).isoformat()
    async with _driver.session() as session:
        await session.run(
            """
            MATCH (a {id: $source_id})
            MATCH (b {id: $target_id})
            MERGE (a)-[r:DEPENDS_ON]->(b)
            SET r.label = $label,
                r.weight = $weight,
                r.created_at = coalesce(r.created_at, $now)
            """,
            source_id=edge.source,
            target_id=edge.target,
            label=edge.label,
            weight=edge.weight,
            now=now,
        )


async def get_full_snapshot() -> GraphSnapshot:
    if not _driver:
        raise RuntimeError("Neo4j not connected")
    type_map = {"Service": "service", "Database": "database", "Cache": "cache", "External": "external"}

    async with _driver.session() as session:
        node_result = await session.run(
            """
            MATCH (n)
            WHERE n:Service OR n:Database OR n:Cache OR n:External
            RETURN n.id AS id, n.name AS name, labels(n)[0] AS type,
                   n.domain AS domain, n.status AS status, n.source AS source,
                   n.meta AS meta, n.first_seen AS first_seen, n.last_seen AS last_seen
            """
        )
        node_records = await node_result.values()

    nodes = [
        GraphNode(
            id=r[0],
            name=r[1] or r[0],
            type=type_map.get(r[2], "service"),
            domain=r[3] or "",
            status=r[4] or "healthy",
            source=r[5] or "github",
            first_seen=r[7] or "",
            last_seen=r[8] or "" if len(r) > 8 else "",
        )
        for r in node_records
    ]

    async with _driver.session() as session:
        edge_result = await session.run(
            """
            MATCH (a)-[r:DEPENDS_ON]->(b)
            RETURN a.id AS source, b.id AS target, r.label AS label,
                   r.weight AS weight, type(r) AS type
            """
        )
        edge_records = await edge_result.values()

    edges = [
        GraphEdge(
            id=f"{r[0]}->{r[1]}",
            source=r[0],
            target=r[1],
            type="depends",
            label=r[2] or "",
            weight=r[3] or 1.0,
        )
        for r in edge_records
    ]

    return GraphSnapshot(
        nodes=nodes,
        edges=edges,
        meta={"node_count": len(nodes), "edge_count": len(edges)},
    )


async def get_node_with_neighbors(node_id: str) -> dict:
    if not _driver:
        raise RuntimeError("Neo4j not connected")
    async with _driver.session() as session:
        result = await session.run(
            """
            MATCH (n {id: $id})
            OPTIONAL MATCH (n)-[r:DEPENDS_ON]->(out {})
            OPTIONAL MATCH (in {})-[r2:DEPENDS_ON]->(n)
            RETURN n, collect(DISTINCT out) AS dependents, collect(DISTINCT in) AS dependencies
            """,
            id=node_id,
        )
        record = await result.single()
        if not record:
            return {}
        return record.data()


async def get_stats() -> dict:
    if not _driver:
        raise RuntimeError("Neo4j not connected")
    async with _driver.session() as session:
        result = await session.run(
            """
            MATCH (n) WHERE n:Service OR n:Database OR n:Cache OR n:External
            WITH labels(n)[0] AS label, count(n) AS cnt
            RETURN collect({type: label, count: cnt}) AS nodes_by_type
            """
        )
        record = await result.single()
        nodes_by_type = {}
        if record:
            for item in record["nodes_by_type"]:
                nodes_by_type[item["type"].lower()] = item["count"]

    async with _driver.session() as session:
        edge_result = await session.run("MATCH ()-[r:DEPENDS_ON]->() RETURN count(r) AS total")
        edge_record = await edge_result.single()

    return {
        "nodes_by_type": nodes_by_type,
        "total_edges": edge_record["total"] if edge_record else 0,
    }
