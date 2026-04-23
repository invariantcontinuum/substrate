"""Per-sync Leiden community detection at sync completion (spec §4.3).

Fixed-default Leiden pass run at sync completion. Reads nodes + edges from AGE
via cypher (File vlabel + DEPENDS_ON relation), builds a networkx Graph, runs
graspologic.partition.hierarchical_leiden with settings.per_sync_leiden_*, and
writes the result to sync_runs.stats.leiden via the same dict-merge strategy
that finalize_stats uses. Non-failing by design: on error, records a warning
sync_issue and leaves stats.leiden absent.

Results land alongside finalize_stats' keys (counts/storage/embeddings/timing/
issues). These knobs intentionally do NOT feed the active-set carousel compute
(spec \"Two Leidens\")."""
import asyncio
import json
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import asyncpg
import networkx as nx
import structlog
from graspologic.partition import hierarchical_leiden

from src import graph_writer, sync_issues
from src.config import settings

logger = structlog.get_logger()


def _escape_cypher_literal(s: str) -> str:
    # Same escape shape used across graph_writer. sync_ids are UUIDs so only
    # defensive — never practically needed — but kept symmetric with finalize_stats.
    return s.replace("\\", "\\\\").replace("'", "\\'")


async def per_sync_leiden(sync_id: str | UUID) -> None:
    if not settings.per_sync_leiden_enabled:
        return
    sync_id = str(sync_id)
    try:
        await asyncio.wait_for(
            _run(sync_id),
            timeout=settings.per_sync_leiden_timeout_s,
        )
    except Exception as e:  # noqa: BLE001 — never throw from the finalize path
        logger.warning("per_sync_leiden_failed", sync_id=sync_id, error=str(e))
        try:
            await sync_issues.record_issue(
                sync_id=sync_id, level="warning", phase="computing_communities",
                code="per_sync_leiden_failed", message=f"leiden failed: {e}",
            )
        except Exception as e2:  # noqa: BLE001 — last-resort
            logger.error("sync_issues_record_failed_during_leiden",
                         sync_id=sync_id, error=str(e2))


async def _run(sync_id: str) -> None:
    t0 = time.perf_counter()
    pool = graph_writer.get_pool()
    sid = _escape_cypher_literal(sync_id)

    async with pool.acquire() as conn:
        # Read nodes: file_id is the node identity for our purposes.
        node_rows = await conn.fetch(
            f"SELECT * FROM cypher('substrate', $$ "
            f"MATCH (n:File) WHERE n.sync_id = '{sid}' RETURN n.file_id "
            f"$$) AS (file_id agtype)"
        )
        node_ids = [json.loads(str(r["file_id"])) for r in node_rows]

        edge_rows = await conn.fetch(
            f"SELECT * FROM cypher('substrate', $$ "
            f"MATCH (a:File)-[r]->(b:File) WHERE r.sync_id = '{sid}' "
            f"RETURN a.file_id, b.file_id "
            f"$$) AS (a_file agtype, b_file agtype)"
        )
        edge_pairs = [
            (json.loads(str(r["a_file"])), json.loads(str(r["b_file"])))
            for r in edge_rows
        ]

    now_iso = (
        datetime.now(tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )

    # Too-small guard → write a 'too_small' note and exit. min_cluster_size is
    # the natural floor: any smaller graph cannot yield a surviving cluster.
    if len(node_ids) < settings.per_sync_leiden_min_cluster_size:
        payload = {
            "leiden": {"count": 0, "note": "too_small", "computed_at": now_iso}
        }
        await _merge_stats(pool, sync_id, payload)
        logger.info("per_sync_leiden_too_small", sync_id=sync_id, n=len(node_ids))
        return

    g = nx.Graph()
    g.add_nodes_from(node_ids)
    g.add_edges_from((s, t) for s, t in edge_pairs if s != t)

    # hierarchical_leiden returns a log of HierarchicalCluster entries; level 0
    # is the result of the flat Leiden run. We only consume level 0 here.
    partitions = hierarchical_leiden(
        g,
        resolution=settings.per_sync_leiden_resolution,
        randomness=settings.per_sync_leiden_beta,
        random_seed=settings.per_sync_leiden_seed,
        use_modularity=True,
    )
    level0 = [p for p in partitions if p.level == 0]
    assignments_raw: dict[str, int] = {p.node: p.cluster for p in level0}

    # Drop clusters below min_cluster_size into "Other" (-1). Renumber
    # descending so cluster 0 is the largest.
    sizes = Counter(assignments_raw.values())
    min_sz = settings.per_sync_leiden_min_cluster_size
    keep = {c: cnt for c, cnt in sizes.items() if cnt >= min_sz}
    sorted_clusters = sorted(keep.items(), key=lambda kv: -kv[1])
    renumber = {old: new for new, (old, _) in enumerate(sorted_clusters)}

    final_assignments: dict[str, int] = {}
    orphan_count = 0
    for node, cluster in assignments_raw.items():
        if cluster in renumber:
            final_assignments[node] = renumber[cluster]
        else:
            final_assignments[node] = -1
            orphan_count += 1

    sizes_sorted = [s for _, s in sorted_clusters]
    total = len(assignments_raw) or 1
    largest_share = (sizes_sorted[0] / total) if sizes_sorted else 0.0
    orphan_pct = orphan_count / total if total else 0.0
    modularity = _modularity(g, final_assignments)

    payload = {
        "leiden": {
            "config_used": {
                "resolution": settings.per_sync_leiden_resolution,
                "beta": settings.per_sync_leiden_beta,
                "iterations": settings.per_sync_leiden_iterations,
                "min_cluster_size": settings.per_sync_leiden_min_cluster_size,
                "seed": settings.per_sync_leiden_seed,
            },
            "count": len(sizes_sorted),
            "modularity": round(modularity, 6),
            "largest_share": round(largest_share, 6),
            "orphan_pct": round(orphan_pct, 6),
            "community_sizes": sizes_sorted,
            "computed_at": now_iso,
        }
    }
    await _merge_stats(pool, sync_id, payload)
    logger.info("per_sync_leiden_done", sync_id=sync_id,
                count=len(sizes_sorted), modularity=round(modularity, 4),
                ms=int((time.perf_counter() - t0) * 1000))


def _modularity(g: nx.Graph, assignments: dict[str, int]) -> float:
    """Compute modularity over non-orphan (cluster >= 0) partition."""
    from networkx.algorithms.community import modularity as nx_modularity
    communities: dict[int, set[str]] = {}
    for n, c in assignments.items():
        if c < 0:
            continue
        communities.setdefault(c, set()).add(n)
    if not communities:
        return 0.0
    return nx_modularity(
        g, list(communities.values()),
        resolution=settings.per_sync_leiden_resolution,
    )


async def _merge_stats(pool: asyncpg.Pool, sync_id: str,
                       payload: dict[str, Any]) -> None:
    """Read-modify-write merge matching finalize_stats' pattern. The pool loads
    AGE with search_path=ag_catalog,public, so the jsonb || jsonb operator
    resolves to AGE's agtype concat (array-producing), not pg_catalog's
    object-merge. Python-side merge is the safe path and also preserves keys
    written by other jobs (finalize_stats' counts/storage/etc.)."""
    async with pool.acquire() as conn:
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
