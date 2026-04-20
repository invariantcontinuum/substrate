"""Task A5 — enriched summary with top-K edge-neighbor context.

Validates `src.graph.enriched_summary` primitives (cosine ranking, prompt
assembly with budget caps) and the summary HTTP endpoint's end-to-end
wiring with a mocked `_post_llm`. Real DENSE_LLM_URL is never reached.

Integration tests seed a real file_embeddings row (with a 896-dim
embedding vector) + content_chunks so the enriched pipeline has
something to reconstruct. The AGE graph is intentionally left empty for
these tests — the enriched module's edge-fetch must gracefully fall back
to zero neighbors rather than 500.
"""
import pytest
import pytest_asyncio
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport, HTTPStatusError, Request, Response
from src.main import app
from src.graph import store
from src.graph.enriched_summary import (
    rank_neighbors_by_similarity,
    assemble_prompt,
    build_system_prompt,  # noqa: F401 — imported so callers can assert the symbol exists
)


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _pool():
    if store._pool is None:
        await store.connect()
    yield


@pytest_asyncio.fixture(loop_scope="session")
async def graph_pool():
    """Expose the shared asyncpg pool for direct DB assertions in tests."""
    return store.get_pool()


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_file_node_id():
    """Seed a source + completed sync_run + file_embeddings row (with a
    1024-dim embedding) + a single content_chunks row. Yields the raw
    file_embeddings.id UUID (the summary route accepts both synthetic
    and UUID shapes; UUID is simpler for these tests)."""
    pool = store.get_pool()
    emb_literal = "[" + ",".join(["0.0"] * store.settings.embedding_dim) + "]"
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' AND owner='proj' AND name='a5summary'"
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','proj','a5summary','u') RETURNING id::text"
        )
        sid = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1::uuid,'completed', now()) RETURNING id::text",
            src_id,
        )
        file_path = "src/summary_target.py"
        # ~60 KB of file content: large enough that the scale=1.0 prompt fits
        # without truncation (file_cap ≈ 88 KB at default settings) but
        # scale=0.5 truncates to ≈ 44 KB. This is what lets
        # `test_summary_retries_with_smaller_prompt_on_context_error`
        # actually observe a shorter retry prompt. Keeping seed lines
        # self-describing (one token `L<i>` plus 100 chars of padding)
        # makes debug output readable without resorting to `"x" * N` blobs.
        line_count = 500
        chunk_content = "\n".join(f"L{i:04d} {'x' * 100}" for i in range(1, line_count + 1))
        fe_id = await conn.fetchval(
            f"""INSERT INTO file_embeddings
                   (sync_id, source_id, file_path, name, type, domain,
                    language, line_count, size_bytes, description, status,
                    content_hash, embedding)
               VALUES ($1::uuid, $2::uuid, $3, 'summary_target.py', 'file',
                       'core', 'python', {line_count}, {len(chunk_content)}, '', 'healthy',
                       'h_sum', '{emb_literal}'::vector)
               RETURNING id::text""",
            sid, src_id, file_path,
        )
        await conn.execute(
            """INSERT INTO content_chunks
                   (file_id, sync_id, chunk_index, content,
                    start_line, end_line, token_count)
               VALUES ($1::uuid, $2::uuid, 0, $3, 1, $4, $5)""",
            fe_id, sid, chunk_content, line_count, len(chunk_content) // 4,
        )

    yield fe_id

    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


# ----------------------------- unit tests (no DB) ----------------------------


def test_rank_neighbors_top_k_by_cosine():
    source = [1.0, 0.0, 0.0]
    neighbors = [
        {"id": "close",  "embedding": [0.95, 0.05, 0.0]},
        {"id": "medium", "embedding": [0.5, 0.5, 0.0]},
        {"id": "far",    "embedding": [0.0, 1.0, 0.0]},
    ]
    ranked = rank_neighbors_by_similarity(source, neighbors, k=2)
    assert [n["id"] for n in ranked] == ["close", "medium"]


def test_rank_skips_neighbors_without_embedding():
    source = [1.0, 0.0]
    neighbors = [
        {"id": "a", "embedding": [0.9, 0.1]},
        {"id": "b", "embedding": None},
        {"id": "c", "embedding": [0.2, 0.8]},
    ]
    ranked = rank_neighbors_by_similarity(source, neighbors, k=5)
    assert [n["id"] for n in ranked] == ["a", "c"]


def test_assemble_prompt_respects_budget():
    out = assemble_prompt(
        file_path="src/auth/login.ts",
        language="typescript",
        line_count=10,
        file_content="line\n" * 100,
        neighbors=[
            {"edge_type": "imports", "direction": "out",
             "name": "jwt.ts", "type": "utility",
             "description": "desc", "first_lines": "code\n" * 5},
        ],
        total_budget_chars=200,
        neighbor_budget_chars=80,
        file_ratio=0.5,
        neighbor_ratio=0.4,
    )
    assert len(out) <= 300   # small wrapper slack allowed
    assert "src/auth/login.ts" in out
    assert "jwt.ts" in out


# ----------------------------- integration tests -----------------------------


@pytest.mark.asyncio(loop_scope="session")
async def test_summary_endpoint_calls_llm_with_enriched_prompt(seeded_file_node_id):
    fake_response = {"choices": [{"message": {"content": "A short summary."}}]}
    with patch(
        "src.graph.enriched_summary._post_llm",
        new=AsyncMock(return_value=fake_response),
    ) as mock_llm:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.get(f"/api/graph/nodes/{seeded_file_node_id}/summary?force=true")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["summary"] == "A short summary."
        assert body["source"] == "llm_enriched"
        call_kwargs = mock_llm.call_args.kwargs
        messages = call_kwargs["payload"]["messages"]
        user_content = messages[-1]["content"]
        assert "# File" in user_content


@pytest.mark.asyncio(loop_scope="session")
async def test_summary_caches_in_description(seeded_file_node_id, graph_pool):
    fake_response = {"choices": [{"message": {"content": "Cached summary."}}]}
    with patch(
        "src.graph.enriched_summary._post_llm",
        new=AsyncMock(return_value=fake_response),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            await c.get(f"/api/graph/nodes/{seeded_file_node_id}/summary?force=true")
    async with graph_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT description, description_generated_at FROM file_embeddings WHERE id=$1::uuid",
            seeded_file_node_id,
        )
    assert row["description"] == "Cached summary."
    assert row["description_generated_at"] is not None


@pytest.mark.asyncio(loop_scope="session")
async def test_summary_retries_with_smaller_prompt_on_context_error(seeded_file_node_id):
    request = Request("POST", "http://dense/v1/chat/completions")
    response = Response(
        400,
        request=request,
        text="request (7212 tokens) exceeds the available context size (4096 tokens), try increasing it",
    )
    prompts: list[str] = []

    async def fake_post_llm(*, url, payload):
        prompts.append(payload["messages"][-1]["content"])
        if len(prompts) == 1:
            raise HTTPStatusError("context overflow", request=request, response=response)
        return {"choices": [{"message": {"content": "Retried summary."}}]}

    with patch(
        "src.graph.enriched_summary._post_llm",
        new=AsyncMock(side_effect=fake_post_llm),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            r = await c.get(f"/api/graph/nodes/{seeded_file_node_id}/summary?force=true")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"] == "Retried summary."
    assert body["source"] == "llm_enriched"
    assert len(prompts) == 2
    assert len(prompts[1]) < len(prompts[0])
