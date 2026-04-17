"""PATCH /api/sources/{id} — partial update of label/enabled/config subtree.

Shallow-merges top-level config keys; retention subkey merges one level deep.
Validates positive integers for retention numerics.

Follows the established ingestion test pattern: calls the module-level
update_source_impl() helper directly against the real DB rather than
mounting the full FastAPI app (whose lifespan starts background
runner/scheduler tasks that are not needed here).
"""
import json
import uuid
import pytest
import pytest_asyncio

from src import graph_writer
from src.sources_patch import update_source_impl, SourcePatch, SourceConfigPatch, RetentionOverridesPatch
from fastapi import HTTPException

pytestmark = pytest.mark.asyncio(loop_scope="session")


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_pool(graph_pool):
    """Ensure graph_writer pool is initialised before any test in this module."""
    if graph_writer._pool is None:
        from tests.conftest import graph_dsn
        await graph_writer.connect(graph_dsn())
    yield


@pytest_asyncio.fixture
async def seeded_source(graph_pool):
    """Returns a source_id for a freshly-inserted source with config {'existing_key': 'keep'}."""
    source_id = str(uuid.uuid4())
    async with graph_pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO sources (id, name, url, config, enabled, source_type, owner) "
            "VALUES ($1::uuid, 'test-label', 'https://example.com/x.git', $2::jsonb, true, 'github_repo', 'patch-test')",
            source_id, json.dumps({"existing_key": "keep"}),
        )
    yield source_id
    async with graph_pool.acquire() as conn:
        await conn.execute("DELETE FROM sources WHERE id=$1::uuid", source_id)


async def test_patch_label_only(graph_pool, seeded_source):
    patch = SourcePatch(label="renamed")
    result = await update_source_impl(graph_pool, seeded_source, patch)
    assert result["name"] == "renamed"


async def test_patch_retention_merges_jsonb(graph_pool, seeded_source):
    patch = SourcePatch(
        config=SourceConfigPatch(
            retention=RetentionOverridesPatch(age_days=60, never_prune=False)
        )
    )
    result = await update_source_impl(graph_pool, seeded_source, patch)
    assert result["config"]["retention"]["age_days"] == 60
    assert result["config"]["existing_key"] == "keep"


async def test_patch_rejects_non_positive_retention_ints(graph_pool, seeded_source):
    """Pydantic raises ValidationError (422) for age_days=0."""
    import pydantic
    with pytest.raises(pydantic.ValidationError):
        SourcePatch(
            config=SourceConfigPatch(
                retention=RetentionOverridesPatch(age_days=0)
            )
        )


async def test_patch_unknown_source_returns_404(graph_pool):
    patch = SourcePatch(label="x")
    with pytest.raises(HTTPException) as exc_info:
        await update_source_impl(graph_pool, "00000000-0000-0000-0000-000000000000", patch)
    assert exc_info.value.status_code == 404
