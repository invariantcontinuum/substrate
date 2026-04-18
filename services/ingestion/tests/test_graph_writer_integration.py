import uuid
import pytest
import pytest_asyncio

from src import graph_writer

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def writer_connected():
    """Session-scoped because pytest-asyncio 1.3.0's default function-scoped event loop
    conflicts with the session-scoped graph_pool fixture; use a standalone pool via
    graph_writer.connect() and tear it down at session end."""
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield
    # Do not call graph_writer.disconnect() here: the shared session fixture in
    # test_cleanup.py / test_sync_runs.py / test_sync_issues.py teardown does it.


@pytest.mark.asyncio
async def test_batch_writes_2500_nodes_against_real_age():
    sync_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    nodes = [
        {"file_id": f"integ-{sync_id}-{i}", "name": f"n{i}",
         "type": "code", "domain": "src"}
        for i in range(2500)
    ]

    failed = await graph_writer.write_age_nodes(nodes, sync_id, source_id)
    assert failed == 0

    pool = graph_writer._pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (n:File) WHERE n.sync_id = '{sync_id}' RETURN count(n)
            $$) AS (cnt agtype)"""
        )
        count = int(str(rows[0]["cnt"]))
    assert count == 2500

    # Cleanup — leaves the DB tidy for subsequent runs.
    await graph_writer.cleanup_partial(sync_id)


@pytest.mark.asyncio
async def test_poisoned_row_triggers_per_row_fallback():
    sync_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    nodes = [
        {"file_id": f"poison-{sync_id}-{i}", "name": f"n{i}",
         "type": "code", "domain": "src"}
        for i in range(499)
    ]
    # Inject a node whose file_id contains $$ — this breaks AGE's dollar-quoting
    # in the generated Cypher (SELECT * FROM cypher('substrate', $$ ... $$)) and
    # causes the chunk to fail with a Postgres syntax error. The per-row fallback
    # then runs; the single bad row fails again (for the same reason) and is counted
    # as failed==1 while the 499 good rows write successfully.
    nodes.append({"file_id": "bad$$injection$$", "name": "bad", "type": "code", "domain": "src"})

    failed = await graph_writer.write_age_nodes(nodes, sync_id, source_id)
    assert failed == 1

    pool = graph_writer._pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (n:File) WHERE n.sync_id = '{sync_id}' RETURN count(n)
            $$) AS (cnt agtype)"""
        )
        count = int(str(rows[0]["cnt"]))
    assert count == 499

    await graph_writer.cleanup_partial(sync_id)
