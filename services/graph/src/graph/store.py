import asyncio
import json
import time
import structlog
import asyncpg
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from src.config import settings

logger = structlog.get_logger()

_pool: asyncpg.Pool | None = None

# Per-node locks: two concurrent summary requests for the same file
# should collapse to one LLM call. The second request waits on the
# lock, then re-reads the cache (now populated).
_summary_locks: dict[str, asyncio.Lock] = {}

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


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Per-connection init for every pooled asyncpg connection.

    Registers JSON / JSONB codecs so columns like sync_runs.stats,
    sync_runs.progress_meta and sources.config come back as parsed
    Python dicts instead of raw JSON strings. Without these codecs,
    asyncpg leaves JSONB as text, FastAPI serialises them as string-
    encoded JSON, and the frontend sees `run.stats.nodes === undefined`
    — leaving every stat em-dashed and the progress label stuck on
    'Running' instead of the phase name.

    Runs _init_age last so the AGE-load pre-existing contract stays
    intact for every connection.
    """
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await _init_age(conn)


async def connect() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url.replace("postgresql+asyncpg://", "postgresql://"),
        min_size=2,
        max_size=25,
        init=_init_connection,
        server_settings={"search_path": "ag_catalog,public"},
    )
    parsed = urlsplit(settings.database_url)
    logger.info(
        "pg_pool_connected",
        host=parsed.hostname,
        port=parsed.port,
        database=parsed.path.lstrip("/"),
    )


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


async def get_stats(user_sub: str | None = None) -> dict:
    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("stats_query_start")

    async with _pool.acquire() as conn:
        if user_sub:
            type_rows = await conn.fetch(
                """SELECT fe.type, count(*) AS cnt
                   FROM file_embeddings fe
                   JOIN sources s ON s.id = fe.source_id
                   WHERE s.user_sub = $1
                   GROUP BY fe.type""",
                user_sub,
            )
            total_nodes = await conn.fetchval(
                """SELECT count(*)
                   FROM file_embeddings fe
                   JOIN sources s ON s.id = fe.source_id
                   WHERE s.user_sub = $1""",
                user_sub,
            )
        else:
            type_rows = await conn.fetch(
                "SELECT type, count(*) AS cnt FROM file_embeddings GROUP BY type"
            )
            total_nodes = await conn.fetchval("SELECT count(*) FROM file_embeddings")
        nodes_by_type = {r["type"]: r["cnt"] for r in type_rows}

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
        except Exception as e:  # noqa: BLE001 — AGE stats failure returns partial counts
            logger.warning("age_stats_query_failed", error=str(e))

    logger.info("stats_fetched", total_nodes=total_nodes, total_edges=total_edges,
                types=len(nodes_by_type))

    return {
        "nodes_by_type": nodes_by_type,
        "total_nodes": total_nodes,
        "total_edges": total_edges,
    }


async def search(
    query_embedding: list[float],
    limit: int = 10,
    type_filter: str = "",
    domain_filter: str = "",
    user_sub: str | None = None,
) -> list[dict]:
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
    if user_sub:
        conditions.append(
            f"EXISTS (SELECT 1 FROM sources s WHERE s.id = f.source_id AND s.user_sub = ${len(args) + 1})"
        )
        args.append(user_sub)

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


_NOT_FOUND_SUMMARY = {
    "summary": "",
    "cached": False,
    "source": "not_found",
    "chunk_count": 0,
    "neighbor_count": 0,
    "truncated_file": False,
}


def _not_found() -> dict:
    return dict(_NOT_FOUND_SUMMARY)


async def _resolve_node_uuid(
    conn, node_id: str, sync_id: str | None, user_sub: str | None = None
) -> tuple[str | None, str | None]:
    """Translate either a synthetic ``src_<uuid>:<path>`` id or a raw
    ``file_embeddings.id`` UUID into a ``(file_embeddings.id, sync_id)``
    pair. Returns ``(None, None)`` when the node cannot be located.

    ``sync_id`` is validated (and, for the synthetic shape, resolved to
    the latest completed sync_run when not explicitly supplied).
    """
    import uuid as _uuid

    validated_sync: str | None = None
    if sync_id is not None:
        try:
            validated_sync = str(_uuid.UUID(sync_id))
        except (ValueError, AttributeError, TypeError):
            return None, None

    if node_id.startswith("src_") and ":" in node_id:
        src_part, file_path = node_id[4:].split(":", 1)
        try:
            source_uuid = str(_uuid.UUID(src_part))
        except (ValueError, AttributeError, TypeError):
            return None, None
        resolved_sync = validated_sync
        if resolved_sync is None:
            resolved_sync = await conn.fetchval(
                """SELECT fe.sync_id::text
                     FROM file_embeddings fe
                     JOIN sources s ON s.id = fe.source_id
                     JOIN sync_runs sr ON sr.id = fe.sync_id
                    WHERE fe.source_id = $1::uuid AND fe.file_path = $2
                      AND ($3::text IS NULL OR s.user_sub = $3)
                      AND sr.completed_at IS NOT NULL
                    ORDER BY sr.completed_at DESC, sr.id DESC
                    LIMIT 1""",
                source_uuid, file_path, user_sub,
            )
            if not resolved_sync:
                return None, None
        fe_id = await conn.fetchval(
            """SELECT fe.id::text
               FROM file_embeddings fe
               JOIN sources s ON s.id = fe.source_id
               WHERE fe.source_id=$1::uuid AND fe.file_path=$2 AND fe.sync_id=$3::uuid
                 AND ($4::text IS NULL OR s.user_sub = $4)""",
            source_uuid, file_path, resolved_sync, user_sub,
        )
        if not fe_id:
            return None, None
        return fe_id, resolved_sync

    try:
        fe_uuid = str(_uuid.UUID(node_id))
    except (ValueError, AttributeError, TypeError):
        return None, None
    row = await conn.fetchrow(
        """SELECT fe.id::text, fe.sync_id::text
           FROM file_embeddings fe
           JOIN sources s ON s.id = fe.source_id
           WHERE fe.id = $1::uuid
             AND ($2::uuid IS NULL OR fe.sync_id = $2::uuid)
             AND ($3::text IS NULL OR s.user_sub = $3)
           LIMIT 1""",
        fe_uuid, validated_sync, user_sub,
    )
    if not row:
        return None, None
    return row["id"], row["sync_id"]


async def ensure_node_summary(
    node_id: str,
    sync_id: str | None = None,
    force: bool = False,
    user_sub: str | None = None,
) -> dict:
    """Return a structured enriched summary for a file node.

    ``node_id`` may be the synthetic ``src_<source_uuid>:<file_path>``
    shape emitted by minimal-projection graph reads, or a direct
    ``file_embeddings.id`` UUID. Not-found / invalid ids return a
    graceful ``source="not_found"`` dict rather than raising.

    When ``force`` is false, a cached description (with a non-null
    ``description_generated_at``) short-circuits the LLM call. Otherwise
    the full enrichment pipeline in ``generate_enriched_summary`` runs.
    """
    from src.graph.enriched_summary import generate_enriched_summary

    if not _pool:
        raise RuntimeError("Database not connected")

    logger.info("summary_start", node_id=node_id, force=force)

    async with _pool.acquire() as conn:
        fe_id, resolved_sync = await _resolve_node_uuid(
            conn,
            node_id,
            sync_id,
            user_sub=user_sub,
        )
        if fe_id is None:
            logger.info("summary_node_not_found", node_id=node_id)
            return _not_found()

        # Cache is only consulted when the caller didn't explicitly
        # ask for regeneration. `force=true` bypasses cache entirely
        # and always re-invokes the LLM (under the per-node lock).
        if not force:
            row = await conn.fetchrow(
                """SELECT description, description_generated_at
                     FROM file_embeddings
                    WHERE id = $1::uuid
                      AND ($2::uuid IS NULL OR sync_id = $2::uuid)
                    ORDER BY created_at DESC LIMIT 1""",
                fe_id, resolved_sync,
            )
            if row and row["description"] and row["description_generated_at"] is not None:
                logger.info("summary_cache_hit", node_id=node_id)
                return {
                    "summary": row["description"],
                    "cached": True,
                    "source": "cache",
                    "chunk_count": -1,
                    "neighbor_count": -1,
                    "truncated_file": False,
                }
            # Cache miss without `force` — don't auto-invoke the LLM.
            # Opening a NodeDetailPanel auto-fires this endpoint; the
            # gate prevents every panel open for an unsummarized node
            # from triggering a dense-LLM call and saturating the pool.
            return {
                "summary": "",
                "cached": False,
                "source": "not_generated",
                "chunk_count": 0,
                "neighbor_count": 0,
                "truncated_file": False,
            }

    # Serialize LLM calls per node so two concurrent force=true
    # requests for the same node don't both re-invoke the dense LLM.
    # The second request will simply re-run after the first completes;
    # results are identical so the overwrite is harmless. (We
    # deliberately do *not* short-circuit on cache here: a force=true
    # caller asked for a fresh summary, not the one that was just
    # written a millisecond ago.)
    lock = _summary_locks.setdefault(fe_id, asyncio.Lock())
    async with lock:
        return await generate_enriched_summary(_pool, fe_id, resolved_sync)
