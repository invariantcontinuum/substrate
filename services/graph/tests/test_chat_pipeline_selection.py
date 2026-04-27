"""Pipeline-side selection resolution tests.

Covers `_resolve_thread_selection`, the single source of truth that
`stream_turn` calls before retrieval. Each test seeds files in a sync,
freezes the thread's scope onto that sync, sets a selection, and
asserts that the resolver returns the expected file_id list.
"""
from __future__ import annotations

from uuid import UUID

import pytest

from src.graph import chat_context_store, chat_pipeline, chat_store

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_resolve_kind_all_returns_every_scope_file(
    app_pool, two_files_in_one_sync,
):
    sub, sync_id, file_ids = two_files_in_one_sync
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])
    await chat_context_store.set_thread_context_scope(tid, [sync_id], [])

    out = await chat_pipeline._resolve_thread_selection(tid, sub)
    assert sorted(out) == sorted(file_ids)


async def test_resolve_kind_files_intersects_scope(
    app_pool, two_files_in_one_sync,
):
    sub, sync_id, file_ids = two_files_in_one_sync
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])
    await chat_context_store.set_thread_context_scope(tid, [sync_id], [])
    await chat_context_store.set_thread_context_selection(tid, {
        "kind": "files",
        "file_ids": [
            file_ids[0],
            "00000000-0000-0000-0000-000000000000",
        ],
    })

    out = await chat_pipeline._resolve_thread_selection(tid, sub)
    # Only one of the requested ids is in scope; the other is ignored.
    assert out == [file_ids[0]]


async def test_resolve_kind_directories_filters_by_prefix(
    app_pool, two_files_in_one_sync_with_paths,
):
    sub, sync_id, paths = two_files_in_one_sync_with_paths
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])
    await chat_context_store.set_thread_context_scope(tid, [sync_id], [])
    await chat_context_store.set_thread_context_selection(tid, {
        "kind": "directories",
        "dir_prefixes": ["src/"],
    })

    out = await chat_pipeline._resolve_thread_selection(tid, sub)
    assert out == [paths["src/api/foo.py"]]


async def test_resolve_kind_directories_no_prefixes_is_empty(
    app_pool, two_files_in_one_sync_with_paths,
):
    sub, sync_id, _paths = two_files_in_one_sync_with_paths
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])
    await chat_context_store.set_thread_context_scope(tid, [sync_id], [])
    await chat_context_store.set_thread_context_selection(tid, {
        "kind": "directories",
        "dir_prefixes": [],
    })

    out = await chat_pipeline._resolve_thread_selection(tid, sub)
    assert out == []


async def test_resolve_unknown_kind_returns_empty(
    app_pool, two_files_in_one_sync,
):
    sub, sync_id, _file_ids = two_files_in_one_sync
    thread = await chat_store.create_thread(sub, "t")
    tid = UUID(thread["id"])
    await chat_context_store.set_thread_context_scope(tid, [sync_id], [])
    # Bypass the route-layer validation by writing directly via the store.
    await chat_context_store.set_thread_context_selection(tid, {
        "kind": "mystery",
    })

    out = await chat_pipeline._resolve_thread_selection(tid, sub)
    assert out == []
