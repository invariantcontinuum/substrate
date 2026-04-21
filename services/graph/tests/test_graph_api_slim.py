"""Integration tests for slim /api/graph and node-detail endpoint.

T21 — verifies the minimal projection contract (T12) and the node-detail
endpoint cache headers (T13). Uses the same testcontainers + AGE fixture
pattern as `test_graph_projection.py`: a session-scoped `_pool` bootstrap
and a per-test `seeded_sync_id` fixture that inserts one source + one
sync_run + two file_embeddings + one AGE edge.
"""
import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.graph import store
from src.main import app

pytestmark = pytest.mark.asyncio(loop_scope="session")


ALLOWED_NODE_KEYS = {"id", "type", "name", "layer", "source_id"}
ALLOWED_EDGE_KEYS = {"id", "source", "target", "type"}


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _pool():
    if store._pool is None:
        await store.connect()
    yield


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_sync():
    """Seed one source + one completed sync_run + two file_embeddings + one
    AGE edge. Yields a tuple `(sync_id, source_id, file_path_a)` so detail
    tests can reconstruct the synthetic `src_<source_id>:<file_path>` id.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='proj' AND name='slim'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','proj','slim','u') RETURNING id::text"
        )
        sid = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        fe_a = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, domain,
                    language, line_count, description, status, content_hash)
               VALUES ($1::uuid, $2::uuid, 'src/a.py', 'a.py', 'file', 'core',
                       'python', 42, 'module a', 'healthy', 'h_a')
               RETURNING id::text""",
            sid, src_id,
        )
        fe_b = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, domain,
                    language, line_count, description, status, content_hash)
               VALUES ($1::uuid, $2::uuid, 'src/b.py', 'b.py', 'file', 'core',
                       'python', 17, 'module b', 'healthy', 'h_b')
               RETURNING id::text""",
            sid, src_id,
        )
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MERGE (a:File {{file_id: '{fe_a}', sync_id: '{sid}', source_id: '{src_id}'}})
                    MERGE (b:File {{file_id: '{fe_b}', sync_id: '{sid}', source_id: '{src_id}'}})
                    MERGE (a)-[r:DEPENDS_ON {{sync_id: '{sid}', weight: 1.0}}]->(b)
                    RETURN 1
                $$) AS (ok agtype)"""
        )

    yield {"sync_id": sid, "source_id": src_id, "file_path": "src/a.py"}

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


async def test_slim_projection_is_default(seeded_sync):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/graph", params={"sync_ids": seeded_sync["sync_id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta"]["projection"] == "minimal"

    assert body["nodes"], "seeded graph should return >=1 node"
    for node in body["nodes"]:
        data = node.get("data", node)  # tolerate both wrapped + unwrapped shapes
        extra = set(data.keys()) - ALLOWED_NODE_KEYS
        assert not extra, f"slim leak: {extra}"

    assert body["edges"], "seeded graph should return >=1 edge"
    for edge in body["edges"]:
        data = edge.get("data", edge)
        extra = set(data.keys()) - ALLOWED_EDGE_KEYS
        assert not extra, f"slim edge leak: {extra}"


async def test_node_detail_returns_full_properties(seeded_sync):
    node_id = f"src_{seeded_sync['source_id']}:{seeded_sync['file_path']}"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph/nodes/{node_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    # Minimum fields: id, type, name (or a "node" sub-object carrying them).
    inner = body.get("node", body)
    assert {"id", "type", "name"}.issubset(inner.keys()), (
        f"missing core fields: {sorted(inner.keys())}"
    )
    # Cache header is set (T13).
    cache_control = r.headers.get("cache-control", "").lower()
    assert "private" in cache_control
    assert "max-age=30" in cache_control


async def test_node_detail_404():
    # Well-formed synthetic id that points at a non-existent source UUID:
    # the route's 'node not found' branch raises NotFoundError => HTTP 404.
    missing_id = f"src_{uuid.uuid4()}:src/nope.py"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph/nodes/{missing_id}")
    assert r.status_code == 404, r.text
