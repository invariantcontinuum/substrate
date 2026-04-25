"""Integration + unit tests for ``src.graph.chat_pipeline`` helpers and
the scoped retrieval query in ``chat_store.search_scoped``. The prompt-
budget helpers are pure functions and run without a DB; the
citation-hydration and scoped-retrieval tests use the real Postgres
fixture from ``conftest.py``."""
from __future__ import annotations

import pytest
import pytest_asyncio

from src.config import settings
from src.graph import chat_pipeline
from src.graph.chat_store import search_scoped

_async = pytest.mark.asyncio(loop_scope="session")


# ---------------------------------------------------------------------------
# _build_prompt — char budget
# ---------------------------------------------------------------------------


def test_build_prompt_respects_char_budget(monkeypatch):
    # Small budget forces the trimming loop to actually execute.
    monkeypatch.setattr(settings, "chat_total_budget_chars", 2_000)
    # Ensure the history trim logic has plenty of prior turns to drop first.
    monkeypatch.setattr(settings, "chat_history_turns", 10)

    retrieved = [
        {
            "id": f"node-{i}",
            "name": f"name-{i}",
            "type": "file",
            "description": "x" * 400,  # trimmed to 200 in _node_block
        }
        for i in range(12)
    ]
    prior_turns = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": "y" * 300}
        for i in range(10)
    ]

    messages = chat_pipeline._build_prompt(
        user_content="the question",
        prior_turns=prior_turns,
        retrieved=retrieved,
    )

    # System prompt is immutable; body + history must fit under budget.
    # The loop trims prior turns first, then per-node entries, so the
    # total (including system) should land within a small overshoot.
    total = chat_pipeline._char_cost(messages)
    system_len = len(settings.chat_system_instruction)
    # Budget applies to non-system portion; system_len is the unavoidable
    # overhead, everything else is shrinkable.
    assert total - system_len <= settings.chat_total_budget_chars
    # The last message is the user turn and must still contain the question.
    assert messages[-1]["role"] == "user"
    assert "the question" in messages[-1]["content"]


# ---------------------------------------------------------------------------
# _hydrate_citations — unknown ids dropped, output order follows input
# ---------------------------------------------------------------------------


@_async
async def test_hydrate_citations_skips_unknown_ids(app_pool, monkeypatch):
    known_a = "11111111-1111-1111-1111-111111111111"
    known_b = "22222222-2222-2222-2222-222222222222"
    unknown = "33333333-3333-3333-3333-333333333333"

    class _FakeRow(dict):
        def __getitem__(self, key):
            return super().__getitem__(key)

    call_count = {"n": 0}

    async def _fake_fetch(self, query, *args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            # First fetch: AGE cypher MATCH — return agtype-shaped rows for
            # the two known ids; unknown id deliberately absent.
            return [
                _FakeRow(
                    file_id=f'"{known_a}"',
                    name='"alpha"',
                    type='"file"',
                ),
                _FakeRow(
                    file_id=f'"{known_b}"',
                    name='"beta"',
                    type='"file"',
                ),
            ]
        # Second fetch: relational enrichment — return rows that the
        # enrichment loop expects (id, file_path, language, excerpt).
        return [
            _FakeRow(id=known_a, file_path="a.py", language="python", excerpt=""),
            _FakeRow(id=known_b, file_path="b.py", language="python", excerpt=""),
        ]

    # Patch asyncpg.Connection.fetch to the canned response so we don't
    # have to seed AGE nodes (AGE MERGE inside a rollbackable fixture
    # is notoriously fragile). The UUID-validation + ordering logic
    # under test lives entirely in _hydrate_citations itself.
    import asyncpg.connection

    monkeypatch.setattr(asyncpg.connection.Connection, "fetch", _fake_fetch)

    # Input order: [unknown, known_b, "not-a-uuid", known_a]. Expected
    # output order (unknowns + non-UUIDs dropped): [known_b, known_a].
    result = await chat_pipeline._hydrate_citations(
        [unknown, known_b, "not-a-uuid", known_a],
    )
    assert [c["node_id"] for c in result] == [known_b, known_a]
    assert [c["name"] for c in result] == ["beta", "alpha"]
    assert all(c["type"] == "file" for c in result)


# ---------------------------------------------------------------------------
# search_scoped — sync_id filter isolation
# ---------------------------------------------------------------------------


@_async
async def test_search_scoped_filters_by_sync_ids(
    app_pool, seeded_two_sync_runs,
):
    sid_a, sid_b = seeded_two_sync_runs
    dim = settings.embedding_dim
    zero_embedding = [0.0] * dim

    rows_a = await search_scoped(
        query_embedding=zero_embedding, sync_ids=[sid_a], limit=10,
    )
    rows_b = await search_scoped(
        query_embedding=zero_embedding, sync_ids=[sid_b], limit=10,
    )

    assert len(rows_a) == 1
    assert len(rows_b) == 1
    assert rows_a[0]["file_path"] == "a.py"
    assert rows_b[0]["file_path"] == "b.py"

    ids_a = {r["id"] for r in rows_a}
    ids_b = {r["id"] for r in rows_b}
    assert ids_a.isdisjoint(ids_b)
