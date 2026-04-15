"""API-level tests for POST /api/syncs 202/409 contract (graph service)."""
import asyncio
import os
import uuid
import asyncpg
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from src.main import app


def _dsn() -> str:
    url = os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:changeme@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def seeded_source():
    """Create a throwaway sources row using a fresh sync-compatible event loop;
    clean up sync_runs then source on teardown.

    We use asyncio.run() in setup/teardown so the fixture can stay sync and
    avoid the 'different event loop' issue that arises when mixing a session-
    scoped asyncpg pool with a function-scoped async fixture in TestClient tests.
    """
    source_id = str(uuid.uuid4())

    async def _insert():
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute(
                "INSERT INTO sources (id, source_type, owner, name, url) "
                "VALUES ($1::uuid, 'github_repo', 'test-org', $2, $3)",
                source_id,
                f"conflict-test-{source_id}",
                f"https://github.test/conflict-{source_id}",
            )
        finally:
            await conn.close()

    async def _cleanup():
        conn = await asyncpg.connect(_dsn())
        try:
            await conn.execute(
                "DELETE FROM sync_runs WHERE source_id = $1::uuid", source_id
            )
            await conn.execute(
                "DELETE FROM sources WHERE id = $1::uuid", source_id
            )
        finally:
            await conn.close()

    asyncio.run(_insert())
    yield source_id
    asyncio.run(_cleanup())


def test_first_post_returns_202_second_returns_409_with_same_sync_id(
    client, seeded_source
):
    body = {"source_id": seeded_source, "config_snapshot": {"branch": "main"}}

    first = client.post("/api/syncs", json=body)
    assert first.status_code == 202
    first_sync_id = first.json()["sync_id"]

    second = client.post("/api/syncs", json=body)
    assert second.status_code == 409
    assert second.json() == {
        "error": "sync_already_active",
        "message": "A sync is already running or pending for this source.",
        "sync_id": first_sync_id,
        "status": "already_active",
    }


def test_post_unknown_source_returns_404(client):
    body = {
        "source_id": "00000000-0000-0000-0000-000000000000",
        "config_snapshot": {},
    }
    r = client.post("/api/syncs", json=body)
    assert r.status_code == 404
