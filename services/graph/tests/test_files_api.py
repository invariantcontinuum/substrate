"""Integration tests for /api/files/{file_id}/content."""
from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_missing_file_returns_404(async_client):
    fake = str(uuid.uuid4())
    r = await async_client.get(
        f"/api/files/{fake}/content",
        headers={"X-User-Sub": "user-a"},
    )
    assert r.status_code == 404


async def test_returns_content_when_owned(async_client, seed_one_file):
    file_id = seed_one_file["file_id"]
    r = await async_client.get(
        f"/api/files/{file_id}/content",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["file_id"] == file_id
    assert body["path"] == seed_one_file["path"]
    assert "alpha\nbeta\ngamma" in body["content"]
    assert body["total_lines"] == 3
    assert body["truncated"] is False


async def test_returns_404_for_other_users_file(async_client, seed_one_file):
    file_id = seed_one_file["file_id"]
    r = await async_client.get(
        f"/api/files/{file_id}/content",
        headers={"X-User-Sub": "stranger"},
    )
    assert r.status_code == 404
