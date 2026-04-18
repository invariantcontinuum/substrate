"""Task A3 — `GET /api/graph/nodes/{id}/file` endpoint + reconstruction helper.

Reconstruction must concatenate `content_chunks` in `chunk_index` order with
line-overlap dedup (chunker emits ~64-token overlap between consecutive
chunks, encoded as an N-line overlap). The route must accept BOTH the
minimal-projection synthetic id (`src_<source_uuid>:<file_path>`) and a
direct `file_embeddings.id` UUID.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from src.graph import store
from src.graph.file_reconstruct import reconstruct_chunks
from src.main import app


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _pool():
    if store._pool is None:
        await store.connect()
    yield


# ----------------------------- unit tests (no DB) ----------------------------


def test_reconstruct_chunks_dedups_line_overlap():
    # Chunk A covers lines 1-10, chunk B covers lines 9-18 (2-line overlap).
    chunks = [
        {"chunk_index": 0, "content": "\n".join(f"L{i}" for i in range(1, 11)),  "start_line": 1, "end_line": 10},
        {"chunk_index": 1, "content": "\n".join(f"L{i}" for i in range(9, 19)),  "start_line": 9, "end_line": 18},
    ]
    out = reconstruct_chunks(chunks, cap_bytes=10_000)
    assert out["truncated"] is False
    assert out["content"].split("\n") == [f"L{i}" for i in range(1, 19)]
    assert out["chunk_count"] == 2


def test_reconstruct_chunks_truncates_at_cap():
    big = "x" * 2_000
    chunks = [
        {"chunk_index": i, "content": big, "start_line": 1 + i * 100, "end_line": 100 + i * 100}
        for i in range(10)
    ]
    out = reconstruct_chunks(chunks, cap_bytes=5_000)
    assert out["truncated"] is True
    assert len(out["content"].encode("utf-8")) <= 5_000


# ----------------------------- integration tests -----------------------------


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_file_node_id():
    """Seed a source + completed sync_run + file_embeddings row with 2 overlapping
    content_chunks rows. Yields the minimal-projection synthetic node id
    (`src_<source_id>:<file_path>`). CASCADE cleanup via DELETE FROM sources.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='proj' AND name='a3file'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','proj','a3file','u') RETURNING id::text"
        )
        sid = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        file_path = "src/reassemble.py"
        fe_id = await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, domain,
                    language, line_count, size_bytes, description, status, content_hash,
                    last_commit_sha)
               VALUES ($1::uuid, $2::uuid, $3, 'reassemble.py', 'file', 'core',
                       'python', 18, 180, '', 'healthy', 'h_file', 'abc123')
               RETURNING id::text""",
            sid, src_id, file_path,
        )
        # Two chunks with a 2-line overlap (lines 9..10 appear in both).
        chunk_a_content = "\n".join(f"L{i}" for i in range(1, 11))   # L1..L10
        chunk_b_content = "\n".join(f"L{i}" for i in range(9, 19))   # L9..L18
        await conn.execute(
            """INSERT INTO content_chunks
                   (file_id, sync_id, chunk_index, content, start_line, end_line, token_count)
               VALUES ($1::uuid, $2::uuid, 0, $3, 1, 10, 12)""",
            fe_id, sid, chunk_a_content,
        )
        await conn.execute(
            """INSERT INTO content_chunks
                   (file_id, sync_id, chunk_index, content, start_line, end_line, token_count)
               VALUES ($1::uuid, $2::uuid, 1, $3, 9, 18, 12)""",
            fe_id, sid, chunk_b_content,
        )

    # Yield the synthetic AGE id shape that minimal projection returns.
    synthetic_id = f"src_{src_id}:{file_path}"
    yield synthetic_id

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_empty_file_node_id():
    """Seed a file_embeddings row with ZERO content_chunks rows (empty file case)."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='proj' AND name='a3empty'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','proj','a3empty','u') RETURNING id::text"
        )
        sid = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        file_path = "src/empty.py"
        await conn.fetchval(
            """INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, domain,
                    language, line_count, size_bytes, description, status, content_hash)
               VALUES ($1::uuid, $2::uuid, $3, 'empty.py', 'file', 'core',
                       'python', 0, 0, '', 'healthy', 'h_empty')
               RETURNING id::text""",
            sid, src_id, file_path,
        )

    synthetic_id = f"src_{src_id}:{file_path}"
    yield synthetic_id

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


@pytest.mark.asyncio(loop_scope="session")
async def test_file_endpoint_returns_reconstructed_file(seeded_file_node_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph/nodes/{seeded_file_node_id}/file")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["file_path"]
    assert body["line_count"] > 0
    assert isinstance(body["content"], str)
    assert body["chunk_count"] >= 1
    assert "truncated" in body
    # Deduped reconstruction of L1..L18 (no repeated L9/L10).
    assert body["content"].split("\n") == [f"L{i}" for i in range(1, 19)]
    assert body["chunk_count"] == 2
    assert body["truncated"] is False


@pytest.mark.asyncio(loop_scope="session")
async def test_file_endpoint_404_on_unknown_id():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/graph/nodes/00000000-0000-0000-0000-000000000000/file")
    assert r.status_code == 404
    body = r.json()
    # Canonical SubstrateError envelope (NotFoundError → code=NOT_FOUND).
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"] == "node_not_found"
    assert "request_id" in body


@pytest.mark.asyncio(loop_scope="session")
async def test_file_endpoint_200_empty_on_zero_chunks(seeded_empty_file_node_id):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get(f"/api/graph/nodes/{seeded_empty_file_node_id}/file")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["content"] == ""
    assert body["chunk_count"] == 0
    assert body["truncated"] is False
