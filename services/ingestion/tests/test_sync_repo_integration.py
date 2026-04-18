"""End-to-end: handle_sync on a bundled fixture repo (no GitHub API call),
writes to the live PG+AGE home-stack (per monorepo convention for
ingestion integration tests), assert file + symbol nodes + depends +
defines edges land in AGE as expected.

`_clone_repo` + the GitHubConnector's materialize path are bypassed by
monkeypatching the CONNECTORS registry so the fixture tree is used
directly. The test then exercises the real `handle_sync` from
`src.jobs.sync` end to end: build_graph → File/Symbol upserts → DEPENDS_ON
+ DEFINES edges → AGE round-trip.
"""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from src import events, graph_writer
from src.config import settings
from src.connectors.base import MaterializedTree
from src.jobs import sync as jobs_sync
from src.jobs.sync import handle_sync
from substrate_common.logging import configure_logging

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_writer(graph_pool):
    """Bring the module-level graph_writer pool + SSE bus up for the whole test
    session so handle_sync can reach PG+AGE without reinventing the wiring.

    Also runs `configure_logging("ingestion")` so structlog is wired the same
    way as prod. Several log sites pass an explicit `event=` kwarg alongside
    the positional event name; the prod pipeline routes that through
    `EventRenamer`, but the default structlog wrapper used by pytest raises
    `got multiple values for argument 'event'`. Without this, handle_sync
    fails at the first log call.
    """
    configure_logging("ingestion")
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    if events._bus is None:
        events.init_bus()
    yield


@pytest.fixture
def bundled_repo(tmp_path: Path) -> str:
    src = Path(__file__).parent / "fixtures" / "sync_integration"
    dst = tmp_path / "repo"
    shutil.copytree(src, dst)
    return str(dst)


async def _count_age(conn, cypher: str) -> int:
    """Run a count cypher, parse the single agtype row as int."""
    rows = await conn.fetch(
        f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (cnt agtype)"
    )
    return int(str(rows[0]["cnt"]))


async def test_handle_sync_writes_file_and_symbol_nodes(
    monkeypatch, bundled_repo
):
    # ---------- 1. Monkeypatch the connector: skip GitHub, return fixture tree.
    fake_materialize = AsyncMock(
        return_value=MaterializedTree(
            root_dir=bundled_repo,
            file_paths=[],
            ref="integration-test-ref",
            meta={},
        )
    )

    class _StubConnector:
        async def materialize(self, source: dict, scratch_dir: str) -> MaterializedTree:
            return await fake_materialize(source, scratch_dir)

    monkeypatch.setattr(
        jobs_sync, "CONNECTORS", {"github_repo": _StubConnector()}
    )

    # Point embeddings at localhost since we run outside Docker; lazy-lamacpp
    # on the host exposes 8101 directly and is already up per the task context.
    monkeypatch.setattr(
        settings, "embedding_url", "http://localhost:8101/v1/embeddings"
    )

    # ---------- 2. Bootstrap a source + a pending sync_run row directly.
    pool = graph_writer.get_pool()
    source_id = str(uuid.uuid4())
    owner = f"sync-integ-{source_id[:8]}"
    repo_name = f"repo-{source_id[:8]}"
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO sources (id, source_type, owner, name, url, config)
               VALUES ($1::uuid, 'github_repo', $2, $3, $4, '{}'::jsonb)""",
            source_id, owner, repo_name,
            f"https://example.com/{owner}/{repo_name}.git",
        )
        sync_id = await conn.fetchval(
            """INSERT INTO sync_runs (source_id, status, config_snapshot)
               VALUES ($1::uuid, 'pending', '{}'::jsonb)
               RETURNING id::text""",
            source_id,
        )
        source_row = await conn.fetchrow(
            "SELECT id::text, source_type, owner, name FROM sources WHERE id=$1::uuid",
            source_id,
        )

    source_dict = dict(source_row)

    try:
        # ---------- 3. Run handle_sync end to end.
        await handle_sync(sync_id, source_dict, config_snapshot={})

        # ---------- 4. Verify sync_runs status flipped to 'completed'.
        async with pool.acquire() as conn:
            status = await conn.fetchval(
                "SELECT status FROM sync_runs WHERE id=$1::uuid", sync_id,
            )
            stats_json = await conn.fetchval(
                "SELECT stats FROM sync_runs WHERE id=$1::uuid", sync_id,
            )
        assert status == "completed", f"expected completed, got {status}"
        stats = json.loads(stats_json) if isinstance(stats_json, str) else (stats_json or {})
        # 3 files × 1+ symbol each means nodes >= 3 and symbols >= 2 (main, hello).
        assert stats.get("nodes") == 3, stats
        assert stats.get("symbols", 0) >= 2, stats
        assert stats.get("defines_edges", 0) >= 2, stats

        # ---------- 5. AGE round-trip: File count.
        sync_esc = sync_id  # uuid strings are safe to inline
        async with pool.acquire() as conn:
            file_count = await _count_age(
                conn,
                f"MATCH (f:File) WHERE f.sync_id = '{sync_esc}' RETURN count(f)",
            )
            symbol_count = await _count_age(
                conn,
                f"MATCH (s:Symbol) WHERE s.sync_id = '{sync_esc}' RETURN count(s)",
            )
            defines_count = await _count_age(
                conn,
                f"MATCH (:File {{sync_id: '{sync_esc}'}})"
                f"-[r:DEFINES {{sync_id: '{sync_esc}'}}]->"
                f"(:Symbol {{sync_id: '{sync_esc}'}}) RETURN count(r)",
            )
            depends_count = await _count_age(
                conn,
                f"MATCH (:File {{sync_id: '{sync_esc}'}})"
                f"-[r:DEPENDS_ON {{sync_id: '{sync_esc}'}}]->"
                f"(:File {{sync_id: '{sync_esc}'}}) RETURN count(r)",
            )

        # Fixture shape: main.py + pkg/__init__.py + pkg/helper.py
        # → 3 File vertices.
        assert file_count == 3, f"expected 3 File vertices, got {file_count}"

        # `main`, `hello` are top-level funcs; `__init__.py` is empty so no
        # symbols there. Expect at least 2 Symbol vertices.
        assert symbol_count >= 2, f"expected >= 2 Symbol vertices, got {symbol_count}"

        # At minimum: main.py DEFINES main, pkg/helper.py DEFINES hello.
        assert defines_count >= 2, f"expected >= 2 DEFINES edges, got {defines_count}"

        # main.py → pkg/helper.py via python plugin's dotted-import resolver.
        assert depends_count == 1, f"expected 1 DEPENDS_ON edge, got {depends_count}"

    finally:
        # ---------- 6. Cleanup: wipe AGE vertices + sync_runs + sources row.
        await graph_writer.cleanup_partial(sync_id)
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM sync_issues WHERE sync_id=$1::uuid", sync_id)
            await conn.execute("DELETE FROM sync_runs WHERE id=$1::uuid", sync_id)
            await conn.execute("DELETE FROM sources WHERE id=$1::uuid", source_id)
