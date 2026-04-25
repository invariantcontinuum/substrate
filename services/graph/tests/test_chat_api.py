"""Integration tests for /api/chat/* — thread CRUD, user isolation, and
the delete-cascades-to-messages guarantee. Runs against a real Postgres
(no DB mocks, per monorepo rule); the dense LLM isn't available inside
tests so we stub ``chat_pipeline.run_turn`` at the module level."""
from __future__ import annotations

import uuid

import pytest
import pytest_asyncio

from src.graph import store

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(loop_scope="session", autouse=True)
async def _cleanup_chat_threads(app_pool):
    """Chat tests share a database across the session; trim stray threads
    from prior runs (or from failed earlier tests in this session) up
    front so each test starts from an empty-per-user state."""
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM chat_threads WHERE user_sub = ANY($1::text[])",
            ["user-a", "user-b", "user-cascade"],
        )
    yield
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM chat_threads WHERE user_sub = ANY($1::text[])",
            ["user-a", "user-b", "user-cascade"],
        )


async def test_missing_x_user_sub_is_401(async_client):
    r = await async_client.get("/api/chat/threads")
    assert r.status_code == 401, r.text


async def test_list_threads_empty_for_fresh_user(async_client):
    r = await async_client.get(
        "/api/chat/threads", headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"items": []}


async def test_create_and_list_threads(async_client):
    r = await async_client.post(
        "/api/chat/threads", json={"title": "hello"},
        headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["title"] == "hello"
    assert created["id"]

    r = await async_client.get(
        "/api/chat/threads", headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert any(it["id"] == created["id"] and it["title"] == "hello" for it in items)


async def test_thread_isolation_across_users(async_client):
    r = await async_client.post(
        "/api/chat/threads", json={"title": "private"},
        headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    # user-b cannot list it ...
    r = await async_client.get(
        "/api/chat/threads", headers={"X-User-Sub": "user-b"},
    )
    assert r.status_code == 200
    assert all(it["id"] != thread_id for it in r.json()["items"])

    # ... cannot GET its messages (404, not 403 — don't leak existence)
    r = await async_client.get(
        f"/api/chat/threads/{thread_id}/messages",
        headers={"X-User-Sub": "user-b"},
    )
    assert r.status_code == 404, r.text

    # ... cannot DELETE it (404)
    r = await async_client.delete(
        f"/api/chat/threads/{thread_id}",
        headers={"X-User-Sub": "user-b"},
    )
    assert r.status_code == 404, r.text

    # sanity: the owner still sees it
    r = await async_client.get(
        f"/api/chat/threads/{thread_id}/messages",
        headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 200, r.text


async def test_thread_delete_cascades_messages(
    async_client, seeded_assistant_turn,
):
    thread_id = seeded_assistant_turn

    # Pre-check: the seeded turn produced user + assistant messages.
    r = await async_client.get(
        f"/api/chat/threads/{thread_id}/messages",
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["items"]) == 2

    # Delete — owner has permission, cascades via FK.
    r = await async_client.delete(
        f"/api/chat/threads/{thread_id}",
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 204, r.text

    # Subsequent GET on the now-missing thread is 404, and the FK cascade
    # means even if a race left dangling rows, they would already be gone.
    r = await async_client.get(
        f"/api/chat/threads/{thread_id}/messages",
        headers={"X-User-Sub": "user-cascade"},
    )
    assert r.status_code == 404, r.text

    pool = store.get_pool()
    async with pool.acquire() as conn:
        remaining = await conn.fetchval(
            "SELECT count(*) FROM chat_messages WHERE thread_id = $1::uuid",
            thread_id,
        )
    assert remaining == 0
