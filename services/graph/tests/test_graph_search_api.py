"""Smoke tests for /api/graph/search."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_empty_query_returns_400(async_client):
    r = await async_client.get(
        "/api/graph/search?q=",
        headers={"X-User-Sub": "user-search"},
    )
    assert r.status_code == 400


async def test_query_with_no_matches_returns_empty_hits(async_client):
    r = await async_client.get(
        "/api/graph/search?q=zzzzzznoexist",
        headers={"X-User-Sub": "user-search"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["hits"] == []


async def test_query_returns_owned_match(async_client, seed_one_file):
    # ``demo`` substring matches both the file_path and the name
    # ``demo.txt`` of the seeded row.
    r = await async_client.get(
        "/api/graph/search?q=demo",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["hits"], list)
    matched = [h for h in body["hits"] if h["node_id"] == seed_one_file["file_id"]]
    assert len(matched) == 1
    hit = matched[0]
    assert hit["filepath"] == seed_one_file["path"]
    assert hit["name"] == "demo.txt"
    assert hit["type"] == "file"
    # community_index defaults to -1 when no leiden_cache row exists for
    # this user yet (the seed fixture does not compute Leiden).
    assert hit["community_index"] == -1


async def test_query_excludes_other_users_files(async_client, seed_one_file):
    r = await async_client.get(
        "/api/graph/search?q=demo",
        headers={"X-User-Sub": "stranger-user"},
    )
    assert r.status_code == 200
    body = r.json()
    assert all(
        h["node_id"] != seed_one_file["file_id"] for h in body["hits"]
    )
