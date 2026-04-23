import pytest
from fastapi.testclient import TestClient
from src.main import app
from src.graph import store


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_list_syncs_for_unknown_source_returns_empty(client):
    r = client.get("/api/syncs?source_id=00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_list_schedules_for_unknown_source_returns_empty(client):
    r = client.get("/api/schedules?source_id=00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio(loop_scope="session")
async def test_get_sync_normalizes_double_encoded_json(async_client):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        src_id = await conn.fetchval(
            """
            INSERT INTO sources (user_sub, source_type, owner, name, url, config)
            VALUES (
                'dev',
                'github_repo',
                'proj',
                'sync-json-normalize',
                'u',
                '\"{\\\"branch\\\":\\\"main\\\"}\"'::jsonb
            )
            RETURNING id::text
            """
        )
        sync_id = await conn.fetchval(
            """
            INSERT INTO sync_runs (
                source_id,
                status,
                config_snapshot,
                progress_done,
                progress_total,
                progress_meta,
                stats
            )
            VALUES (
                $1::uuid,
                'running',
                '\"{\\\"ref\\\":\\\"main\\\"}\"'::jsonb,
                4,
                10,
                '\"{\\\"phase\\\":\\\"embedding_chunks\\\",\\\"chunks_embedded\\\":4}\"'::jsonb,
                '\"{\\\"nodes\\\":42}\"'::jsonb
            )
            RETURNING id::text
            """,
            src_id,
        )

    try:
        response = await async_client.get(
            f"/api/syncs/{sync_id}",
            headers={"X-User-Sub": "dev"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["config_snapshot"] == {"ref": "main"}
        assert body["progress_meta"] == {
            "phase": "embedding_chunks",
            "chunks_embedded": 4,
        }
        assert body["stats"] == {"nodes": 42}
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM sources WHERE id = $1::uuid", src_id)
