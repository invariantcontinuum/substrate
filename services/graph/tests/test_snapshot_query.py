import pytest
import pytest_asyncio
from src.config import settings
from src.graph import store, snapshot_query

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup():
    if store._pool is None:
        await store.connect()
    yield


async def test_merged_graph_marks_divergent_when_content_differs():
    pool = store._pool
    async with pool.acquire() as conn:
        # Pre-clean any leftover from prior failed runs.
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='o' AND name='merge'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) VALUES ('github_repo','o','merge','u') RETURNING id::text"
        )
        sid_a = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) VALUES ($1::uuid, 'completed', '2026-04-10') RETURNING id::text",
            src_id,
        )
        sid_b = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) VALUES ($1::uuid, 'completed', '2026-04-15') RETURNING id::text",
            src_id,
        )
        # Same path, different content_hash => divergent.
        await conn.execute(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type, content_hash)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source', 'aaaa')""",
            sid_a, src_id,
        )
        await conn.execute(
            """INSERT INTO file_embeddings (sync_id, source_id, file_path, name, type, content_hash)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'source', 'bbbb')""",
            sid_b, src_id,
        )

    snap = await snapshot_query.get_merged_graph([sid_a, sid_b])
    nodes = snap["nodes"]
    assert len(nodes) == 1, f"expected one merged node, got {len(nodes)}"
    n = nodes[0]["data"]
    assert n["divergent"] is True
    assert n["latest_sync_id"] == sid_b
    assert sorted(n["loaded_sync_ids"]) == sorted([sid_a, sid_b])

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


async def test_merged_edges_returns_source_target_pairs(seeded_two_sync_runs):
    """`merged_edges` streams (src_file_id, tgt_file_id) string pairs for the
    active merged graph. Seeds one additional `file_embeddings` row per sync
    plus one DEPENDS_ON edge per sync via direct cypher, then asserts both
    edges surface as non-empty uuid strings."""
    from src.graph.snapshot_query import merged_edges

    sync_a, sync_b = seeded_two_sync_runs
    pool = store._pool
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "SELECT source_id::text FROM sync_runs WHERE id = $1::uuid", sync_a,
        )
        # seeded_two_sync_runs plants one file per sync; add a second file per
        # sync so each sync can host a DEPENDS_ON edge between two files.
        dim = settings.embedding_dim
        zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"
        fe_a1 = await conn.fetchval(
            "SELECT id::text FROM file_embeddings WHERE sync_id=$1::uuid AND file_path='a.py'",
            sync_a,
        )
        fe_a2 = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1::uuid, $2::uuid, 'a2.py', 'a2.py', 'file',
                       'second file in sync A', $3::vector)
               RETURNING id::text""",
            sync_a, src_id, zero_vec,
        )
        fe_b1 = await conn.fetchval(
            "SELECT id::text FROM file_embeddings WHERE sync_id=$1::uuid AND file_path='b.py'",
            sync_b,
        )
        fe_b2 = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1::uuid, $2::uuid, 'b2.py', 'b2.py', 'file',
                       'second file in sync B', $3::vector)
               RETURNING id::text""",
            sync_b, src_id, zero_vec,
        )
        # Seed File nodes + one DEPENDS_ON edge per sync via cypher.
        for sid, fe_src, fe_dst in (
            (sync_a, fe_a1, fe_a2),
            (sync_b, fe_b1, fe_b2),
        ):
            await conn.execute(
                f"""SELECT * FROM cypher('substrate', $$
                        MERGE (a:File {{file_id: '{fe_src}', sync_id: '{sid}', source_id: '{src_id}'}})
                        MERGE (b:File {{file_id: '{fe_dst}', sync_id: '{sid}', source_id: '{src_id}'}})
                        MERGE (a)-[r:DEPENDS_ON {{sync_id: '{sid}', weight: 1.0}}]->(b)
                        RETURN 1
                    $$) AS (ok agtype)"""
            )

    pairs = [(s, t) async for s, t in merged_edges([sync_a, sync_b])]
    # Both syncs write at least one DEPENDS_ON edge; both should surface.
    assert len(pairs) > 0
    for s, t in pairs:
        assert isinstance(s, str) and isinstance(t, str)
        assert s != ""
        assert t != ""
    pair_set = {p for p in pairs}
    assert (fe_a1, fe_a2) in pair_set
    assert (fe_b1, fe_b2) in pair_set
