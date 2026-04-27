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

import httpx
import pytest
import pytest_asyncio

from src.graph import chat_pipeline
from src.graph.chat_pipeline import (
    CHAT_TURN_CHUNK,
    CHAT_TURN_COMPLETED,
    CHAT_TURN_FAILED,
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
# _decode_evidence_calls — tool-call accumulation + [CITE …] regex fallback
# ---------------------------------------------------------------------------


def test_decode_evidence_calls_concatenates_streamed_arguments():
    """The dense LLM streams tool_call arguments as a series of partial
    JSON-string deltas. _decode_evidence_calls must accumulate them per
    index, JSON-decode the whole, and surface one entry per cite_evidence
    call — preserving stream-index order when there are multiple."""
    collected = {
        0: {
            "name": "cite_evidence",
            "arguments": (
                '{"filepath": "src/foo.py", '
                '"start_line": 12, "end_line": 20, '
                '"reason": "first call"}'
            ),
        },
        1: {
            "name": "cite_evidence",
            "arguments": (
                '{"filepath": "src/bar.py", '
                '"start_line": 1, "end_line": 4, '
                '"reason": "second call"}'
            ),
        },
    }
    out = chat_pipeline._decode_evidence_calls(collected, "")
    assert out == [
        {
            "filepath": "src/foo.py",
            "start_line": 12,
            "end_line": 20,
            "reason": "first call",
        },
        {
            "filepath": "src/bar.py",
            "start_line": 1,
            "end_line": 4,
            "reason": "second call",
        },
    ]


def test_decode_evidence_calls_skips_invalid_arguments():
    """A tool call whose arguments fail JSON-decode (e.g. interrupted
    stream) must not abort the whole batch — every other valid call
    continues to land."""
    collected = {
        0: {"name": "cite_evidence", "arguments": "{not-json"},
        1: {
            "name": "cite_evidence",
            "arguments": (
                '{"filepath": "ok.py", "start_line": 1, '
                '"end_line": 2, "reason": "ok"}'
            ),
        },
        2: {"name": "other_tool", "arguments": '{"x": 1}'},
    }
    out = chat_pipeline._decode_evidence_calls(collected, "")
    assert len(out) == 1
    assert out[0]["filepath"] == "ok.py"


def test_decode_evidence_calls_falls_back_to_inline_markers():
    """When no tool calls were emitted, the regex fallback parses
    `[CITE path:start-end "reason"]` markers out of the assistant text.
    Used for llama.cpp builds that ignore the ``tools`` request body."""
    text = (
        'See [CITE src/foo.py:1-3 "imports the right thing"] and '
        '[CITE src/bar.py:42-45 "computes the answer"].'
    )
    out = chat_pipeline._decode_evidence_calls({}, text)
    assert out == [
        {
            "filepath": "src/foo.py",
            "start_line": 1,
            "end_line": 3,
            "reason": "imports the right thing",
        },
        {
            "filepath": "src/bar.py",
            "start_line": 42,
            "end_line": 45,
            "reason": "computes the answer",
        },
    ]


def test_decode_evidence_calls_caps_emit_count(monkeypatch):
    """``chat_evidence_max_per_turn`` is the floor on output; a flood
    of inline markers should never blow past it."""
    from src.config import settings

    monkeypatch.setattr(settings, "chat_evidence_max_per_turn", 2)
    text = " ".join(
        f'[CITE f.py:{i}-{i+1} "r{i}"]' for i in range(10)
    )
    out = chat_pipeline._decode_evidence_calls({}, text)
    assert len(out) == 2


def test_decode_evidence_calls_dedupes_identical_entries():
    """Tool-call + inline marker for the same range should collapse —
    the tool-call path is authoritative and the regex fallback only
    runs when the tool list is empty, so identical tool-call pairs
    (same range twice) is the only way to trip dedup. Verify."""
    collected = {
        0: {
            "name": "cite_evidence",
            "arguments": (
                '{"filepath": "x.py", "start_line": 1, '
                '"end_line": 2, "reason": "r"}'
            ),
        },
        1: {
            "name": "cite_evidence",
            "arguments": (
                '{"filepath": "x.py", "start_line": 1, '
                '"end_line": 2, "reason": "r"}'
            ),
        },
    }
    out = chat_pipeline._decode_evidence_calls(collected, "")
    assert len(out) == 1


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

    async def _fake_stream(messages: list[dict]) -> AsyncIterator[tuple[str, object]]:
        # Phase 7 widened the streaming surface to (kind, payload) tuples
        # so cite_evidence tool calls can flow alongside content. The
        # pipeline calls _stream_dense_llm_with_tools as the inner loop;
        # the legacy _stream_dense_llm is now a thin content-only wrapper.
        for c in chunks:
            yield "content", c

    monkeypatch.setattr(chat_pipeline, "_stream_dense_llm_with_tools", _fake_stream)

    # Also stub _hydrate_citations so we don't need real AGE nodes.
    async def _fake_hydrate(node_ids: list[str]) -> list[dict]:
        return [
            {"node_id": nid, "name": nid, "type": "file"}
            for nid in node_ids
        ]

    monkeypatch.setattr(chat_pipeline, "_hydrate_citations", _fake_hydrate)

    # Stub the Phase-6 retrieval helpers so the streaming test never hits
    # the embedding service, the reranker, or pgvector. The retrieve path
    # short-circuits to no candidates which still produces a valid prompt.
    async def _fake_embed(text: str) -> list[float]:
        return [0.0] * 768

    async def _fake_retrieve(**kwargs) -> list[dict]:
        return []

    async def _no_resolved(thread_id, user_sub) -> list[str]:
        return []

    async def _no_snapshot_files(sync_ids) -> list[str]:
        return []

    monkeypatch.setattr(chat_pipeline, "_embed_query", _fake_embed)
    monkeypatch.setattr(chat_pipeline, "retrieve_context_files", _fake_retrieve)
    monkeypatch.setattr(chat_pipeline, "_resolve_thread_selection", _no_resolved)
    monkeypatch.setattr(chat_pipeline, "_all_files_for_snapshots", _no_snapshot_files)

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


# ---------------------------------------------------------------------------
# Failure-path unit tests — no DB required (FakeBus captures events in-memory)
# ---------------------------------------------------------------------------


class _CapturedEvents:
    """Helper exposing a `.events` list captured from chat_pipeline.safe_publish.

    The legacy fixture wrapped `SseBus(pool)` and inspected its `.events`
    attribute, but chat_pipeline now publishes via the module-level
    `safe_publish` helper from substrate_common. This adapter keeps the
    test surface (`bus.events`) unchanged."""

    def __init__(self) -> None:
        self.events: list[Event] = []


@pytest.fixture()
def fake_bus_class(monkeypatch):
    """Replaces ``chat_pipeline.safe_publish`` with a recording stub so
    tests can inspect emitted events after ``stream_turn`` returns. The
    returned list contains a single ``_CapturedEvents`` instance for
    backwards-compatibility with the prior `fake_bus_class[0].events`
    assertion shape."""
    captured = _CapturedEvents()

    async def _recording_publish(event: Event) -> None:
        captured.events.append(event)

    monkeypatch.setattr(chat_pipeline, "safe_publish", _recording_publish)
    return [captured]


def _patch_no_db_helpers(monkeypatch):
    """Stub all helpers that would hit a real DB or LLM so unit tests stay pure.

    Also stubs ``store.get_pool`` used downstream so tests work without a
    running Postgres instance.
    """
    from src.graph import store as _store

    monkeypatch.setattr(_store, "get_pool", lambda: None)

    async def _fake_embed(text: str) -> list[float]:
        return [0.0] * 768

    async def _fake_retrieve(**kwargs) -> list[dict]:
        return []

    async def _no_resolved(thread_id, user_sub) -> list[str]:
        return []

    async def _no_snapshot_files(sync_ids) -> list[str]:
        return []

    async def _fake_hydrate(node_ids: list[str]) -> list[dict]:
        return []

    monkeypatch.setattr(chat_pipeline, "_embed_query", _fake_embed)
    monkeypatch.setattr(chat_pipeline, "retrieve_context_files", _fake_retrieve)
    monkeypatch.setattr(chat_pipeline, "_resolve_thread_selection", _no_resolved)
    monkeypatch.setattr(chat_pipeline, "_all_files_for_snapshots", _no_snapshot_files)
    monkeypatch.setattr(chat_pipeline, "_hydrate_citations", _fake_hydrate)


@pytest.mark.asyncio(loop_scope="function")
async def test_stream_turn_llm_connect_error_emits_failed_no_raise(monkeypatch, fake_bus_class):
    """Regression: if _stream_dense_llm raises immediately the coroutine must
    not propagate the exception (fire-and-forget) and must emit CHAT_TURN_FAILED
    — preceded by CHAT_TURN_STARTED because the prompt build succeeded."""
    _patch_no_db_helpers(monkeypatch)

    async def _failing_stream(messages: list[dict]) -> AsyncIterator[tuple[str, object]]:
        raise httpx.ConnectError("oops")
        yield  # noqa: RET505 — unreachable yield makes this an async generator

    monkeypatch.setattr(chat_pipeline, "_stream_dense_llm_with_tools", _failing_stream)

    # stream_turn must NOT raise
    await chat_pipeline.stream_turn(
        thread_id=uuid4(),
        user_content="hello",
        sync_ids=["sync-1"],
        graph_context=None,
        user_sub="test-user",
        prior_turns=[],
    )

    assert len(fake_bus_class) == 1, "FakeBus was not instantiated"
    bus = fake_bus_class[0]
    types = [e.type for e in bus.events]
    assert CHAT_TURN_FAILED in types, f"CHAT_TURN_FAILED missing from {types}"
    # started fires before the LLM call; failed follows it
    assert CHAT_TURN_STARTED in types, f"CHAT_TURN_STARTED missing from {types}"
    started_idx = types.index(CHAT_TURN_STARTED)
    failed_idx = types.index(CHAT_TURN_FAILED)
    assert started_idx < failed_idx, "CHAT_TURN_STARTED must precede CHAT_TURN_FAILED"
    # Error message is forwarded to the client
    failed_payload = bus.events[failed_idx].payload
    assert "oops" in failed_payload.get("error", ""), (
        f"expected 'oops' in error payload, got: {failed_payload}"
    )


@pytest.mark.asyncio(loop_scope="function")
async def test_stream_turn_prompt_build_error_emits_failed_no_raise(monkeypatch, fake_bus_class):
    """Regression (Issue 1): an exception thrown DURING the prompt-build phase
    (before the LLM call) must still emit CHAT_TURN_FAILED and must not raise.
    The client must never hang after receiving 202."""
    _patch_no_db_helpers(monkeypatch)

    # The Phase-6 retrieval pipeline runs first; failing it surfaces as the
    # prompt-build error path because nothing downstream of CHAT_TURN_STARTED
    # has fired yet.
    async def _exploding_retrieve(**kwargs) -> list[dict]:
        raise RuntimeError("embed service unavailable")

    monkeypatch.setattr(chat_pipeline, "retrieve_context_files", _exploding_retrieve)

    # stream_turn must NOT raise
    await chat_pipeline.stream_turn(
        thread_id=uuid4(),
        user_content="hello",
        sync_ids=["sync-1"],
        graph_context=None,
        user_sub="test-user",
        prior_turns=[],
    )

    assert len(fake_bus_class) == 1, "FakeBus was not instantiated"
    bus = fake_bus_class[0]
    types = [e.type for e in bus.events]

    # Prompt build failed before CHAT_TURN_STARTED could fire — only
    # CHAT_TURN_FAILED should be in the events list.
    assert CHAT_TURN_FAILED in types, f"CHAT_TURN_FAILED missing from {types}"
    assert CHAT_TURN_COMPLETED not in types, "CHAT_TURN_COMPLETED must not appear"
    assert CHAT_TURN_CHUNK not in types, "CHAT_TURN_CHUNK must not appear"

    failed_payload = bus.events[types.index(CHAT_TURN_FAILED)].payload
    assert "embed service unavailable" in failed_payload.get("error", ""), (
        f"expected embed error in payload, got: {failed_payload}"
    )
