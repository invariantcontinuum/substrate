"""Computes snapshot-row stats at sync completion. Writes to sync_runs.stats
(spec §4.2). Non-failing: on error, writes a warning issue and leaves
stats.schema_version = 0 so the UI can render an 'unavailable' fallback.

Counts are issued against AGE via cypher — the substrate graph uses File/Symbol
vlabels plus DEPENDS_ON/DEFINES relationships rather than flat relational tables.
Relational counts (files_indexed, chunks) come from file_embeddings / content_chunks.
Storage numbers approximate via pg_column_size on those relational rows."""
import asyncio
import json
import time
from typing import Any
from uuid import UUID

import asyncpg
import structlog

from src import graph_writer, sync_issues
from src.config import settings

logger = structlog.get_logger()


def _escape_cypher_literal(s: str) -> str:
    # Same escape shape used across graph_writer. sync_ids are UUIDs so only
    # defensive — never practically needed — but kept symmetric.
    return s.replace("\\", "\\\\").replace("'", "\\'")


async def finalize_stats(sync_id: str | UUID) -> None:
    sync_id = str(sync_id)
    try:
        await asyncio.wait_for(
            _compute_and_write(sync_id),
            timeout=settings.finalize_stats_timeout_s,
        )
    except Exception as e:
        logger.warning("finalize_stats_failed", sync_id=sync_id, error=str(e))
        try:
            await sync_issues.record_issue(
                sync_id=sync_id, level="warning", phase="finalizing_stats",
                code="finalize_stats_failed", message=f"stats pass failed: {e}",
            )
        except Exception as e2:  # noqa: BLE001 — last-resort: never throw from finalize
            logger.error("sync_issues_record_failed_during_finalize",
                         sync_id=sync_id, error=str(e2))
        # schema_version stays 0 → UI shows "stats unavailable"


async def _compute_and_write(sync_id: str) -> None:
    t0 = time.perf_counter()
    pool = graph_writer.get_pool()
    async with pool.acquire() as conn:
        counts = await _counts(conn, sync_id)
        storage = await _storage(conn, sync_id)
        embeddings = await _embeddings(conn, sync_id)
        timing = await _timing(conn, sync_id)
        issues = await _issues(conn, sync_id)

        payload: dict[str, Any] = {
            "counts": counts,
            "storage": storage,
            "embeddings": embeddings,
            "timing": timing,
            "issues": issues,
            "schema_version": 1,
        }
        # Merge in Python rather than via the SQL || operator: the pool loads
        # AGE and runs with search_path=ag_catalog,public, so the jsonb || jsonb
        # operator resolves to AGE's agtype concat (which produces an array),
        # not pg_catalog's object-merge. Reading existing stats into a dict,
        # merging top-level keys, and writing the whole column back gives the
        # intended "merge-and-overwrite" behaviour while still preserving keys
        # written by other jobs (e.g. sync_issues.issues_suppressed, Task 5's
        # stats.leiden).
        existing = await conn.fetchval(
            "SELECT stats FROM sync_runs WHERE id = $1::uuid", sync_id,
        )
        if isinstance(existing, str):
            existing = json.loads(existing)
        if not isinstance(existing, dict):
            existing = {}
        merged = {**existing, **payload}
        # Pass the dict directly: substrate_common.db installs a jsonb codec
        # that encodes via json.dumps, so json.dumps here would double-encode
        # and land a JSON-string-valued jsonb instead of an object.
        await conn.execute(
            "UPDATE sync_runs SET stats = $2::jsonb WHERE id = $1::uuid",
            sync_id, merged,
        )
    logger.info("finalize_stats_done", sync_id=sync_id,
                ms=int((time.perf_counter() - t0) * 1000))


async def _counts(conn: asyncpg.Connection, sync_id: str) -> dict[str, Any]:
    sid = _escape_cypher_literal(sync_id)

    async def _age_count(cypher_body: str) -> int:
        rows = await conn.fetch(
            f"SELECT * FROM cypher('substrate', $$ {cypher_body} $$) AS (cnt agtype)"
        )
        if not rows:
            return 0
        return int(str(rows[0]["cnt"]))

    async def _age_group(cypher_body: str) -> dict[str, int]:
        rows = await conn.fetch(
            f"SELECT * FROM cypher('substrate', $$ {cypher_body} $$) "
            f"AS (key agtype, cnt agtype)"
        )
        out: dict[str, int] = {}
        for r in rows:
            k = json.loads(str(r["key"]))  # agtype strings come back JSON-quoted
            v = int(str(r["cnt"]))
            if isinstance(k, str):
                out[k] = v
        return out

    # node count + by_label (vlabel) + by_type (node.type property)
    node_count = await _age_count(
        f"MATCH (n) WHERE n.sync_id = '{sid}' RETURN count(n)"
    )
    by_label = await _age_group(
        f"MATCH (n) WHERE n.sync_id = '{sid}' "
        f"RETURN labels(n)[0] AS key, count(n) AS cnt"
    )
    by_type = await _age_group(
        f"MATCH (n) WHERE n.sync_id = '{sid}' AND n.type IS NOT NULL "
        f"RETURN n.type AS key, count(n) AS cnt"
    )

    # edge count + by_relation (relationship type)
    edge_count = await _age_count(
        f"MATCH ()-[r]->() WHERE r.sync_id = '{sid}' RETURN count(r)"
    )
    by_relation = await _age_group(
        f"MATCH ()-[r]->() WHERE r.sync_id = '{sid}' "
        f"RETURN type(r) AS key, count(r) AS cnt"
    )

    # relational file count (files that got an embedding row — the actual "indexed" set)
    files_indexed = await conn.fetchval(
        "SELECT count(*) FROM file_embeddings WHERE sync_id = $1::uuid", sync_id,
    ) or 0
    denied = await conn.fetchval(
        "SELECT denied_file_count FROM sync_runs WHERE id = $1::uuid", sync_id,
    ) or 0
    skipped = await conn.fetchval(
        "SELECT coalesce((progress_meta->>'files_skipped')::int, 0) "
        "FROM sync_runs WHERE id = $1::uuid", sync_id,
    ) or 0

    return {
        "node_count": node_count,
        "edge_count": edge_count,
        "by_label": by_label,      # e.g. {"File": 3, "Symbol": 5}
        "by_type": by_type,        # e.g. {"code": 3, "config": 1}
        "by_relation": by_relation,  # e.g. {"DEPENDS_ON": 2, "DEFINES": 5}
        "files_indexed": int(files_indexed),
        "files_skipped": int(skipped),
        "files_denied": int(denied),
    }


async def _storage(conn: asyncpg.Connection, sync_id: str) -> dict[str, int]:
    # AGE doesn't expose per-node byte sizes cleanly. Use relational tables that
    # mirror the sync: file_embeddings row-sizes + content_chunks row-sizes +
    # the embedding vectors within them already account for the biggest bytes.
    graph_bytes = await conn.fetchval(
        "SELECT coalesce(sum(pg_column_size(cc.*)), 0)::bigint "
        "FROM content_chunks cc WHERE cc.sync_id = $1::uuid", sync_id,
    ) or 0
    embedding_bytes = await conn.fetchval(
        "SELECT coalesce(sum(pg_column_size(fe.*)), 0)::bigint "
        "FROM file_embeddings fe WHERE fe.sync_id = $1::uuid", sync_id,
    ) or 0
    return {"graph_bytes": int(graph_bytes), "embedding_bytes": int(embedding_bytes)}


async def _embeddings(conn: asyncpg.Connection, sync_id: str) -> dict[str, int]:
    chunks = await conn.fetchval(
        "SELECT count(*) FROM content_chunks WHERE sync_id = $1::uuid", sync_id,
    ) or 0
    file_summaries = await conn.fetchval(
        "SELECT count(*) FROM file_embeddings WHERE sync_id = $1::uuid", sync_id,
    ) or 0
    return {"chunks": int(chunks), "file_summaries": int(file_summaries)}


async def _timing(conn: asyncpg.Connection, sync_id: str) -> dict[str, Any]:
    meta = await conn.fetchval(
        "SELECT progress_meta FROM sync_runs WHERE id = $1::uuid", sync_id,
    ) or {}
    if isinstance(meta, str):
        meta = json.loads(meta)
    phase_ms = meta.get("phase_timings", {}) or {}
    total_ms = sum(int(v) for v in phase_ms.values())
    return {"phase_ms": phase_ms, "total_ms": total_ms}


async def _issues(conn: asyncpg.Connection, sync_id: str) -> dict[str, int]:
    rows = await conn.fetch(
        "SELECT level, count(*) AS cnt FROM sync_issues "
        "WHERE sync_id = $1::uuid GROUP BY level", sync_id,
    )
    by_level = {r["level"]: int(r["cnt"]) for r in rows}
    return {
        "error_count": by_level.get("error", 0),
        "warning_count": by_level.get("warning", 0),
        "info_count": by_level.get("info", 0),
    }
