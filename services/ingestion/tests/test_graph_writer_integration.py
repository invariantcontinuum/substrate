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


@pytest.mark.asyncio
async def test_write_age_symbol_nodes_round_trip():
    """Write Symbol vertices, query them back, then verify cleanup_partial wipes them."""
    sync_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())
    symbols = [
        {
            "symbol_id": f"src/{i}.py#sym{i}@{i + 1}",
            "file_path": f"src/{i}.py",
            "name": f"sym{i}",
            "kind": "function" if i % 2 == 0 else "class",
            "line": i + 1,
            "domain": "src",
        }
        for i in range(3)
    ]

    failed = await graph_writer.write_age_symbol_nodes(symbols, sync_id, source_id)
    assert failed == 0

    pool = graph_writer._pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (s:Symbol) WHERE s.sync_id = '{sync_id}' RETURN count(s)
            $$) AS (cnt agtype)"""
        )
        count = int(str(rows[0]["cnt"]))
    assert count == 3

    # Spot-check one property round-trip
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (s:Symbol {{sync_id: '{sync_id}', symbol_id: 'src/0.py#sym0@1'}})
                RETURN s.kind, s.line, s.name, s.file_path
            $$) AS (kind agtype, line agtype, name agtype, fp agtype)"""
        )
        assert str(rows[0]["kind"]) == '"function"'
        assert str(rows[0]["line"]) == "1"
        assert str(rows[0]["name"]) == '"sym0"'
        assert str(rows[0]["fp"]) == '"src/0.py"'

    # cleanup_partial uses an unlabeled MATCH — should drop Symbols too.
    await graph_writer.cleanup_partial(sync_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (s:Symbol) WHERE s.sync_id = '{sync_id}' RETURN count(s)
            $$) AS (cnt agtype)"""
        )
        count_after = int(str(rows[0]["cnt"]))
    assert count_after == 0


@pytest.mark.asyncio
async def test_write_age_defines_edges_round_trip():
    """Write File+Symbol+DEFINES, verify edges exist, then cleanup_partial wipes it all."""
    sync_id = str(uuid.uuid4())
    source_id = str(uuid.uuid4())

    # Files (use a distinct file_id per row so MATCH is unambiguous).
    file_nodes = [
        {"file_id": f"integ-defines-{sync_id}-f{i}", "name": f"f{i}.py",
         "type": "source", "domain": "src"}
        for i in range(2)
    ]
    assert await graph_writer.write_age_nodes(file_nodes, sync_id, source_id) == 0

    # Symbols — two per file.
    symbols = []
    for fi in range(2):
        for si in range(2):
            symbols.append({
                "symbol_id": f"integ-defines-{sync_id}-s{fi}-{si}",
                "file_path": f"src/f{fi}.py",
                "name": f"sym{fi}_{si}",
                "kind": "function",
                "line": fi * 10 + si + 1,
                "domain": "src",
            })
    assert await graph_writer.write_age_symbol_nodes(symbols, sync_id, source_id) == 0

    # DEFINES edges — link each symbol to its parent file.
    edges = []
    for fi in range(2):
        for si in range(2):
            edges.append({
                "source_id": f"integ-defines-{sync_id}-f{fi}",
                "target_id": f"integ-defines-{sync_id}-s{fi}-{si}",
            })
    failed = await graph_writer.write_age_defines_edges(edges, sync_id, source_id)
    assert failed == 0

    pool = graph_writer._pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (f:File {{sync_id: '{sync_id}'}})-[r:DEFINES {{sync_id: '{sync_id}'}}]->(s:Symbol {{sync_id: '{sync_id}'}})
                RETURN count(r)
            $$) AS (cnt agtype)"""
        )
        edge_count = int(str(rows[0]["cnt"]))
    assert edge_count == 4

    # cleanup_partial DETACH DELETEs both File and Symbol vertices, which
    # also wipes all DEFINES and DEPENDS_ON edges incident to them.
    await graph_writer.cleanup_partial(sync_id)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT * FROM cypher('substrate', $$
                MATCH (n) WHERE n.sync_id = '{sync_id}' RETURN count(n)
            $$) AS (cnt agtype)"""
        )
        leftover = int(str(rows[0]["cnt"]))
    assert leftover == 0
