"""Tests for _format_full_files_section — full content delivery into the prompt."""
import pytest
from uuid import UUID, uuid4

pytestmark = pytest.mark.asyncio(loop_scope="session")

from src.graph import store
from src.graph.chat_pipeline import _format_full_files_section


async def test_full_files_section_includes_all_lines(app_pool):
    pool = store.get_pool()
    file_id = await _seed_file_with_content(
        pool,
        file_path="src/a.py",
        language="python",
        content="line1\nline2\nline3",
        line_count=3,
    )
    out = await _format_full_files_section(pool, [file_id])

    assert "line1" in out
    assert "line2" in out
    assert "line3" in out
    assert f"[ref:{file_id}]" in out
    assert "```python" in out


async def test_full_files_section_empty_for_no_ids(app_pool):
    pool = store.get_pool()
    out = await _format_full_files_section(pool, [])
    assert out == ""


async def test_full_files_section_line_numbers(app_pool):
    pool = store.get_pool()
    file_id = await _seed_file_with_content(
        pool,
        file_path="src/b.py",
        language="python",
        content="alpha\nbeta",
        line_count=2,
    )
    out = await _format_full_files_section(pool, [file_id])
    # Line numbers should appear as "    1| alpha" etc.
    assert "1|" in out
    assert "2|" in out


# ---------------------------------------------------------------------------
# Local helper — NOT in conftest. Reuses the pattern from test_file_full_content.py
# ---------------------------------------------------------------------------

async def _seed_file_with_content(
    pool, *, file_path: str, language: str, content: str, line_count: int,
) -> UUID:
    """Seed sources + sync_runs + file_embeddings + content_chunks.

    Returns the file_id as a UUID. Tears down via source DELETE (cascades).
    """
    unique = uuid4().hex[:12]
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo', 'ffc_pipeline_test', $1, 'u') RETURNING id",
            unique,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1, 'completed', now()) RETURNING id",
            src_id,
        )
        file_id = await conn.fetchval(
            "INSERT INTO file_embeddings "
            "(source_id, sync_id, file_path, name, type, language, line_count) "
            "VALUES ($1, $2, $3, $3, 'file', $4, $5) RETURNING id",
            src_id, sync_id, file_path, language, line_count,
        )
        await conn.execute(
            "INSERT INTO content_chunks "
            "(file_id, sync_id, chunk_index, content, start_line, end_line, token_count) "
            "VALUES ($1, $2, 0, $3, 1, $4, $4)",
            file_id, sync_id, content, line_count,
        )
    return file_id
