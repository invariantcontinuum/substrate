"""Tests for /api/chat-context/active CRUD + per-thread context-files."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_get_active_returns_null_for_fresh_user(async_client):
    r = await async_client.get(
        "/api/chat-context/active",
        headers={"X-User-Sub": "user-cc-1"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"active": None}


async def test_put_then_get_active_round_trip(async_client):
    payload = {
        "source_id": "11111111-1111-1111-1111-111111111111",
        "snapshot_ids": ["22222222-2222-2222-2222-222222222222"],
        "community_ids": [{"cache_key": "abc", "community_index": 7}],
    }
    r = await async_client.put(
        "/api/chat-context/active",
        json=payload,
        headers={"X-User-Sub": "user-cc-2"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["active"] == payload
    r2 = await async_client.get(
        "/api/chat-context/active",
        headers={"X-User-Sub": "user-cc-2"},
    )
    assert r2.json()["active"] == payload


async def test_put_null_clears_active(async_client):
    r = await async_client.put(
        "/api/chat-context/active",
        json=None,
        headers={"X-User-Sub": "user-cc-3"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"active": None}


async def test_thread_create_resolves_active_context(
    async_client, seed_one_file,
):
    payload = {
        "source_id": seed_one_file["source_id"],
        "snapshot_ids": [seed_one_file["sync_id"]],
        "community_ids": [],
    }
    r = await async_client.put(
        "/api/chat-context/active",
        json=payload,
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200, r.text

    r = await async_client.post(
        "/api/chat/threads",
        json={"title": "ctx test"},
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    rf = await async_client.get(
        f"/api/chat-context/threads/{thread_id}/context-files",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert rf.status_code == 200, rf.text
    body = rf.json()
    assert any(f["file_id"] == seed_one_file["file_id"] for f in body["files"])
    assert body["totals"]["file_count"] >= 1


async def test_patch_context_files_toggles_included(
    async_client, seed_one_file,
):
    # Apply context + create a thread (re-using the resolution).
    await async_client.put(
        "/api/chat-context/active",
        json={
            "source_id": seed_one_file["source_id"],
            "snapshot_ids": [seed_one_file["sync_id"]],
            "community_ids": [],
        },
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    r = await async_client.post(
        "/api/chat/threads",
        json={"title": "patch test"},
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    thread_id = r.json()["id"]

    rp = await async_client.patch(
        f"/api/chat-context/threads/{thread_id}/context-files",
        json={"updates": [{"file_id": seed_one_file["file_id"], "included": False}]},
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert rp.status_code == 200, rp.text
    body = rp.json()
    target = next(
        f for f in body["files"] if f["file_id"] == seed_one_file["file_id"]
    )
    assert target["included"] is False
    assert body["totals"]["included_token_total"] < body["totals"]["all_token_total"]
