import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src import graph_writer


def _make_pool(execute_side_effect=None):
    conn = AsyncMock()
    if execute_side_effect is not None:
        conn.execute = AsyncMock(side_effect=execute_side_effect)
    else:
        conn.execute = AsyncMock()

    pool = MagicMock()
    acquire_ctx = AsyncMock()
    acquire_ctx.__aenter__.return_value = conn
    acquire_ctx.__aexit__.return_value = False
    pool.acquire = MagicMock(return_value=acquire_ctx)
    return pool, conn


@pytest.mark.asyncio
async def test_write_age_nodes_uses_chunked_unwind_when_many_rows():
    pool, conn = _make_pool()
    nodes = [
        {"file_id": f"f{i}", "name": f"n{i}", "type": "code", "domain": "src"}
        for i in range(1200)
    ]
    with patch.object(graph_writer, "_pool", pool):
        failed = await graph_writer.write_age_nodes(
            nodes, sync_id="00000000-0000-0000-0000-000000000001",
            source_id="00000000-0000-0000-0000-000000000002",
        )
    assert failed == 0
    # 1200 / 500 = ceil 3 chunks → 3 execute calls, no fallback.
    assert conn.execute.call_count == 3
    for call in conn.execute.call_args_list:
        assert "UNWIND" in call.args[0]


@pytest.mark.asyncio
async def test_write_age_nodes_fallback_to_per_row_on_chunk_failure():
    # First call (chunk) raises; next 500 calls (per-row fallback) succeed.
    side_effects = [RuntimeError("AGE chunk blew up")] + [None] * 500
    pool, conn = _make_pool(execute_side_effect=side_effects)
    nodes = [
        {"file_id": f"f{i}", "name": f"n{i}", "type": "code", "domain": "src"}
        for i in range(500)
    ]
    with patch.object(graph_writer, "_pool", pool):
        failed = await graph_writer.write_age_nodes(
            nodes, sync_id="00000000-0000-0000-0000-000000000001",
            source_id="00000000-0000-0000-0000-000000000002",
        )
    assert failed == 0
    # 1 chunk attempt + 500 per-row fallbacks = 501 total.
    assert conn.execute.call_count == 501


@pytest.mark.asyncio
async def test_write_age_nodes_counts_per_row_failures_in_fallback():
    # Chunk fails; then first per-row succeeds, second fails, rest succeed.
    side_effects = [RuntimeError("chunk")] + [None, RuntimeError("row 2"), None, None]
    pool, conn = _make_pool(execute_side_effect=side_effects)
    nodes = [
        {"file_id": f"f{i}", "name": f"n{i}", "type": "code", "domain": "src"}
        for i in range(4)
    ]
    with patch.object(graph_writer, "_pool", pool):
        failed = await graph_writer.write_age_nodes(
            nodes, sync_id="00000000-0000-0000-0000-000000000001",
            source_id="00000000-0000-0000-0000-000000000002",
        )
    assert failed == 1


@pytest.mark.asyncio
async def test_write_age_edges_uses_chunked_unwind_when_many_rows():
    pool, conn = _make_pool()
    edges = [
        {"source_id": f"a{i}", "target_id": f"b{i}", "weight": 1.0}
        for i in range(1000)
    ]
    with patch.object(graph_writer, "_pool", pool):
        failed = await graph_writer.write_age_edges(
            edges, sync_id="00000000-0000-0000-0000-000000000001",
            source_id="00000000-0000-0000-0000-000000000002",
        )
    assert failed == 0
    # 1000 / 500 = 2 chunks.
    assert conn.execute.call_count == 2
    for call in conn.execute.call_args_list:
        assert "UNWIND" in call.args[0]
