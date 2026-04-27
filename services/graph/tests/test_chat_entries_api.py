"""Integration tests for PUT/GET /api/chat/threads/{id}/entries (V12 shape)."""
from __future__ import annotations

from uuid import UUID

import pytest

from src.graph import store

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ---------------------------------------------------------------------------
# Seed helpers (local to this file — do NOT add to conftest.py)
# ---------------------------------------------------------------------------

async def _seed_thread(pool, sub: str) -> UUID:
    """Insert a chat_threads row for sub. Returns thread id as UUID."""
    row = await pool.fetchrow(
        "INSERT INTO chat_threads (user_sub, title) VALUES ($1, 'test') "
        "RETURNING id",
        sub,
    )
    return row["id"]


async def _seed_file(pool, file_path: str) -> UUID:
    """Insert source + sync_run + file_embeddings row. Returns file id."""
    from src.config import settings
    zero_vec = "[" + ",".join("0" for _ in range(settings.embedding_dim)) + "]"
    safe = file_path.replace("/", "_").replace(".", "_")

    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE source_type='github_repo' "
            "AND owner='entries_test' AND name=$1",
            safe,
        )
        src_id = await conn.fetchval(
            "INSERT INTO sources (source_type, owner, name, url) "
            "VALUES ('github_repo','entries_test',$1,'u') RETURNING id",
            safe,
        )
        sync_id = await conn.fetchval(
            "INSERT INTO sync_runs (source_id, status, completed_at) "
            "VALUES ($1,'completed',now()) RETURNING id",
            src_id,
        )
        file_id = await conn.fetchval(
            "INSERT INTO file_embeddings "
            "(sync_id, source_id, file_path, name, type, description, embedding) "
            "VALUES ($1,$2,$3,$3,'file','seeded',$4::vector) RETURNING id",
            sync_id, src_id, file_path, zero_vec,
        )
    return file_id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_put_entries_writes_when_unfrozen(async_client, app_pool):
    pool = store.get_pool()
    thread_id = await _seed_thread(pool, sub="u-entries-1")
    file_id = await _seed_file(pool, file_path="a.py")
    payload = {"entries": [{"type": "file", "file_id": str(file_id)}]}
    resp = await async_client.put(
        f"/api/chat/threads/{thread_id}/entries",
        json=payload,
        headers={"X-User-Sub": "u-entries-1"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["entries"][0]["type"] == "file"
    assert body["frozen_at"] is None

    # Verify persisted.
    get_resp = await async_client.get(
        f"/api/chat/threads/{thread_id}/entries",
        headers={"X-User-Sub": "u-entries-1"},
    )
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["entries"][0]["file_id"] == str(file_id)


async def test_put_entries_rejects_when_frozen(async_client, app_pool):
    pool = store.get_pool()
    thread_id = await _seed_thread(pool, sub="u-entries-2")
    # Manually freeze the thread.
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE chat_threads SET context = jsonb_set(context, '{frozen_at}', "
            "to_jsonb(now()::text)) WHERE id = $1",
            thread_id,
        )
    payload = {"entries": []}
    resp = await async_client.put(
        f"/api/chat/threads/{thread_id}/entries",
        json=payload,
        headers={"X-User-Sub": "u-entries-2"},
    )
    assert resp.status_code == 409, resp.text
    assert "frozen" in resp.json()["error"]["message"].lower()


async def test_put_entries_validates_payload_shape(async_client, app_pool):
    pool = store.get_pool()
    thread_id = await _seed_thread(pool, sub="u-entries-3")
    bad = {"entries": [{"type": "file"}]}  # missing file_id
    resp = await async_client.put(
        f"/api/chat/threads/{thread_id}/entries",
        json=bad,
        headers={"X-User-Sub": "u-entries-3"},
    )
    assert resp.status_code in (400, 422), resp.text
