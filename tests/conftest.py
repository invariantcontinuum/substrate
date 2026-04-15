import os
import asyncpg
import pytest_asyncio


def _dsn() -> str:
    url = os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate:substrate@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest_asyncio.fixture(scope="session")
async def db_pool():
    pool = await asyncpg.create_pool(
        _dsn(),
        min_size=1,
        max_size=4,
        server_settings={"search_path": "ag_catalog,public"},
        init=lambda c: c.execute("LOAD 'age';"),
    )
    yield pool
    await pool.close()


@pytest_asyncio.fixture
async def db(db_pool):
    """Per-test transaction that rolls back at teardown."""
    async with db_pool.acquire() as conn:
        tx = conn.transaction()
        await tx.start()
        try:
            yield conn
        finally:
            await tx.rollback()
