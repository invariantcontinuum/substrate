"""Chat-context store + routes — single-shape integration tests.

Covers the V11 consolidation: per-user `{sync_ids, source_ids}` seed,
per-thread `{scope, selection}` JSONB column, and the four-mode
discriminated-union selection schema (all / files / communities /
directories).
"""
from __future__ import annotations

from uuid import UUID

import pytest

from src.graph import chat_context_store, chat_store

pytestmark = pytest.mark.asyncio(loop_scope="session")


# ── Store-level round trips (no HTTP) ───────────────────────────────


async def test_active_seed_roundtrip(app_pool):
    sub = "u-seed-roundtrip"
    # Cleanup any leftover row from previous runs.
    await chat_context_store.set_active_seed(sub, None)
    assert await chat_context_store.get_active_seed(sub) is None

    seed = {
        "sync_ids": ["00000000-0000-0000-0000-000000000001"],
        "source_ids": [],
    }
    await chat_context_store.set_active_seed(sub, seed)
    assert await chat_context_store.get_active_seed(sub) == seed

    await chat_context_store.set_active_seed(sub, None)
    assert await chat_context_store.get_active_seed(sub) is None


async def test_thread_context_default_then_scope_freeze(app_pool):
    sub = "u-default-then-scope"
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])

    ctx = await chat_context_store.get_thread_context(tid)
    assert ctx["selection"]["kind"] == "all"
    assert ctx["scope"]["sync_ids"] == []

    await chat_context_store.set_thread_context_scope(
        tid,
        ["11111111-1111-1111-1111-111111111111"],
        ["22222222-2222-2222-2222-222222222222"],
    )
    ctx2 = await chat_context_store.get_thread_context(tid)
    assert ctx2["scope"]["sync_ids"] == [
        "11111111-1111-1111-1111-111111111111",
    ]
    assert ctx2["scope"]["source_ids"] == [
        "22222222-2222-2222-2222-222222222222",
    ]
    assert ctx2["selection"] == {"kind": "all"}


async def test_selection_roundtrip(app_pool):
    sub = "u-selection-roundtrip"
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])

    await chat_context_store.set_thread_context_selection(
        tid, {"kind": "directories", "dir_prefixes": ["src/api/"]},
    )
    ctx = await chat_context_store.get_thread_context(tid)
    assert ctx["selection"]["kind"] == "directories"
    assert ctx["selection"]["dir_prefixes"] == ["src/api/"]


# ── HTTP route smoke ────────────────────────────────────────────────


async def test_active_route_get_returns_null_for_fresh_user(async_client):
    r = await async_client.get(
        "/api/chat-context/active",
        headers={"X-User-Sub": "u-active-fresh"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"active": None}


async def test_active_route_put_then_get_round_trip(async_client):
    payload = {
        "sync_ids": [
            "33333333-3333-3333-3333-333333333333",
        ],
        "source_ids": [],
    }
    r = await async_client.put(
        "/api/chat-context/active",
        json=payload,
        headers={"X-User-Sub": "u-active-rt"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["active"] == payload

    r2 = await async_client.get(
        "/api/chat-context/active",
        headers={"X-User-Sub": "u-active-rt"},
    )
    assert r2.json()["active"] == payload


async def test_active_route_put_null_clears(async_client):
    r = await async_client.put(
        "/api/chat-context/active",
        json=None,
        headers={"X-User-Sub": "u-active-clear"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"active": None}


async def test_thread_context_route_returns_default(async_client):
    user = "u-thread-ctx-default"
    r = await async_client.post(
        "/api/chat/threads",
        json={"title": "ctx default"},
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    r = await async_client.get(
        f"/api/chat/threads/{thread_id}/context",
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["context"]["selection"]["kind"] == "all"
    assert isinstance(body["files"], list)


async def test_put_thread_selection_validates_kind(async_client):
    user = "u-thread-sel-validate"
    r = await async_client.post(
        "/api/chat/threads",
        json={"title": "sel valid"},
        headers={"X-User-Sub": user},
    )
    thread_id = r.json()["id"]

    # Valid: directories selection.
    r = await async_client.put(
        f"/api/chat/threads/{thread_id}/context/selection",
        json={"kind": "directories", "dir_prefixes": ["src/"]},
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["context"]["selection"]["kind"] == "directories"
    assert body["context"]["selection"]["dir_prefixes"] == ["src/"]

    # Invalid: unknown kind.
    r = await async_client.put(
        f"/api/chat/threads/{thread_id}/context/selection",
        json={"kind": "bogus"},
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 422


async def test_thread_create_freezes_active_seed_scope(
    async_client, seed_one_file,
):
    """End-to-end: PUT active seed → POST /threads → thread context
    has scope.sync_ids equal to the seed's sync_ids (frozen at create)."""
    user = seed_one_file["user_sub"]
    seed = {
        "sync_ids": [seed_one_file["sync_id"]],
        "source_ids": [],
    }
    r = await async_client.put(
        "/api/chat-context/active",
        json=seed,
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 200, r.text

    r = await async_client.post(
        "/api/chat/threads",
        json={"title": "freeze test"},
        headers={"X-User-Sub": user},
    )
    assert r.status_code == 200, r.text
    thread_id = r.json()["id"]

    rc = await async_client.get(
        f"/api/chat/threads/{thread_id}/context",
        headers={"X-User-Sub": user},
    )
    assert rc.status_code == 200, rc.text
    body = rc.json()
    assert body["context"]["scope"]["sync_ids"] == [seed_one_file["sync_id"]]
    assert body["context"]["selection"]["kind"] == "all"
    # Scope file enumeration includes the seeded file.
    assert any(f["file_id"] == seed_one_file["file_id"] for f in body["files"])
