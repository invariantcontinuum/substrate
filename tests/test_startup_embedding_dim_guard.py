"""Graph-service startup embedding-dim guard (A.3).

Reads pgvector column typmod and asserts it matches settings.embedding_dim.
"""
import pytest
from unittest.mock import AsyncMock
from src.main import check_embedding_dim  # added in Step 4


@pytest.mark.asyncio
async def test_guard_passes_when_dim_matches():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"atttypmod": 1024}  # pgvector: atttypmod == dim
    await check_embedding_dim(conn, expected_dim=1024)


@pytest.mark.asyncio
async def test_guard_raises_when_dim_mismatches():
    conn = AsyncMock()
    conn.fetchrow.return_value = {"atttypmod": 768}  # 768-dim column
    with pytest.raises(RuntimeError) as exc_info:
        await check_embedding_dim(conn, expected_dim=1024)
    assert "1024" in str(exc_info.value)
    assert "768" in str(exc_info.value)
