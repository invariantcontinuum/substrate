"""statement_timeout wrapper for AGE snapshot queries (P1.10-b).

Asserts SET LOCAL statement_timeout fires before the query and that
asyncpg QueryCanceledError is translated to GraphQueryTimeout.
"""
import pytest
import asyncpg
from unittest.mock import AsyncMock
from src.graph.snapshot_query import run_with_timeout, GraphQueryTimeout


@pytest.mark.asyncio
async def test_sets_statement_timeout_before_query():
    conn = AsyncMock()
    async def body(c):
        await c.execute("SELECT 1")
        return {"ok": True}
    result = await run_with_timeout(conn, body, timeout_s=60)
    assert result == {"ok": True}
    conn.execute.assert_any_call("SET LOCAL statement_timeout = '60000ms'")


@pytest.mark.asyncio
async def test_translates_query_canceled_to_graph_query_timeout():
    conn = AsyncMock()
    async def body(c):
        raise asyncpg.exceptions.QueryCanceledError("canceling statement")
    with pytest.raises(GraphQueryTimeout) as exc_info:
        await run_with_timeout(conn, body, timeout_s=30, context={"sync_ids": ["a"]})
    assert exc_info.value.timeout_s == 30
    assert exc_info.value.context == {"sync_ids": ["a"]}
