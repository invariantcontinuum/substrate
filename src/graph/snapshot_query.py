"""Single-pass merged-graph reads for the active set."""
import json
import time
import uuid as _uuid
import structlog
from src.graph import store

logger = structlog.get_logger()


def _validate_uuids(values: list[str]) -> list[str]:
    """Raise ValueError if any element isn't a valid UUID string. Returns the canonical str form."""
    out: list[str] = []
    for v in values:
        try:
            out.append(str(_uuid.UUID(v)))
        except (ValueError, AttributeError, TypeError):
            raise ValueError(f"invalid uuid: {v!r}")
    return out


def _node_id(source_id: str, file_path: str) -> str:
    return f"src_{source_id}:{file_path}"


async def get_merged_graph(sync_ids: list[str]) -> dict:
    if not sync_ids:
        return {"nodes": [], "edges": [],
                "meta": {"active_sync_ids": [], "node_count": 0, "edge_count": 0, "duration_ms": 0}}
    sync_ids = _validate_uuids(sync_ids)  # raises ValueError on bad input
    pool = store.get_pool()

    start = time.monotonic()
    async with pool.acquire() as conn:
        node_rows = await conn.fetch(
            """
            WITH ranked AS (
                SELECT fe.source_id::text AS source_id,
                       fe.file_path,
                       fe.sync_id::text AS sync_id,
                       fe.name, fe.type, fe.domain,
                       fe.content_hash,
                       sr.completed_at,
                       row_number() OVER (
                           PARTITION BY fe.source_id, fe.file_path
                           ORDER BY sr.completed_at DESC NULLS LAST, sr.id DESC
                       ) AS rn
                FROM file_embeddings fe
                JOIN sync_runs sr ON sr.id = fe.sync_id
                WHERE fe.sync_id = ANY($1::uuid[])
            )
            SELECT source_id, file_path,
                   array_agg(sync_id ORDER BY completed_at NULLS LAST) AS loaded_sync_ids,
                   max(sync_id) FILTER (WHERE rn = 1) AS latest_sync_id,
                   max(name)   FILTER (WHERE rn = 1) AS name,
                   max(type)   FILTER (WHERE rn = 1) AS type,
                   max(domain) FILTER (WHERE rn = 1) AS domain,
                   count(DISTINCT content_hash) > 1 AS divergent
            FROM ranked
            GROUP BY source_id, file_path
            """,
            sync_ids,
        )

        nodes = [
            {"data": {
                "id": _node_id(r["source_id"], r["file_path"]),
                "name": r["name"], "type": r["type"], "domain": r["domain"] or "",
                "source_id": r["source_id"], "file_path": r["file_path"],
                "loaded_sync_ids": list(r["loaded_sync_ids"]),
                "latest_sync_id": r["latest_sync_id"],
                "divergent": bool(r["divergent"]),
            }}
            for r in node_rows
        ]

        edges_raw = []
        try:
            sync_id_list = ",".join(f"'{s}'" for s in sync_ids)
            edge_rows = await conn.fetch(
                f"""
                SELECT * FROM cypher('substrate', $$
                    MATCH (a:File)-[r]->(b:File)
                    WHERE r.sync_id IN [{sync_id_list}]
                    RETURN a.source_id, a.file_id, b.source_id, b.file_id, r.weight, r.sync_id
                $$) AS (a_src agtype, a_file agtype, b_src agtype, b_file agtype, weight agtype, sync_id agtype)
                """
            )
            edges_raw = edge_rows
        except Exception as e:
            logger.warning("age_edge_query_failed", error=str(e))

        edges = []
        if edges_raw:
            try:
                file_id_set = set()
                parsed = []
                for e in edges_raw:
                    a_file = json.loads(str(e["a_file"]))
                    b_file = json.loads(str(e["b_file"]))
                    weight = float(json.loads(str(e["weight"]))) if e["weight"] else 1.0
                    e_sync = json.loads(str(e["sync_id"]))
                    file_id_set.add(a_file); file_id_set.add(b_file)
                    parsed.append((a_file, b_file, weight, e_sync))

                id_rows = await conn.fetch(
                    "SELECT id::text, source_id::text, file_path FROM file_embeddings WHERE id = ANY($1::uuid[])",
                    list(file_id_set),
                )
                id_map = {r["id"]: (r["source_id"], r["file_path"]) for r in id_rows}

                edge_agg: dict[tuple[str, str], dict] = {}
                for a_file, b_file, weight, e_sync in parsed:
                    a = id_map.get(a_file); b = id_map.get(b_file)
                    if not a or not b: continue
                    a_node = _node_id(*a); b_node = _node_id(*b)
                    key = (a_node, b_node)
                    rec = edge_agg.setdefault(key, {"loaded_sync_ids": set(), "weight_max": 0.0})
                    rec["loaded_sync_ids"].add(e_sync)
                    rec["weight_max"] = max(rec["weight_max"], weight)
                edges = [
                    {"data": {
                        "id": f"{a}->{b}", "source": a, "target": b, "label": "depends_on",
                        "loaded_sync_ids": sorted(v["loaded_sync_ids"]), "weight_max": v["weight_max"],
                    }}
                    for (a, b), v in edge_agg.items()
                ]
            except Exception as e:
                logger.warning("age_edge_postprocess_failed", error=str(e))
                edges = []

    duration_ms = round((time.monotonic() - start) * 1000)
    logger.info("merged_graph", node_count=len(nodes), edge_count=len(edges), duration_ms=duration_ms)
    return {
        "nodes": nodes, "edges": edges,
        "meta": {"active_sync_ids": sync_ids, "node_count": len(nodes),
                 "edge_count": len(edges), "duration_ms": duration_ms},
    }


async def get_node_detail(node_id: str, sync_id: str | None = None) -> dict:
    """node_id format: 'src_<source_id>:<file_path>'."""
    if not node_id.startswith("src_") or ":" not in node_id:
        return {}
    src_part, file_path = node_id[4:].split(":", 1)
    source_id = src_part
    try:
        source_id = str(_uuid.UUID(source_id))
    except (ValueError, AttributeError, TypeError):
        return {}
    if sync_id is not None:
        try:
            sync_id = str(_uuid.UUID(sync_id))
        except (ValueError, AttributeError, TypeError):
            return {}
    pool = store.get_pool()

    async with pool.acquire() as conn:
        if sync_id is None:
            sync_id = await conn.fetchval(
                """SELECT fe.sync_id::text
                   FROM file_embeddings fe
                   JOIN sync_runs sr ON sr.id = fe.sync_id
                   WHERE fe.source_id = $1::uuid AND fe.file_path = $2
                   ORDER BY sr.completed_at DESC NULLS LAST
                   LIMIT 1""",
                source_id, file_path,
            )
            if not sync_id:
                return {}
        node = await conn.fetchrow(
            """SELECT id::text, file_path, name, type, domain, language,
                      status, description, size_bytes, line_count,
                      content_hash, created_at::text
               FROM file_embeddings
               WHERE source_id=$1::uuid AND file_path=$2 AND sync_id=$3::uuid""",
            source_id, file_path, sync_id,
        )
        if not node:
            return {}

        neighbors = []
        try:
            edge_rows = await conn.fetch(
                f"""SELECT * FROM cypher('substrate', $$
                    MATCH (a:File {{file_id: '{node["id"]}', sync_id: '{sync_id}'}})-[r]-(b:File)
                    WHERE r.sync_id = '{sync_id}'
                    RETURN b.file_id, label(r), r.weight
                $$) AS (neighbor_file agtype, rel_type agtype, weight agtype)"""
            )
            file_ids = []
            tmp = []
            for r in edge_rows:
                nf = json.loads(str(r["neighbor_file"])) if r["neighbor_file"] else None
                rt = json.loads(str(r["rel_type"])) if r["rel_type"] else "depends_on"
                w = float(json.loads(str(r["weight"]))) if r["weight"] else 1.0
                if nf:
                    file_ids.append(nf); tmp.append((nf, str(rt), w))
            if file_ids:
                id_rows = await conn.fetch(
                    "SELECT id::text, source_id::text, file_path FROM file_embeddings WHERE id = ANY($1::uuid[])",
                    file_ids,
                )
                id_map = {r["id"]: (r["source_id"], r["file_path"]) for r in id_rows}
                for nf, rt, w in tmp:
                    pair = id_map.get(nf)
                    if pair:
                        neighbors.append({
                            "id": _node_id(*pair), "type": rt, "weight": w,
                        })
        except Exception:
            pass

    return {
        "node": {
            "id": _node_id(source_id, file_path),
            "name": node["name"], "type": node["type"], "domain": node["domain"] or "",
            "language": node["language"] or "", "status": node["status"] or "healthy",
            "description": node["description"] or "", "file_path": node["file_path"],
            "size_bytes": node["size_bytes"], "line_count": node["line_count"],
            "content_hash": node["content_hash"], "created_at": node["created_at"],
            "sync_id": sync_id,
        },
        "neighbors": neighbors,
    }
