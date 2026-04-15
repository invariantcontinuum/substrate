import os
import asyncpg
import pytest_asyncio


def _graph_dsn() -> str:
    url = os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:changeme@localhost:5432/substrate_graph",
    )
    return url.replace("postgresql+asyncpg://", "postgresql://")


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
