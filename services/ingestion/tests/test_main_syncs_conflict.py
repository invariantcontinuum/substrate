"""API-level 202/409 contract tests for POST /api/syncs (ingestion service).

These tests exercise ensure_active_sync directly with a real database
connection — consistent with the established ingestion test pattern of
testing module functions against a live DB rather than mounting the full
FastAPI app (whose lifespan starts background runner/scheduler tasks that
are not needed here).
"""
import uuid
import pytest
import pytest_asyncio

from src import graph_writer, sync_runs


pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_pool(graph_pool):
    """Ensure graph_writer pool is initialised before any test in this module."""
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield
    # pool teardown handled by graph_pool session fixture


@pytest_asyncio.fixture
async def seeded_source(graph_pool):
    """Create a throwaway sources row; clean up sync_runs then source on teardown."""
    source_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, source_type, owner, name, url) "
            "VALUES ($1::uuid, 'github_repo', 'test-org', $2, $3)",
            source_id,
            f"conflict-test-{source_id}",
            f"https://github.test/conflict-{source_id}",
        )
    yield source_id
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sync_runs WHERE source_id = $1::uuid", source_id
        )
        await conn.execute("DELETE FROM sources WHERE id = $1::uuid", source_id)


async def test_first_call_creates_sync_second_returns_existing(
    graph_pool, seeded_source
):
    """Mirrors the 202/409 sequence the POST /api/syncs handler enforces."""
    config = {"branch": "main"}

    async with graph_pool.acquire() as conn:
        sync_id_1, created_1 = await sync_runs.ensure_active_sync(
            conn,
            source_id=seeded_source,
            config_snapshot=config,
            triggered_by="user",
        )
    assert created_1 is True

    async with graph_pool.acquire() as conn:
        sync_id_2, created_2 = await sync_runs.ensure_active_sync(
            conn,
            source_id=seeded_source,
            config_snapshot=config,
            triggered_by="user",
        )
    assert created_2 is False
    assert sync_id_2 == sync_id_1  # 409 body sync_id matches the first


async def test_ensure_active_sync_returns_202_body_shape(graph_pool, seeded_source):
    """Verify the values the handler would include in its 202 response."""
    async with graph_pool.acquire() as conn:
        sync_id, created = await sync_runs.ensure_active_sync(
            conn,
            source_id=seeded_source,
            config_snapshot={"branch": "main"},
            triggered_by="user",
        )
    # Handler returns {"sync_id": sync_id, "status": "pending"} on created=True
    assert created is True
    assert sync_id  # non-empty UUID string

    # A second call must return the same id (409 branch)
    async with graph_pool.acquire() as conn:
        existing_id, created2 = await sync_runs.ensure_active_sync(
            conn,
            source_id=seeded_source,
            config_snapshot={"branch": "main"},
            triggered_by="user",
        )
    assert created2 is False
    assert existing_id == sync_id
