"""Integration tests for POST /api/syncs/{id}/resync."""
from __future__ import annotations

import json

import pytest
import pytest_asyncio

from src.graph import store

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(loop_scope="session")
async def failed_sync_with_cursor(app_pool):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE user_sub = 'user-resync'",
        )
        source_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ('user-resync', 'github', 'acme', 'demo', 'https://x/') RETURNING id",
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, resume_cursor) "
            "VALUES ($1, 'failed', $2::jsonb) RETURNING id",
            source_id, json.dumps({
                "commit_sha": "deadbeef",
                "tree_total_paths": 100,
                "processed_paths": ["a.py"],
            }),
        )
    yield {"sync_id": str(sync_id), "user_sub": "user-resync"}
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id = $1", source_id)


async def test_resync_creates_child_sync(async_client, failed_sync_with_cursor):
    r = await async_client.post(
        f"/api/syncs/{failed_sync_with_cursor['sync_id']}/resync",
        headers={"X-User-Sub": failed_sync_with_cursor["user_sub"]},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["parent_sync_id"] == failed_sync_with_cursor["sync_id"]
    assert body["status"] == "pending"
    cur = body["resume_cursor"]
    if isinstance(cur, str):
        cur = json.loads(cur)
    assert cur["commit_sha"] == "deadbeef"


async def test_resync_rejects_succeeded_parent(async_client):
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE user_sub = 'user-resync2'",
        )
        source_id = await conn.fetchval(
            "INSERT INTO sources (user_sub, source_type, owner, name, url) "
            "VALUES ('user-resync2', 'github', 'acme', 'ok', 'https://x/') RETURNING id",
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status) "
            "VALUES ($1, 'completed') RETURNING id", source_id,
        )
    try:
        r = await async_client.post(
            f"/api/syncs/{sync_id}/resync",
            headers={"X-User-Sub": "user-resync2"},
        )
        # ValidationError → 400 (substrate_common convention)
        assert r.status_code == 400, r.text
    finally:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM sources WHERE id = $1", source_id)


async def test_resync_404_when_not_owned(async_client, failed_sync_with_cursor):
    r = await async_client.post(
        f"/api/syncs/{failed_sync_with_cursor['sync_id']}/resync",
        headers={"X-User-Sub": "stranger"},
    )
    assert r.status_code == 404
