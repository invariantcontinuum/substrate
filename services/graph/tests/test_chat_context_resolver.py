"""Tests for chat_context_resolver.resolve_entries.

Each test seeds the minimum required rows, calls resolve_entries, and asserts
on the returned ResolvedScope. Cleanup uses teardown within the helpers via
source DELETE (which cascades to sync_runs -> file_embeddings) and explicit
AGE DETACH DELETE for any :File nodes created.
"""
from __future__ import annotations

import json
from uuid import UUID, uuid4

import pytest

from src.graph import store
from src.graph.chat_context_resolver import (
    CommunityEntry,
    DirectoryEntry,
    FileEntry,
    NodeNeighborhoodEntry,
    SnapshotEntry,
    SourceEntry,
    resolve_entries,
)
from src.config import settings

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ---------------------------------------------------------------------------
# Seed helpers (local to this file — must NOT be added to conftest.py)
# ---------------------------------------------------------------------------

async def _seed_file(pool, path: str) -> UUID:
    """Insert a source + sync_run + one file_embeddings row. Returns file id.

    The source is keyed on (source_type='github_repo', owner='resolver_test',
    name=path) so multiple calls with different paths don't collide.
    Tears down by deleting the source (cascade).
    """
    safe_name = path.replace("/", "_").replace(".", "_")
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='resolver_test' AND name=$1",
            safe_name,
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','resolver_test',$1,'u') RETURNING id",
            safe_name,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1,'completed',now()) RETURNING id",
            src_id,
        )
        file_id = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1, $2, $3, $3, 'file', 'seeded', $4::vector)
               RETURNING id""",
            sync_id, src_id, path, zero_vec,
        )
    return file_id


async def _seed_sync(pool, paths: list[str]) -> tuple[UUID, list[UUID]]:
    """Insert one source + one sync_run + one file_embeddings row per path.

    Returns (sync_id, [file_id, ...]).
    """
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"
    unique_name = f"sync_{'_'.join(p.replace('/','_').replace('.','_') for p in paths[:2])}"

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='resolver_test_sync' AND name=$1",
            unique_name,
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','resolver_test_sync',$1,'u') RETURNING id",
            unique_name,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1,'completed',now()) RETURNING id",
            src_id,
        )
        file_ids = []
        for path in paths:
            fid = await conn.fetchval(
                """INSERT INTO file_embeddings
                       (sync_id, source_id, file_path, name, type,
                        description, embedding)
                   VALUES ($1, $2, $3, $3, 'file', 'seeded', $4::vector)
                   RETURNING id""",
                sync_id, src_id, path, zero_vec,
            )
            file_ids.append(fid)

    return sync_id, file_ids


async def _seed_age_pair_with_edge(
    pool, edge_type: str,
) -> tuple[UUID, UUID]:
    """Insert two file_embeddings rows and an AGE edge between their :File nodes.

    Returns (source_file_id, neighbor_file_id).
    """
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"
    label = f"age_{edge_type.lower()}"

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='resolver_test_age' AND name=$1",
            label,
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','resolver_test_age',$1,'u') RETURNING id",
            label,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1,'completed',now()) RETURNING id",
            src_id,
        )
        file_id_a = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1, $2, 'a.py', 'a.py', 'file', 'src', $3::vector)
               RETURNING id""",
            sync_id, src_id, zero_vec,
        )
        file_id_b = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1, $2, 'b.py', 'b.py', 'file', 'nb', $3::vector)
               RETURNING id""",
            sync_id, src_id, zero_vec,
        )
        # Create :File nodes and edge in AGE.
        str_a = str(file_id_a)
        str_b = str(file_id_b)
        str_s = str(src_id)
        str_sy = str(sync_id)
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MERGE (n:File {{
                        file_id: '{str_a}', sync_id: '{str_sy}',
                        source_id: '{str_s}'
                    }}) RETURN 1
                $$) AS (ok agtype)"""
        )
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MERGE (n:File {{
                        file_id: '{str_b}', sync_id: '{str_sy}',
                        source_id: '{str_s}'
                    }}) RETURN 1
                $$) AS (ok agtype)"""
        )
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MATCH (a:File {{file_id: '{str_a}'}}),
                          (b:File {{file_id: '{str_b}'}})
                    MERGE (a)-[r:{edge_type} {{sync_id: '{str_sy}', weight: 1.0}}]->(b)
                    RETURN 1
                $$) AS (ok agtype)"""
        )

    return file_id_a, file_id_b


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_resolve_file_entry(app_pool):
    pool = store.get_pool()
    file_id = await _seed_file(pool, path="resolver/a.py")
    out = await resolve_entries(
        [FileEntry(type="file", file_id=file_id)], pool, user_sub="u-1",
    )
    assert out.file_ids == [file_id]


async def test_resolve_directory_entry(app_pool):
    pool = store.get_pool()
    sync_id, files = await _seed_sync(pool, paths=[
        "src/a.py", "src/b.py", "tests/c.py",
    ])
    entry = DirectoryEntry(type="directory", sync_id=sync_id, prefix="src/")
    out = await resolve_entries([entry], pool, user_sub="u-1")
    assert len(out.file_ids) == 2  # src/a.py, src/b.py


async def test_resolve_snapshot_entry(app_pool):
    pool = store.get_pool()
    sync_id, _ = await _seed_sync(pool, paths=["a.py", "b.py", "c.py"])
    out = await resolve_entries(
        [SnapshotEntry(type="snapshot", sync_id=sync_id)], pool, user_sub="u-1",
    )
    assert len(out.file_ids) == 3


async def test_resolve_dedup_preserves_first_position(app_pool):
    pool = store.get_pool()
    fid = await _seed_file(pool, path="resolver/dup.py")
    entries = [
        FileEntry(type="file", file_id=fid),
        FileEntry(type="file", file_id=fid),
    ]
    out = await resolve_entries(entries, pool, user_sub="u-1")
    assert out.file_ids == [fid]


async def test_resolve_node_neighborhood_emits_seeds_and_edges(app_pool):
    pool = store.get_pool()
    file_id, neighbor_id = await _seed_age_pair_with_edge(
        pool, edge_type="DEPENDS_ON",
    )
    entry = NodeNeighborhoodEntry(
        type="node_neighborhood", node_id=file_id,
        depth=1, edge_types=["DEPENDS_ON"],
    )
    out = await resolve_entries([entry], pool, user_sub="u-1")
    assert file_id in out.node_seeds
    assert neighbor_id in [n.neighbor_id for n in out.neighbors]


async def test_resolve_source_entry(app_pool):
    """SourceEntry resolves files from the most-recent sync for a source."""
    pool = store.get_pool()
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='resolver_test_src' AND name='latest'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','resolver_test_src','latest','u') RETURNING id"
        )
        # older sync
        sid_old = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, created_at, completed_at) "
            "VALUES ($1,'completed', now()-interval '1 day', now()-interval '1 day')"
            " RETURNING id",
            src_id,
        )
        await conn.execute(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, description, embedding)
               VALUES ($1, $2, 'old.py', 'old.py', 'file', 'old', $3::vector)""",
            sid_old, src_id, zero_vec,
        )
        # newer sync with 2 files
        sid_new = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, created_at, completed_at) "
            "VALUES ($1,'completed', now(), now()) RETURNING id",
            src_id,
        )
        for p in ("new1.py", "new2.py"):
            await conn.execute(
                """INSERT INTO file_embeddings
                       (sync_id, source_id, file_path, name, type, description, embedding)
                   VALUES ($1, $2, $3, $3, 'file', 'new', $4::vector)""",
                sid_new, src_id, p, zero_vec,
            )

    out = await resolve_entries(
        [SourceEntry(type="source", source_id=src_id)], pool, user_sub="u-1",
    )
    assert len(out.file_ids) == 2, f"Expected 2 files from latest sync, got {len(out.file_ids)}"


async def _seed_leiden(pool, assignments: dict[str, int]) -> str:
    """Insert a leiden_cache row with the given assignments. Returns cache_key."""
    cache_key = f"test-leiden-{uuid4().hex[:12]}"
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO leiden_cache ("
            "  cache_key, user_sub, sync_ids, config, community_count, "
            "  modularity, orphan_pct, community_sizes, assignments, labels, "
            "  compute_ms, expires_at"
            ") VALUES ("
            "  $1, 'u-1', ARRAY[]::uuid[], '{}'::jsonb, 0, 0, 0, "
            "  ARRAY[]::int[], $2::jsonb, '{}'::jsonb, 0, "
            "  now() + interval '1 day'"
            ")",
            cache_key,
            json.dumps(assignments),
        )
    return cache_key


async def test_resolve_community_entry(app_pool):
    pool = store.get_pool()
    fid_a = await _seed_file(pool, path="a.py")
    fid_b = await _seed_file(pool, path="b.py")
    fid_c = await _seed_file(pool, path="c.py")
    cache_key = await _seed_leiden(pool, assignments={
        str(fid_a): 1, str(fid_b): 1, str(fid_c): 2,
    })
    out = await resolve_entries(
        [CommunityEntry(type="community", cache_key=cache_key, community_index=1)],
        pool, user_sub="u-1",
    )
    assert set(out.file_ids) == {fid_a, fid_b}
