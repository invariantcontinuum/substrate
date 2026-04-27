"""Resolve chat-thread entries[] into file_ids and AGE neighborhood data."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

import asyncpg
import structlog
from pydantic import BaseModel, ConfigDict, Field

from src.config import settings

logger = structlog.get_logger()


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SourceEntry(_Base):
    type: Literal["source"]
    source_id: UUID


class SnapshotEntry(_Base):
    type: Literal["snapshot"]
    sync_id: UUID


class DirectoryEntry(_Base):
    type: Literal["directory"]
    sync_id: UUID
    prefix: str


class FileEntry(_Base):
    type: Literal["file"]
    file_id: UUID


class CommunityEntry(_Base):
    type: Literal["community"]
    cache_key: str
    community_index: int


class NodeNeighborhoodEntry(_Base):
    type: Literal["node_neighborhood"]
    node_id: UUID
    depth: int = Field(ge=1, le=3)
    edge_types: list[Literal["DEPENDS_ON", "CALLS", "USED_BY"]] = Field(min_length=1)


Entry = (
    SourceEntry | SnapshotEntry | DirectoryEntry
    | FileEntry | CommunityEntry | NodeNeighborhoodEntry
)


@dataclass(frozen=True, slots=True)
class Neighbor:
    seed_id:     UUID
    neighbor_id: UUID
    edge_type:   str
    direction:   Literal["in", "out", "undirected"]


@dataclass(slots=True)
class ResolvedScope:
    file_ids:    list[UUID] = field(default_factory=list)
    node_seeds:  list[UUID] = field(default_factory=list)
    neighbors:   list[Neighbor] = field(default_factory=list)


def _parse_entry(raw: dict) -> Entry:
    cls = {
        "source": SourceEntry,
        "snapshot": SnapshotEntry,
        "directory": DirectoryEntry,
        "file": FileEntry,
        "community": CommunityEntry,
        "node_neighborhood": NodeNeighborhoodEntry,
    }[raw["type"]]
    return cls.model_validate(raw)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

async def _files_for_source_latest(pool: asyncpg.Pool, source_id: UUID) -> list[UUID]:
    rows = await pool.fetch(
        """
        SELECT fe.id
          FROM file_embeddings fe
          JOIN sync_runs sr ON sr.id = fe.sync_id
         WHERE sr.source_id = $1
           AND sr.id = (
                SELECT id FROM sync_runs
                 WHERE source_id = $1
                 ORDER BY created_at DESC
                 LIMIT 1
           )
         ORDER BY fe.file_path
        """,
        source_id,
    )
    return [r["id"] for r in rows]


async def _files_for_sync(pool: asyncpg.Pool, sync_id: UUID) -> list[UUID]:
    rows = await pool.fetch(
        "SELECT id FROM file_embeddings WHERE sync_id = $1 ORDER BY file_path",
        sync_id,
    )
    return [r["id"] for r in rows]


async def _files_for_dir(pool: asyncpg.Pool, sync_id: UUID, prefix: str) -> list[UUID]:
    rows = await pool.fetch(
        """SELECT id FROM file_embeddings
            WHERE sync_id = $1 AND file_path LIKE $2 || '%'
            ORDER BY file_path""",
        sync_id, prefix,
    )
    return [r["id"] for r in rows]


async def _files_for_community(
    pool: asyncpg.Pool, cache_key: str, community_index: int,
) -> list[UUID]:
    row = await pool.fetchrow(
        "SELECT assignments FROM leiden_cache WHERE cache_key = $1",
        cache_key,
    )
    if row is None:
        return []
    raw = row["assignments"]
    assignments: dict[str, int] = raw if isinstance(raw, dict) else json.loads(raw)
    return [
        UUID(file_id_str)
        for file_id_str, idx in assignments.items()
        if idx == community_index
    ]


async def _fetch_edge_neighbors(
    conn,
    file_id: str,
    depth: int = 1,
    edge_types: list[str] | None = None,
) -> list[dict]:
    """Fetch (neighbor_id, edge_type, direction) triples for the node via AGE.

    Uses the inline-quoted ``MATCH (a:File {file_id: '...'})`` pattern
    established in ``snapshot_query.py``. A GIN expression index on
    ``properties`` (migration V1) keeps this lookup fast against the File
    vertex table.

    Falls back to an empty list on any error — AGE may legitimately be
    empty or the ``substrate`` graph may not yet hold edges for this
    node's sync.

    ``depth`` and ``edge_types`` are used by the chat context resolver;
    when called from the summary pipeline via the re-export the defaults
    (depth=1, edge_types=None meaning all types) produce the same
    behaviour as the previous single-argument form.
    """
    cap = settings.chat_node_neighborhood_max_nodes
    edge_filter = "|".join(edge_types) if edge_types else ""
    rel_pattern = f"-[r:{edge_filter}*1..{depth}]-" if edge_filter else f"-[r*1..{depth}]-"

    try:
        async with conn.transaction():
            await conn.execute("SET LOCAL statement_timeout = '10000ms'")
            rows = await conn.fetch(
                f"""
                SELECT * FROM cypher('substrate', $$
                    MATCH (a:File {{file_id: '{file_id}'}}){rel_pattern}(b:File)
                    RETURN b.file_id AS neighbor_file_id,
                           label(r[0])  AS edge_type,
                           CASE WHEN startNode(r[0]).file_id = '{file_id}' THEN 'out'
                                WHEN endNode(r[0]).file_id   = '{file_id}' THEN 'in'
                                ELSE 'undirected' END AS direction
                    LIMIT {cap}
                $$) AS (neighbor_file_id agtype, edge_type agtype, direction agtype)
                """
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("chat_context_resolver_edge_fetch_failed", error=str(exc))
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
            "edge_type": str(etype) or "DEPENDS_ON",
            "direction": str(direction) or "undirected",
        })
    return out


# ---------------------------------------------------------------------------
# Public resolver
# ---------------------------------------------------------------------------

async def resolve_entries(
    entries: list[Entry], pool: asyncpg.Pool, user_sub: str,
) -> ResolvedScope:
    """Turn a list of Entry objects into a ResolvedScope.

    Deduplicates file_ids in insertion order (first occurrence wins).
    ``user_sub`` is accepted for future row-level security checks but is
    not used in the current SQL queries — ownership is encoded in the
    sync/source FK chain.
    """
    out = ResolvedScope()
    seen: set[UUID] = set()

    for e in entries:
        ids: list[UUID] = []

        if isinstance(e, SourceEntry):
            ids = await _files_for_source_latest(pool, e.source_id)

        elif isinstance(e, SnapshotEntry):
            ids = await _files_for_sync(pool, e.sync_id)

        elif isinstance(e, DirectoryEntry):
            ids = await _files_for_dir(pool, e.sync_id, e.prefix)

        elif isinstance(e, FileEntry):
            ids = [e.file_id]

        elif isinstance(e, CommunityEntry):
            ids = await _files_for_community(pool, e.cache_key, e.community_index)

        elif isinstance(e, NodeNeighborhoodEntry):
            out.node_seeds.append(e.node_id)
            async with pool.acquire() as conn:
                raw_neighbors = await _fetch_edge_neighbors(
                    conn, str(e.node_id), depth=e.depth, edge_types=list(e.edge_types),
                )
            ns: list[Neighbor] = []
            for nd in raw_neighbors:
                try:
                    nid = UUID(nd["neighbor_id"])
                except (ValueError, KeyError):
                    continue
                direction = nd.get("direction", "undirected")
                if direction not in ("in", "out", "undirected"):
                    direction = "undirected"
                ns.append(
                    Neighbor(
                        seed_id=e.node_id,
                        neighbor_id=nid,
                        edge_type=nd.get("edge_type", "DEPENDS_ON"),
                        direction=direction,  # type: ignore[arg-type]
                    )
                )
            out.neighbors.extend(ns)
            ids = [e.node_id, *(n.neighbor_id for n in ns)]

        for fid in ids:
            if fid not in seen:
                seen.add(fid)
                out.file_ids.append(fid)

    return out
