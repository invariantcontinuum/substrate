"""`projection` query param on GET /api/graph.

The default projection is now `minimal`: flat dicts with exactly the slim
contract the graph-ui renderer's first paint consumes
(`{id, type, name, layer, source_id}` nodes, `{id, source, target, type}`
edges). The `full` projection (explicit opt-in) wraps nodes/edges in the
legacy Cytoscape `{"data": {...}}` shape with rich fields.
"""
import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport
from src.graph import store
from src.main import app

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _pool():
    if store._pool is None:
        await store.connect()
    yield


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_sync_id():
    """Seed a tiny fixture: one source, one completed sync_run, two file_embeddings
    (one with a sync_issues error so `violations` > 0), and one AGE edge between them.
    Returns the sync_id as a string. Cleans up after the test.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='proj' AND name='minimal'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) VALUES ('github_repo','proj','minimal','u') RETURNING id::text"
        )
        sid = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) VALUES ($1::uuid,'completed', now()) RETURNING id::text",
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
        # One error issue pointing at fe_a => violations==1 for a, 0 for b
        await conn.execute(
            """INSERT INTO sync_issues (sync_id, level, phase, code, message, context)
               VALUES ($1::uuid, 'error', 'parse', 'E_SYNTAX', 'oops',
                       jsonb_build_object('file_id', $2::text))""",
            sid, fe_a,
        )
        # One AGE edge fe_a -> fe_b with sync_id
        await conn.execute(
            f"""SELECT * FROM cypher('substrate', $$
                    MERGE (a:File {{file_id: '{fe_a}', sync_id: '{sid}', source_id: '{src_id}'}})
                    MERGE (b:File {{file_id: '{fe_b}', sync_id: '{sid}', source_id: '{src_id}'}})
                    MERGE (a)-[r:DEPENDS_ON {{sync_id: '{sid}', weight: 1.0}}]->(b)
                    RETURN 1
                $$) AS (ok agtype)"""
        )

    yield sid

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


async def test_default_projection_is_minimal(seeded_sync_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph?sync_ids={seeded_sync_id}")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["meta"]["projection"] == "minimal"

    assert len(payload["nodes"]) >= 2
    for node in payload["nodes"]:
        assert set(node.keys()) == {"id", "type", "name", "layer", "source_id"}, (
            f"slim node keys: {sorted(node.keys())}"
        )

    assert len(payload["edges"]) >= 1
    for edge in payload["edges"]:
        assert set(edge.keys()) == {"id", "source", "target", "type"}, (
            f"slim edge keys: {sorted(edge.keys())}"
        )


async def test_full_projection_returns_rich_fields(seeded_sync_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph?sync_ids={seeded_sync_id}&projection=full")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "nodes" in payload and len(payload["nodes"]) > 0
    # Full projection preserves the existing Cytoscape {"data": {...}} wrapper
    # with rich fields (source_id, file_path, divergent, …).
    node = payload["nodes"][0]
    assert "data" in node
    data = node["data"]
    for key in ("id", "name", "type", "domain", "source_id",
                "file_path", "loaded_sync_ids", "latest_sync_id", "divergent"):
        assert key in data, f"full projection missing {key!r}: got {sorted(data.keys())}"
    assert payload["meta"]["projection"] == "full"


async def test_minimal_projection_explicit_matches_default(seeded_sync_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph?sync_ids={seeded_sync_id}&projection=minimal")
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["meta"]["projection"] == "minimal"

    # `layer` aliases the underlying `domain` column (seeded as 'core').
    assert any(n["layer"] == "core" for n in payload["nodes"])
    # `source_id` is the parent source UUID string (non-empty for seeded rows).
    assert all(isinstance(n["source_id"], str) and n["source_id"] for n in payload["nodes"])


async def test_unknown_projection_returns_400():
    # Valid UUID so shape validation of sync_ids isn't the thing rejected.
    fake_sync = str(uuid.uuid4())
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph?sync_ids={fake_sync}&projection=superfluous")
    assert r.status_code == 400
    body = r.json()
    # Canonical SubstrateError envelope (ValidationError → code=VALIDATION).
    assert body["error"]["code"] == "VALIDATION"
    assert body["error"]["message"] == "invalid_projection"
    assert "request_id" in body
