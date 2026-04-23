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


@pytest_asyncio.fixture(scope="session")
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


@pytest_asyncio.fixture
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
async def seeded_assistant_turn(async_client, monkeypatch):
    """Stub ``ask_pipeline.run_turn`` with a canned response, create a
    fresh thread for ``user-a``, POST one user message, and return the
    thread id. Used by the cascade-on-delete test.

    The stub keeps the DB boundary real (thread + both messages land in
    Postgres) while avoiding any dense-LLM or embedding HTTP calls.
    """
    from src.graph import ask_pipeline

    async def _stub(*args, **kwargs):
        return {
            "content": "stubbed",
            "citations": [{"node_id": "n1", "name": "N", "type": "file"}],
        }

    monkeypatch.setattr(ask_pipeline, "run_turn", _stub)

    r = await async_client.post(
        "/api/ask/threads", json={"title": "cascade"},
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    dummy_sync = str(uuid.uuid4())
    r = await async_client.post(
        f"/api/ask/threads/{thread_id}/messages",
        json={"content": "hi", "sync_ids": [dummy_sync]},
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 200, r.text

    yield thread_id

    # Best-effort cleanup if the test did not already delete the thread.
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM ask_threads WHERE id = $1::uuid", thread_id,
        )
