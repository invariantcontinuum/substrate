"""Streaming chat pipeline tests.

Pure-function unit tests run without DB; integration tests use the real
Postgres pool (``app_pool`` fixture from conftest.py) and stub the
_stream_dense_llm async generator via monkeypatch to avoid hitting the
dense LLM endpoint.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio

from src.graph import chat_pipeline
from src.graph.chat_pipeline import (
    CHAT_TURN_CHUNK,
    CHAT_TURN_COMPLETED,
    CHAT_TURN_STARTED,
    extract_citation_markers,
)
from substrate_common.sse import Event, SseBus

_async = pytest.mark.asyncio(loop_scope="session")


# ---------------------------------------------------------------------------
# Pure-function tests — no DB required
# ---------------------------------------------------------------------------


def test_extract_citation_markers_basic():
    text = "Hello [ref:abc-123] world [ref:def-456]."
    assert extract_citation_markers(text) == ["abc-123", "def-456"]


def test_extract_citation_markers_dedupes_and_orders():
    text = "Foo [ref:x] bar [ref:y] baz [ref:x]."
    assert extract_citation_markers(text) == ["x", "y"]


def test_extract_citation_markers_handles_uuids():
    text = "see [ref:01H2X3Y4-5Z6A-7B8C-9D0E-1F2G3H4I5J6K]."
    assert extract_citation_markers(text) == ["01H2X3Y4-5Z6A-7B8C-9D0E-1F2G3H4I5J6K"]


def test_extract_citation_markers_empty():
    assert extract_citation_markers("No markers here.") == []


def test_extract_citation_markers_multiple_on_same_line():
    text = "[ref:a] [ref:b] [ref:c] [ref:a]"
    assert extract_citation_markers(text) == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# Integration test — stubbed LLM, real DB
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(loop_scope="session")
async def seeded_chat_thread(app_pool):
    """Seed a chat thread + user message owned by 'stream-test-user'.
    Returns ``(thread_id, user_msg_id, sync_id)`` as UUID objects.
    Tears down the thread (cascades to messages) at teardown."""
    from src.graph import store

    pool = store.get_pool()
    user_sub = "stream-test-user"
    sync_id = uuid4()

    async with pool.acquire() as conn:
        # clean any leftovers
        await conn.execute(
            "DELETE FROM chat_threads WHERE user_sub = $1", user_sub
        )
        thread_id = await conn.fetchval(
            "INSERT INTO chat_threads (user_sub, title) "
            "VALUES ($1, 'streaming test') RETURNING id",
            user_sub,
        )
        msg_id = await conn.fetchval(
            "INSERT INTO chat_messages (thread_id, role, content, citations, sync_ids) "
            "VALUES ($1, 'user', 'test question', '[]'::jsonb, $2::jsonb) "
            "RETURNING id",
            thread_id, [str(sync_id)],
        )

    yield thread_id, msg_id, sync_id

    from src.graph import store as _store
    async with _store.get_pool().acquire() as conn:
        await conn.execute(
            "DELETE FROM chat_threads WHERE user_sub = $1", user_sub
        )


@_async
async def test_stream_turn_event_order_and_persistence(
    app_pool,
    seeded_chat_thread,
    monkeypatch,
):
    """Stub _stream_dense_llm to yield 3 chunks. Verify:
    - SSE event order: started → chunk×3 → completed
    - assistant row persisted with full content
    - extract_citation_markers returns expected markers
    """
    from src.graph import store

    thread_id, user_msg_id, sync_id = seeded_chat_thread
    user_sub = "stream-test-user"

    chunks = ["Hello ", "world", " [ref:node-1]"]

    async def _fake_stream(messages: list[dict]) -> AsyncIterator[str]:
        for c in chunks:
            yield c

    monkeypatch.setattr(chat_pipeline, "_stream_dense_llm", _fake_stream)

    # Also stub _hydrate_citations so we don't need real AGE nodes.
    async def _fake_hydrate(node_ids: list[str]) -> list[dict]:
        return [
            {"node_id": nid, "name": nid, "type": "file"}
            for nid in node_ids
        ]

    monkeypatch.setattr(chat_pipeline, "_hydrate_citations", _fake_hydrate)

    # Also stub _embed_query and search_scoped to avoid real LLM embed call.
    # chat_pipeline imports _embed_query at module level from src.api.routes,
    # so we patch the name in the chat_pipeline module's own namespace.
    async def _fake_embed(text: str) -> list[float]:
        return [0.0] * 768

    async def _fake_search(**kwargs) -> list[dict]:
        return []

    monkeypatch.setattr(
        chat_pipeline, "_embed_query", _fake_embed,
    )
    monkeypatch.setattr(
        chat_pipeline, "search_scoped", _fake_search,
    )

    # Set up a subscriber BEFORE running stream_turn.
    bus = SseBus(store.get_pool())

    collected_events: list[Event] = []

    async def _collect():
        async for ev in bus.subscribe(filters={"user_sub": user_sub}):
            collected_events.append(ev)
            # Break after completed event to avoid hanging.
            if ev.type == CHAT_TURN_COMPLETED:
                break

    collect_task = asyncio.create_task(_collect())

    # Allow the subscription to attach before stream_turn fires.
    await asyncio.sleep(0.05)

    await chat_pipeline.stream_turn(
        thread_id=thread_id,
        user_content="test question",
        sync_ids=[str(sync_id)],
        graph_context=None,
        user_sub=user_sub,
        prior_turns=[],
    )

    # Give the collect task time to finish after the completed event.
    try:
        await asyncio.wait_for(collect_task, timeout=5.0)
    except asyncio.TimeoutError:
        collect_task.cancel()

    # --- verify event order ---
    types = [ev.type for ev in collected_events]
    # Must contain started, 3 chunks, completed (in order, though subscriber
    # may have replayed some or none depending on timing).
    started_idx = next((i for i, t in enumerate(types) if t == CHAT_TURN_STARTED), None)
    completed_idx = next((i for i, t in enumerate(types) if t == CHAT_TURN_COMPLETED), None)
    chunk_types = [t for t in types if t == CHAT_TURN_CHUNK]

    assert started_idx is not None, f"CHAT_TURN_STARTED missing from {types}"
    assert completed_idx is not None, f"CHAT_TURN_COMPLETED missing from {types}"
    assert len(chunk_types) == 3, f"Expected 3 chunk events, got {len(chunk_types)}: {types}"
    assert started_idx < completed_idx

    # Verify all chunks appear between started and completed.
    assert all(
        started_idx < i < completed_idx
        for i, t in enumerate(types)
        if t == CHAT_TURN_CHUNK
    )

    # --- verify DB row ---
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT content FROM chat_messages "
            "WHERE thread_id = $1 AND role = 'assistant' "
            "ORDER BY created_at DESC LIMIT 1",
            thread_id,
        )
    assert row is not None, "assistant message not persisted"
    assert row["content"] == "Hello world [ref:node-1]"

    # --- verify citation extraction ---
    assert extract_citation_markers(row["content"]) == ["node-1"]
