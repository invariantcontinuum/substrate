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
from src.graph.file_reconstruct import reconstruct_chunks, FileTooLargeForReconstruct
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
    assert out["content"].split("\n") == [f"L{i}" for i in range(1, 19)]
    assert out["chunk_count"] == 2


def test_reconstruct_chunks_raises_at_cap():
    big = "x" * 2_000
    chunks = [
        {"chunk_index": i, "content": big, "start_line": 1 + i * 100, "end_line": 100 + i * 100}
        for i in range(10)
    ]
    with pytest.raises(FileTooLargeForReconstruct) as exc_info:
        reconstruct_chunks(chunks, cap_bytes=5_000)
    assert exc_info.value.cap_bytes == 5_000


def test_reconstruct_chunks_preserves_inter_chunk_gaps():
    # Real-world AST-chunker pattern: named top-level constructs only, so
    # blank separator lines between methods live in no chunk. Reconstructor
    # must keep line numbers aligned rather than silently concatenating.
    chunks = [
        {"chunk_index": 0, "content": "L1\nL2\nL3",   "start_line": 1, "end_line": 3},
        # Gap at lines 4 and 5 — no chunk covers them.
        {"chunk_index": 1, "content": "L6\nL7",       "start_line": 6, "end_line": 7},
    ]
    out = reconstruct_chunks(chunks, cap_bytes=10_000)
    assert out["content"].split("\n") == ["L1", "L2", "L3", "", "", "L6", "L7"]


def test_reconstruct_chunks_pads_tail_to_total_lines():
    # Last chunk ends at 409 but the file actually has 410 lines — the
    # trailing blank sits past the last named AST construct. Passing
    # total_lines lets the reconstructor rebuild the correct length.
    chunks = [
        {"chunk_index": 0, "content": "\n".join(f"L{i}" for i in range(1, 410)),
         "start_line": 1, "end_line": 409},
    ]
    out = reconstruct_chunks(chunks, cap_bytes=1_000_000, total_lines=410)
    assert len(out["content"].split("\n")) == 410
    assert out["content"].split("\n")[-1] == ""


def test_reconstruct_chunks_clamps_to_total_lines_when_chunk_overshoots():
    # Some chunker paths store content with one more line than their
    # declared end_line range (AST end_point includes a trailing
    # delimiter). The authoritative file_embeddings.line_count must
    # still be respected — output never exceeds total_lines.
    chunks = [
        {"chunk_index": 0, "content": "L1\nL2\nL3\nL4", "start_line": 1, "end_line": 3},  # content has 4 lines, declared 3
    ]
    out = reconstruct_chunks(chunks, cap_bytes=10_000, total_lines=3)
    assert len(out["content"].split("\n")) == 3


def test_reconstruct_chunks_ignores_trailing_newline_artefact():
    # Chunk content ending with "\n" must not synthesize an extra blank
    # line at its position — that would shift every following chunk.
    chunks = [
        {"chunk_index": 0, "content": "L1\nL2\n",     "start_line": 1, "end_line": 2},
        {"chunk_index": 1, "content": "L3\nL4",       "start_line": 3, "end_line": 4},
    ]
    out = reconstruct_chunks(chunks, cap_bytes=10_000)
    assert out["content"].split("\n") == ["L1", "L2", "L3", "L4"]


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
