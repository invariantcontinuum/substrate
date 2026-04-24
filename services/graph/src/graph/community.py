"""Active-set Leiden computation + Postgres cache (spec §5.1–§5.2).

Public API:
  - ``get_or_compute(sync_ids, config, user_sub, force)`` -> ``CommunityResult``

Computes hierarchical Leiden over the merged active-set graph, caches the
result in ``leiden_cache`` keyed by ``sha256(sync_ids + config)``, and
returns a compact summary plus a capped per-community sample. Streaming
assignments, pagination, invalidation, and LLM labeling land in later
tasks.

Notes on the Postgres boundary:
  * ``store.get_pool()`` installs a per-connection jsonb codec with
    ``encoder=json.dumps`` (see ``store._init_connection``). JSON payloads
    written here are therefore passed as raw Python dicts — wrapping them
    with ``json.dumps`` would double-encode and land a JSON-string-valued
    jsonb column.
  * Isolated :File nodes (nodes with no DEPENDS_ON edge inside the active
    sync set) are read via AGE cypher, not a relational table. The
    relational ``graph_nodes``/``graph_edges`` tables mentioned in early
    plan drafts do NOT exist in this codebase.
"""
import json
import time
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import networkx as nx
import structlog
from graspologic.partition import hierarchical_leiden

from src.config import settings
from src.graph import snapshot_query, store
from src.graph.leiden_config import LeidenConfig

logger = structlog.get_logger()


@dataclass
class CommunitySummary:
    community_count: int
    modularity: float
    largest_share: float
    orphan_pct: float
    community_sizes: list[int]


@dataclass
class CommunityEntry:
    index: int
    label: str
    size: int
    node_ids_sample: list[str]


@dataclass
class CommunityResult:
    cache_key: str
    cached: bool
    cached_at: str
    expires_at: str
    compute_ms: int
    config_used: dict[str, Any]
    summary: CommunitySummary
    communities: list[CommunityEntry]


async def get_or_compute(
    sync_ids: list[str],
    config: LeidenConfig,
    user_sub: str,
    force: bool = False,
) -> CommunityResult:
    """Return an active-set Leiden result for ``sync_ids`` + ``config``.

    Checks the cache first unless ``force=True``. Cache key is the canonical
    ``sha256(sorted_sync_ids + sorted_config_json)`` from ``LeidenConfig``,
    so identical logical inputs always produce the same key across restarts.

    On cache miss: builds a networkx Graph from ``snapshot_query.merged_edges``
    plus a cypher round-trip for isolated :File nodes, runs graspologic's
    hierarchical Leiden, renumbers surviving clusters by size (descending),
    computes modularity + orphan percentage, persists the row, and returns.
    """
    cache_key = config.canonical_hash(sync_ids)
    if not force:
        hit = await _load_cached(cache_key)
        if hit is not None:
            logger.info(
                "leiden_cache_hit",
                cache_key=cache_key,
                user_sub=user_sub,
                sync_id_count=len(sync_ids),
            )
            return hit

    t0 = time.perf_counter()
    g = await _build_graph(sync_ids)
    raw, sizes_sorted, renumber = _run_leiden(g, config)
    final = _apply_renumber(raw, renumber)
    modularity = _modularity(g, final, config)

    orphan_count = sum(1 for v in final.values() if v < 0)
    total_all = len(final) or 1
    # largest_share is the top community's share of the *clustered* node set
    # (orphans excluded). Using the clustered denominator keeps the cache-hit
    # path able to reproduce this value from `community_sizes` alone, without
    # persisting the pre-filter node count. orphan_pct stays on the total.
    clustered_total = sum(sizes_sorted) or 1
    summary = CommunitySummary(
        community_count=len(sizes_sorted),
        modularity=round(modularity, 6),
        largest_share=round(
            (sizes_sorted[0] / clustered_total) if sizes_sorted else 0.0, 6,
        ),
        orphan_pct=round(orphan_count / total_all, 6),
        community_sizes=sizes_sorted,
    )
    compute_ms = int((time.perf_counter() - t0) * 1000)
    # LLM labels land in Task 14. For now every cluster gets a "Community N"
    # default; the write path preserves whatever labels are present so a
    # later task can swap them in place without re-running Leiden.
    labels = {i: f"Community {i}" for i in range(len(sizes_sorted))}
    communities = _build_community_entries(final, sizes_sorted, labels)

    await _write_cache_row(
        cache_key=cache_key,
        user_sub=user_sub,
        sync_ids=sync_ids,
        config=config.model_dump(),
        summary=summary,
        assignments=final,
        labels=labels,
        compute_ms=compute_ms,
    )
    logger.info(
        "leiden_cache_miss_written",
        cache_key=cache_key,
        user_sub=user_sub,
        community_count=summary.community_count,
        node_count=len(final),
        modularity=summary.modularity,
        compute_ms=compute_ms,
    )
    return CommunityResult(
        cache_key=cache_key,
        cached=False,
        cached_at=_iso_now(),
        expires_at=_iso_expires(),
        compute_ms=compute_ms,
        config_used=config.model_dump(),
        summary=summary,
        communities=communities,
    )


async def _build_graph(sync_ids: list[str]) -> nx.Graph:
    """Build an undirected networkx graph from the active-set merged edges
    plus any :File nodes in the active sync set that have no DEPENDS_ON
    edge (Leiden must still partition them)."""
    # Defensive validation — the final boundary before a cypher literal is
    # formed. ``snapshot_query.merged_edges`` validates again on its own
    # side; this second pass keeps the isolated-node cypher below safe.
    for s in sync_ids:
        uuid.UUID(s)

    g = nx.Graph()
    async for s, t in snapshot_query.merged_edges(sync_ids):
        if s != t:
            g.add_edge(s, t)

    pool = store.get_pool()
    sync_id_list = ",".join(f"'{s}'" for s in sync_ids)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                    MATCH (n:File) WHERE n.sync_id IN [{sync_id_list}]
                    RETURN DISTINCT n.file_id
                $$) AS (file_id agtype)"""
        )
    for r in rows:
        nid = json.loads(str(r["file_id"]))
        if isinstance(nid, str) and nid not in g:
            g.add_node(nid)
    return g


def _run_leiden(
    g: nx.Graph, cfg: LeidenConfig,
) -> tuple[dict[str, int], list[int], dict[int, int]]:
    """Run hierarchical Leiden and keep only level-0 assignments. Drops any
    cluster smaller than ``cfg.min_cluster_size`` (they become orphans at
    renumber time), then sorts the survivors by size descending and
    renumbers from 0 so the first entry is always the largest cluster.

    graspologic's ``extra_forced_iterations`` = additional passes beyond
    its own built-in convergence. ``cfg.iterations == 1`` maps to 0 extra
    forced iterations, matching the ingestion-side ``per_sync_leiden``
    mapping for parity across the two Leidens (spec §"Two Leidens")."""
    parts = hierarchical_leiden(
        g,
        resolution=cfg.resolution,
        randomness=cfg.beta,
        extra_forced_iterations=max(0, cfg.iterations - 1),
        random_seed=cfg.seed,
        use_modularity=True,
    )
    level0 = [p for p in parts if p.level == 0]
    raw: dict[str, int] = {p.node: p.cluster for p in level0}
    sizes = Counter(raw.values())
    keep = {c: cnt for c, cnt in sizes.items() if cnt >= cfg.min_cluster_size}
    sorted_clusters = sorted(keep.items(), key=lambda kv: -kv[1])
    renumber = {old: new for new, (old, _) in enumerate(sorted_clusters)}
    sizes_sorted = [cnt for _, cnt in sorted_clusters]
    return raw, sizes_sorted, renumber


def _apply_renumber(
    raw: dict[str, int], renumber: dict[int, int],
) -> dict[str, int]:
    """Rewrite Leiden's raw cluster ids to the size-descending index and
    assign ``-1`` (orphan) to every node whose raw cluster was dropped for
    being below ``min_cluster_size``."""
    return {n: renumber.get(c, -1) for n, c in raw.items()}


def _modularity(
    g: nx.Graph, final: dict[str, int], cfg: LeidenConfig,
) -> float:
    """Compute modularity over surviving (non-orphan) partitions only.
    Using ``cfg.resolution`` here matches the resolution used by Leiden so
    the reported score is the value Leiden optimised, not a rescaled one."""
    groups: dict[int, set[str]] = {}
    for n, c in final.items():
        if c < 0:
            continue
        groups.setdefault(c, set()).add(n)
    if not groups:
        return 0.0
    return nx.algorithms.community.modularity(
        g, list(groups.values()), resolution=cfg.resolution,
    )


def _build_community_entries(
    final: dict[str, int],
    sizes: list[int],
    labels: dict[int, str],
) -> list[CommunityEntry]:
    """Produce the capped ``CommunityEntry`` list for the response payload.
    ``node_ids_sample`` is truncated per ``settings.leiden_community_sample_size``;
    the full assignment list is retrievable via the streaming
    ``get_assignments`` endpoint (Task 12)."""
    by_idx: dict[int, list[str]] = {}
    for node, idx in final.items():
        if idx < 0:
            continue
        by_idx.setdefault(idx, []).append(node)
    cap = settings.leiden_community_sample_size
    return [
        CommunityEntry(
            index=i,
            label=labels.get(i, f"Community {i}"),
            size=size,
            node_ids_sample=by_idx.get(i, [])[:cap],
        )
        for i, size in enumerate(sizes)
    ]


async def _load_cached(cache_key: str) -> CommunityResult | None:
    """Read a non-expired ``leiden_cache`` row and rehydrate a full
    ``CommunityResult``. Returns ``None`` on miss or expired TTL. The
    jsonb codec registered in ``store._init_connection`` decodes both
    ``config`` and ``assignments`` into Python dicts already — the
    ``isinstance(..., str)`` branches are defensive in case the codec
    changes upstream."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT cache_key, user_sub, sync_ids, config, community_count, "
            "       modularity, orphan_pct, community_sizes, assignments, "
            "       labels, compute_ms, "
            "       to_char(created_at at time zone 'UTC', "
            "               'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, "
            "       to_char(expires_at at time zone 'UTC', "
            "               'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS expires_at "
            "FROM leiden_cache "
            "WHERE cache_key = $1 AND expires_at > now()",
            cache_key,
        )
    if not row:
        return None

    cfg_raw = row["config"]
    cfg_dict = json.loads(cfg_raw) if isinstance(cfg_raw, str) else cfg_raw
    assignments_raw = row["assignments"]
    assignments = (
        json.loads(assignments_raw)
        if isinstance(assignments_raw, str)
        else assignments_raw
    )
    labels_raw = row["labels"]
    labels_json = (
        json.loads(labels_raw) if isinstance(labels_raw, str) else labels_raw
    )
    sizes = list(row["community_sizes"])
    clustered_total = sum(sizes) or 1
    summary = CommunitySummary(
        community_count=row["community_count"],
        modularity=float(row["modularity"]),
        largest_share=round(
            (sizes[0] / clustered_total) if sizes else 0.0, 6,
        ),
        orphan_pct=float(row["orphan_pct"]),
        community_sizes=sizes,
    )
    communities = _build_community_entries(
        {k: int(v) for k, v in assignments.items()},
        sizes,
        {int(k): v for k, v in labels_json.items()},
    )
    return CommunityResult(
        cache_key=row["cache_key"],
        cached=True,
        cached_at=row["created_at"],
        expires_at=row["expires_at"],
        compute_ms=int(row["compute_ms"]),
        config_used=cfg_dict,
        summary=summary,
        communities=communities,
    )


async def _write_cache_row(
    *,
    cache_key: str,
    user_sub: str,
    sync_ids: list[str],
    config: dict[str, Any],
    summary: CommunitySummary,
    assignments: dict[str, int],
    labels: dict[int, str],
    compute_ms: int,
) -> None:
    """Insert or update the cache row. TTL is computed as ``now() +
    leiden_cache_ttl_hours`` server-side so every write resets both
    ``created_at`` and ``expires_at``. Pass dicts straight through — the
    pool's jsonb codec encodes via ``json.dumps``, so wrapping here would
    double-encode."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO leiden_cache ("
            "  cache_key, user_sub, sync_ids, config, community_count, "
            "  modularity, orphan_pct, community_sizes, assignments, "
            "  labels, compute_ms, expires_at"
            ") VALUES ("
            "  $1, $2, $3::uuid[], $4::jsonb, $5, $6, $7, $8::int[], "
            "  $9::jsonb, $10::jsonb, $11, now() + make_interval(hours => $12)"
            ") ON CONFLICT (cache_key) DO UPDATE SET "
            "  community_count = EXCLUDED.community_count, "
            "  modularity = EXCLUDED.modularity, "
            "  orphan_pct = EXCLUDED.orphan_pct, "
            "  community_sizes = EXCLUDED.community_sizes, "
            "  assignments = EXCLUDED.assignments, "
            "  labels = EXCLUDED.labels, "
            "  compute_ms = EXCLUDED.compute_ms, "
            "  created_at = now(), "
            "  expires_at = now() + make_interval(hours => $12)",
            cache_key,
            user_sub,
            sync_ids,
            config,
            summary.community_count,
            summary.modularity,
            summary.orphan_pct,
            summary.community_sizes,
            {k: int(v) for k, v in assignments.items()},
            {str(k): v for k, v in labels.items()},
            compute_ms,
            settings.leiden_cache_ttl_hours,
        )


def _iso_now() -> str:
    return (
        datetime.now(tz=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _iso_expires() -> str:
    return (
        (
            datetime.now(tz=timezone.utc)
            + timedelta(hours=settings.leiden_cache_ttl_hours)
        )
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


@dataclass
class PaginatedNodes:
    """One page of node_ids belonging to a single community. Cursor is
    an opaque integer offset encoded as string — assignments are an
    unordered map so there's no natural stable cursor beyond lexicographic
    sort of node_ids."""
    items: list[str]
    next_cursor: str | None


async def get_assignments(cache_key: str):
    """Stream (node_id, community_index) pairs for an entire cached run.
    Yields nothing on cache miss. Used by frontend carousel for seeding
    per-community subgraph rendering and by Ask for scope expansion."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchval(
            "SELECT assignments FROM leiden_cache WHERE cache_key = $1",
            cache_key,
        )
    if row is None:
        return
    data = json.loads(row) if isinstance(row, str) else row
    for node, idx in data.items():
        yield node, int(idx)


async def get_community_nodes(
    cache_key: str,
    community_index: int,
    limit: int,
    cursor: str | None,
) -> PaginatedNodes:
    """Paginated list of node_ids belonging to one community, sorted
    lexicographically for stable pagination. Cursor is a simple offset
    encoded as string; callers treat it opaquely. Returns empty page on
    cache miss. Used by Ask scope expansion when the user pins a whole
    community as context."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchval(
            "SELECT assignments FROM leiden_cache WHERE cache_key = $1",
            cache_key,
        )
    if row is None:
        return PaginatedNodes(items=[], next_cursor=None)
    data = json.loads(row) if isinstance(row, str) else row
    nodes = sorted(n for n, idx in data.items() if int(idx) == community_index)
    offset = int(cursor) if cursor else 0
    window = nodes[offset : offset + limit]
    next_cursor = str(offset + limit) if offset + limit < len(nodes) else None
    return PaginatedNodes(items=window, next_cursor=next_cursor)
