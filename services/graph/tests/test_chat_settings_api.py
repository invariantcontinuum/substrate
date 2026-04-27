"""Integration tests for chat settings endpoints and bulk thread mutations."""
from __future__ import annotations

from uuid import UUID

import pytest

from src.graph import store

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ---------------------------------------------------------------------------
# Seed helpers (local to this file — do NOT add to conftest.py)
# ---------------------------------------------------------------------------

async def _seed_user_profile(pool, sub: str) -> None:
    """Upsert a user_profiles row for sub."""
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO user_profiles (user_sub) VALUES ($1) "
            "ON CONFLICT (user_sub) DO NOTHING",
            sub,
        )


async def _seed_thread(pool, sub: str) -> UUID:
    """Insert a chat_threads row for sub. Returns thread id as UUID."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO chat_threads (user_sub, title) VALUES ($1, 'test') "
            "RETURNING id",
            sub,
        )
    return row["id"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def test_patch_chat_settings_updates_history_turns(async_client, app_pool):
    pool = store.get_pool()
    await _seed_user_profile(pool, sub="u-settings-1")
    resp = await async_client.patch(
        "/api/users/me/chat-settings",
        json={"history_turns": 4},
        headers={"X-User-Sub": "u-settings-1"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["history_turns"] == 4

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT chat_settings FROM user_profiles WHERE user_sub = $1",
            "u-settings-1",
        )
    assert row["chat_settings"]["history_turns"] == 4


async def test_get_chat_settings_returns_defaults_for_fresh_user(async_client, app_pool):
    pool = store.get_pool()
    await _seed_user_profile(pool, sub="u-settings-defaults")
    resp = await async_client.get(
        "/api/users/me/chat-settings",
        headers={"X-User-Sub": "u-settings-defaults"},
    )
    assert resp.status_code == 200, resp.text
    # Default should be 12
    assert resp.json()["history_turns"] == 12


async def test_archive_all_threads(async_client, app_pool):
    pool = store.get_pool()
    await _seed_user_profile(pool, sub="u-archive-all")
    t1 = await _seed_thread(pool, sub="u-archive-all")
    t2 = await _seed_thread(pool, sub="u-archive-all")
    resp = await async_client.post(
        "/api/chat/threads/archive-all",
        headers={"X-User-Sub": "u-archive-all"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["archived"] == 2

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT archived_at FROM chat_threads WHERE id = ANY($1::uuid[])",
            [t1, t2],
        )
    assert all(r["archived_at"] is not None for r in rows)


async def test_export_threads_returns_attachment(async_client, app_pool):
    pool = store.get_pool()
    await _seed_user_profile(pool, sub="u-export-1")
    await _seed_thread(pool, sub="u-export-1")
    resp = await async_client.get(
        "/api/chat/threads/export",
        headers={"X-User-Sub": "u-export-1"},
    )
    assert resp.status_code == 200, resp.text
    assert "attachment" in resp.headers.get("content-disposition", "")
    body = resp.json()
    assert "threads" in body and "messages" in body
    assert len(body["threads"]) >= 1
