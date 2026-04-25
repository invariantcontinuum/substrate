import os
import uuid

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.config import settings
from src.graph import store


def _dsn() -> str:
    url = os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:changeme@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def db_pool():
    pool = await asyncpg.create_pool(
        _dsn(),
        min_size=1,
        max_size=4,
        server_settings={"search_path": "ag_catalog,public"},
        init=lambda c: c.execute("LOAD 'age';"),
    )
    yield pool
    await pool.close()


@pytest_asyncio.fixture(loop_scope="session")
async def db(db_pool):
    """Per-test transaction that rolls back at teardown."""
    async with db_pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        try:
            yield conn
        finally:
            await tx.rollback()


# ---------------------------------------------------------------------------
# Ask-specific fixtures (Phase 7 — ask API + pipeline integration tests)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def app_pool():
    """Ensure ``store._pool`` is connected once per test session. The ask
    router and pipeline helpers all reach into ``store.get_pool()`` rather
    than receiving a pool argument, so tests must drive the same global
    asyncpg pool the running service would."""
    if store._pool is None:
        await store.connect()
    yield


@pytest_asyncio.fixture(loop_scope="session")
async def async_client(app_pool):
    """Async HTTP client bound to the FastAPI app via ASGI, so middleware
    + exception handlers run exactly as they would in production."""
    from src.main import app as _app

    async with AsyncClient(
        transport=ASGITransport(app=_app), base_url="http://t",
    ) as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_two_sync_runs(app_pool):
    """Seed one source, two completed sync_runs, one file_embeddings row
    per sync with a valid zero vector of the configured embedding_dim.
    Returns ``(sync_a, sync_b)`` as uuid strings. Tears down the source
    (cascades to sync_runs + file_embeddings) at teardown."""
    pool = store.get_pool()
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='ask' AND name='scoped'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','ask','scoped','u') RETURNING id::text"
        )
        sid_a = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        sid_b = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        await conn.execute(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1::uuid, $2::uuid, 'a.py', 'a.py', 'file',
                       'file in sync A', $3::vector)""",
            sid_a, src_id, zero_vec,
        )
        await conn.execute(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type,
                    description, embedding)
               VALUES ($1::uuid, $2::uuid, 'b.py', 'b.py', 'file',
                       'file in sync B', $3::vector)""",
            sid_b, src_id, zero_vec,
        )

    yield (sid_a, sid_b)

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_two_cluster_syncs(app_pool):
    """Seed one source, two completed sync_runs, and 8 files across the two
    syncs — 4 per sync — wired into two disjoint K4 cliques (6 edges each)
    bridged by a single cross-sync DEPENDS_ON edge. The resulting graph has
    13 edges, two tight communities, and a high modularity floor (well above
    0.2) so active-set Leiden reliably recovers both clusters regardless of
    random seed.

    Returns ``[sync_a, sync_b]`` as uuid strings. Tears down via source delete
    (cascades to sync_runs + file_embeddings) plus a defensive cypher sweep
    of the :File nodes whose ``source_id`` matches the seeded source.
    """
    pool = store.get_pool()
    dim = settings.embedding_dim
    zero_vec = "[" + ",".join("0" for _ in range(dim)) + "]"

    async with pool.acquire() as conn:
        # Pre-clean any leftover rows from a prior aborted run. The unique
        # (source_type, owner, name) shape lets us idempotently re-seed.
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='leiden' AND name='two_cluster'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','leiden','two_cluster','u') RETURNING id::text"
        )
        sid_a = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        sid_b = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        # 4 files per sync: cluster A (sync_a) and cluster B (sync_b).
        file_ids: dict[str, list[str]] = {"a": [], "b": []}
        for cluster, sid in (("a", sid_a), ("b", sid_b)):
            for i in range(4):
                fe_id = await conn.fetchval(
                    """INSERT INTO file_embeddings
                           (sync_id, source_id, file_path, name, type,
                            description, embedding)
                       VALUES ($1::uuid, $2::uuid, $3, $3, 'file',
                               $4, $5::vector)
                       RETURNING id::text""",
                    sid, src_id,
                    f"{cluster}{i}.py",
                    f"cluster {cluster} file {i}",
                    zero_vec,
                )
                file_ids[cluster].append(fe_id)

        # Build cypher for two K4 cliques + one bridge edge. Each cluster's
        # edges carry its own sync_id; the bridge edge carries sync_a so it
        # appears whenever sync_a is active.
        def _k4_edges(nodes: list[str]) -> list[tuple[str, str]]:
            return [
                (nodes[i], nodes[j])
                for i in range(len(nodes))
                for j in range(i + 1, len(nodes))
            ]

        all_nodes: list[tuple[str, str]] = [
            (fe, sid_a) for fe in file_ids["a"]
        ] + [
            (fe, sid_b) for fe in file_ids["b"]
        ]

        # MERGE all :File nodes (deterministic, idempotent).
        for fe_id, node_sync in all_nodes:
            await conn.execute(
                f"""SELECT * FROM cypher('substrate', $$
                        MERGE (n:File {{
                            file_id: '{fe_id}',
                            sync_id: '{node_sync}',
                            source_id: '{src_id}'
                        }})
                        RETURN 1
                    $$) AS (ok agtype)"""
            )

        # K4 on cluster A (edges tagged sync_a).
        for s_fe, t_fe in _k4_edges(file_ids["a"]):
            await conn.execute(
                f"""SELECT * FROM cypher('substrate', $$
                        MATCH (a:File {{file_id: '{s_fe}'}}),
                              (b:File {{file_id: '{t_fe}'}})
                        MERGE (a)-[r:DEPENDS_ON {{
                            sync_id: '{sid_a}', weight: 1.0
                        }}]->(b)
                        RETURN 1
                    $$) AS (ok agtype)"""
            )
        # K4 on cluster B (edges tagged sync_b).
        for s_fe, t_fe in _k4_edges(file_ids["b"]):
            await conn.execute(
                f"""SELECT * FROM cypher('substrate', $$
                        MATCH (a:File {{file_id: '{s_fe}'}}),
                              (b:File {{file_id: '{t_fe}'}})
                        MERGE (a)-[r:DEPENDS_ON {{
                            sync_id: '{sid_b}', weight: 1.0
                        }}]->(b)
                        RETURN 1
                    $$) AS (ok agtype)"""
            )
        # Single bridge edge between the two cliques (tagged sync_a so it
        # surfaces when sync_a is part of the active set). This keeps
        # modularity high while still producing a connected graph.
        bridge_src, bridge_dst = file_ids["a"][0], file_ids["b"][0]
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MATCH (a:File {{file_id: '{bridge_src}'}}),
                          (b:File {{file_id: '{bridge_dst}'}})
                    MERGE (a)-[r:DEPENDS_ON {{
                        sync_id: '{sid_a}', weight: 1.0
                    }}]->(b)
                    RETURN 1
                $$) AS (ok agtype)"""
        )

    yield [sid_a, sid_b]

    async with pool.acquire() as conn:
        # Sweep the AGE vertices + edges we MERGEd. The source DELETE below
        # removes file_embeddings rows (cascade), but :File nodes live in
        # AGE's own ag_label tables and don't cascade, so clean them up
        # first or future runs accumulate stale nodes.
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MATCH (n:File {{source_id: '{src_id}'}})
                    DETACH DELETE n
                $$) AS (ok agtype)"""
        )
        # Also clean leiden_cache rows written by the tests so repeat runs
        # don't return stale cached results for the same cache_key.
        await conn.execute(
            "DELETE FROM leiden_cache WHERE $1::uuid = ANY(sync_ids) "
            "OR $2::uuid = ANY(sync_ids)",
            sid_a, sid_b,
        )
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


@pytest_asyncio.fixture(loop_scope="session")
async def seed_one_file(app_pool):
    """Seed one source + sync_run + file_embeddings row + a single
    content_chunks row, owned by ``user-files``. Used by the lazy
    full-file loader tests (/api/files/{file_id}/content)."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE user_sub='user-files' "
            "AND source_type='github' AND owner='acme' AND name='demo'"
        )
        source_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ('user-files', 'github', 'acme', 'demo', 'u') "
            "RETURNING id"
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status) "
            "VALUES ($1, 'completed') RETURNING id",
            source_id,
        )
        file_id = await conn.fetchval(
            "INSERT INTO file_embeddings "
            "(source_id, sync_id, file_path, name, type, language, line_count) "
            "VALUES ($1, $2, 'demo.txt', 'demo.txt', 'file', 'plain', 3) "
            "RETURNING id",
            source_id, sync_id,
        )
        await conn.execute(
            "INSERT INTO content_chunks "
            "(file_id, sync_id, chunk_index, content, start_line, end_line, "
            " token_count) "
            "VALUES ($1, $2, 0, 'alpha\nbeta\ngamma', 1, 3, 3)",
            file_id, sync_id,
        )

    yield {
        "user_sub": "user-files",
        "source_id": str(source_id),
        "sync_id": str(sync_id),
        "file_id": str(file_id),
        "path": "demo.txt",
    }

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1", source_id)


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_assistant_turn(async_client, monkeypatch):
    """Stub ``chat_pipeline.stream_turn`` so no LLM calls are made, create
    a fresh thread for ``user-cascade``, POST one user message (returns 202),
    and manually insert a canned assistant message so the cascade-on-delete
    test sees both rows. Returns the thread id.
    """
    from src.graph import chat_pipeline, chat_store

    async def _stub_stream_turn(**kwargs):
        # Insert the assistant message directly so the cascade test sees 2 rows.
        await chat_store.insert_message(
            thread_id=kwargs["thread_id"],
            role="assistant",
            content="stubbed",
            citations=[{"node_id": "n1", "name": "N", "type": "file"}],
            sync_ids=[str(s) for s in (kwargs.get("sync_ids") or [])],
        )

    monkeypatch.setattr(chat_pipeline, "stream_turn", _stub_stream_turn)

    r = await async_client.post(
        "/api/chat/threads", json={"title": "cascade"},
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    dummy_sync = str(uuid.uuid4())
    r = await async_client.post(
        f"/api/chat/threads/{thread_id}/messages",
        json={"content": "hi", "sync_ids": [dummy_sync]},
        headers={"X-User-Sub": "user-cascade"},
    )
    # POST /threads/{id}/messages now returns 202 (streaming accepted).
    assert r.status_code == 202, r.text
    # The stub runs synchronously inside create_task before the response
    # returns, but we yield control to let any pending tasks complete.
    import asyncio
    await asyncio.sleep(0.1)

    yield thread_id

    # Best-effort cleanup if the test did not already delete the thread.
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM chat_threads WHERE id = $1::uuid", thread_id,
        )
