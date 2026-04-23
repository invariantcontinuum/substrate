import json
import pytest
import pytest_asyncio
from src import graph_writer, sync_runs, sync_issues

ISSUE_CAP = 1000

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _json_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        return json.loads(value)
    return {}


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup(graph_pool):
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield


async def test_record_issue_basic():
    src_id = await graph_writer.ensure_source("github_repo", "octo", "issues", "u")
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    sid = await sync_runs.create_sync_run(src_id, {}, "user")
    await sync_issues.record_issue(sid, "warning", "embedding", "embedding_400", "boom", {"batch": 7})
    async with graph_writer._pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT level, phase, code, context FROM sync_issues WHERE sync_id=$1::uuid", sid
        )
        assert row["level"] == "warning"
        assert _json_object(row["context"])["batch"] == 7
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)


async def test_issue_cap_emits_truncation_marker():
    src_id = await graph_writer.ensure_source("github_repo", "octo", "cap", "u")
    async with graph_writer._pool.acquire() as conn:
        await conn.execute("DELETE FROM sync_runs WHERE source_id = $1::uuid", src_id)
    sid = await sync_runs.create_sync_run(src_id, {}, "user")
    for i in range(ISSUE_CAP + 5):
        await sync_issues.record_issue(sid, "warning", "parsing", "noise", f"msg {i}", {})
    async with graph_writer._pool.acquire() as conn:
        cnt = await conn.fetchval("SELECT count(*) FROM sync_issues WHERE sync_id=$1::uuid", sid)
        assert cnt == ISSUE_CAP + 1, f"expected {ISSUE_CAP+1} rows (cap + 1 marker), got {cnt}"
        markers = await conn.fetchval(
            "SELECT count(*) FROM sync_issues WHERE sync_id=$1::uuid AND code='truncation_marker'",
            sid,
        )
        assert markers == 1
        stats_raw = await conn.fetchval("SELECT stats FROM sync_runs WHERE id=$1::uuid", sid)
        stats = _json_object(stats_raw)
        assert stats.get("issues_suppressed", 0) >= 5
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", src_id)
