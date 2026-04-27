import pytest
from uuid import uuid4

from src.graph.file_full_content import load_full, IncompleteReconstruction

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_load_full_round_trip(app_pool):
    from src.graph import store
    pool = store.get_pool()
    sync_id, file_id = await _seed_file(pool, line_count=3)
    await pool.execute(
        "INSERT INTO content_chunks "
        "(file_id, sync_id, chunk_index, content, start_line, end_line, token_count) "
        "VALUES ($1, $2, 0, $3, 1, 3, 3)",
        file_id, sync_id, "alpha\nbeta\ngamma",
    )
    text = await load_full(pool, file_id)
    assert text == "alpha\nbeta\ngamma"


async def test_load_full_joins_multiple_chunks_in_order(app_pool):
    from src.graph import store
    pool = store.get_pool()
    sync_id, file_id = await _seed_file(pool, line_count=4)
    await pool.execute(
        "INSERT INTO content_chunks "
        "(file_id, sync_id, chunk_index, content, start_line, end_line, token_count) "
        "VALUES ($1, $2, 0, $3, 1, 2, 2), ($1, $2, 1, $4, 3, 4, 2)",
        file_id, sync_id, "one\ntwo", "three\nfour",
    )
    text = await load_full(pool, file_id)
    assert text == "one\ntwo\nthree\nfour"


async def test_load_full_raises_on_short_coverage(app_pool):
    from src.graph import store
    pool = store.get_pool()
    sync_id, file_id = await _seed_file(pool, line_count=10)
    await pool.execute(
        "INSERT INTO content_chunks "
        "(file_id, sync_id, chunk_index, content, start_line, end_line, token_count) "
        "VALUES ($1, $2, 0, $3, 1, 3, 3)",
        file_id, sync_id, "one\ntwo\nthree",
    )
    with pytest.raises(IncompleteReconstruction) as exc_info:
        await load_full(pool, file_id)
    assert exc_info.value.covered_lines == 3
    assert exc_info.value.total_lines == 10


# ---------------------------------------------------------------------------
# Local helper. Do NOT add to conftest.
# ---------------------------------------------------------------------------

async def _seed_file(pool, *, line_count: int):
    """Seed minimal sources + sync_runs + file_embeddings rows.

    Returns (sync_id, file_id) as UUID objects. Uses a unique owner/name
    per call so parallel tests never collide. Tears down via source DELETE
    which cascades to sync_runs -> file_embeddings -> content_chunks.
    """
    unique = uuid4().hex[:12]
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo', 'ffc_test', $1, 'u') RETURNING id",
            unique,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1, 'completed', now()) RETURNING id",
            src_id,
        )
        file_id = await conn.fetchval(
            "INSERT INTO file_embeddings "
            "(source_id, sync_id, file_path, name, type, line_count) "
            "VALUES ($1, $2, 'a.py', 'a.py', 'file', $3) RETURNING id",
            src_id, sync_id, line_count,
        )
    return sync_id, file_id
