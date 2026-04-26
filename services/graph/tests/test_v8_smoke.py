"""V8 migration smoke: tables/columns/indexes exist after Flyway migrate.

Uses the project's `db` fixture (per-test transaction over the live
substrate_graph pool from conftest). The CI matrix scopes graph to
non-DB tests until a Postgres+AGE service lands (commit 006a342),
so these tests run only in environments with the compose stack up.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_runtime_config_table_exists(db):
    cols = await db.fetch(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name = 'runtime_config' ORDER BY column_name"
    )
    names = {r["column_name"] for r in cols}
    assert {"scope", "key", "value", "updated_by", "updated_at"} <= names


async def test_runtime_config_scope_index_exists(db):
    row = await db.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'runtime_config' AND indexname = 'runtime_config_scope_idx'"
    )
    assert row is not None, "runtime_config_scope_idx missing"


async def test_chat_message_evidence_table_exists(db):
    cols = await db.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'chat_message_evidence'"
    )
    names = {r["column_name"] for r in cols}
    assert {"id", "message_id", "filepath", "start_line", "end_line", "reason"} <= names


async def test_chat_message_context_table_exists(db):
    cols = await db.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'chat_message_context'"
    )
    names = {r["column_name"] for r in cols}
    assert {
        "message_id", "system_prompt", "history", "files",
        "tokens_in", "tokens_out", "duration_ms",
    } <= names


async def test_chat_threads_context_files_column(db):
    col = await db.fetchrow(
        "SELECT data_type FROM information_schema.columns "
        "WHERE table_name = 'chat_threads' AND column_name = 'context_files'"
    )
    assert col is not None and col["data_type"] == "jsonb"


async def test_chat_messages_supersession_columns(db):
    rows = await db.fetch(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'chat_messages' "
        "AND column_name = ANY($1::text[])",
        ["superseded_by", "supersedes"],
    )
    assert {r["column_name"] for r in rows} == {"superseded_by", "supersedes"}


async def test_file_embeddings_description_tsv_column(db):
    col = await db.fetchrow(
        "SELECT data_type, is_generated FROM information_schema.columns "
        "WHERE table_name = 'file_embeddings' AND column_name = 'description_tsv'"
    )
    assert col is not None
    assert col["data_type"] == "tsvector"
    assert col["is_generated"] == "ALWAYS"


async def test_file_embeddings_description_tsv_gin_index(db):
    row = await db.fetchrow(
        "SELECT 1 FROM pg_indexes "
        "WHERE tablename = 'file_embeddings' "
        "AND indexname = 'file_embeddings_description_tsv_idx'"
    )
    assert row is not None, "GIN index on description_tsv missing"


async def test_runtime_overlay_round_trip(db):
    """Insert into runtime_config; RuntimeOverlay.refresh() reads it back.

    The `db` fixture is a per-test transaction, so the row never escapes
    the test. RuntimeOverlay's `acquire` context manager works on the
    asyncpg connection directly here.
    """
    from substrate_common.config.runtime_overlay import RuntimeOverlay

    await db.execute(
        "INSERT INTO runtime_config(scope, key, value, updated_by) "
        "VALUES ('graph', 'chat_top_k', '15'::jsonb, 'test') "
        "ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value"
    )

    class _ConnPool:
        def __init__(self, conn):
            self._conn = conn

        def acquire(self):
            return _ConnAcq(self._conn)

    class _ConnAcq:
        def __init__(self, conn):
            self._conn = conn

        async def __aenter__(self):
            return self._conn

        async def __aexit__(self, *_):
            return None

    ro = RuntimeOverlay(scope="graph", pool=_ConnPool(db))
    await ro.refresh()
    snap = ro.snapshot()
    assert snap.get("chat_top_k") == 15
