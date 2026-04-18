import os
import uuid
import json
import asyncpg
import pytest
import pytest_asyncio
from dataclasses import dataclass, field


def _graph_dsn() -> str:
    url = os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:changeme@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


def graph_dsn() -> str:
    return _graph_dsn()


@pytest_asyncio.fixture(scope="session")
async def graph_pool():
    pool = await asyncpg.create_pool(
        _graph_dsn(),
        min_size=1,
        max_size=4,
        server_settings={"search_path": "ag_catalog,public"},
        init=lambda c: c.execute("LOAD 'age';"),
    )
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def db(graph_pool):
    async with graph_pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        try:
            yield conn
        finally:
            await tx.rollback()


@dataclass
class _DBFixture:
    pool: object
    _source_ids: list = field(default_factory=list)
    cleaned_ids: list = field(default_factory=list)

    async def add_source(self, config: dict | None = None) -> str:
        source_id = str(uuid.uuid4())
        short = source_id[:8]
        async with self.pool.acquire() as conn:
            await conn.execute(
                """INSERT INTO sources (id, source_type, owner, name, url, config)
                   VALUES ($1::uuid, 'github_repo', 'retention-test', $2, $3, $4::jsonb)""",
                source_id,
                f"repo-{short}",
                f"https://example.com/{short}.git",
                json.dumps(config or {}),
            )
        self._source_ids.append(source_id)
        return source_id

    async def add_completed_sync(self, source_id: str, completed_at=None) -> str:
        sync_id = str(uuid.uuid4())
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO sync_runs (id, source_id, status, completed_at, config_snapshot)
                VALUES ($1::uuid, $2::uuid, 'completed', $3, '{}'::jsonb)
                """,
                sync_id, source_id, completed_at,
            )
        return sync_id


@pytest_asyncio.fixture
async def db_with_sync_runs(graph_pool):
    """Fixture providing a seeded DB helper for retention tests.

    Purges all retention-test sources (and their cascaded sync_runs) both before
    and after each test so every test sees a clean slate. Uses the live
    home-stack Postgres — no mocks permitted per workspace rules.
    """
    # The graph_writer module-level pool must be connected for prune_retention_once.
    from src import graph_writer
    if graph_writer._pool is None:
        await graph_writer.connect(graph_dsn())

    # Pre-test cleanup: wipe any retention-test rows left by a prior failed run.
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE owner = 'retention-test'"
        )

    fixture = _DBFixture(pool=graph_pool)
    yield fixture

    # Post-test cleanup: remove all sources (and cascaded sync_runs) this test added.
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM sources WHERE owner = 'retention-test'"
        )
