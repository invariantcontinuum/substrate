"""Tests for /api/export endpoints (loaded / community / sync)."""
from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_export_loaded_returns_streamed_json(async_client, seed_one_file):
    r = await async_client.get(
        f"/api/export/loaded?sync_ids={seed_one_file['sync_id']}",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200, r.text
    doc = json.loads(r.text)
    assert doc["meta"]["kind"] == "loaded"
    assert doc["meta"]["file_count"] >= 1
    assert any(f["file_id"] == seed_one_file["file_id"] for f in doc["files"])
    inline = next(
        f for f in doc["files"] if f["file_id"] == seed_one_file["file_id"]
    )
    assert "alpha\nbeta\ngamma" in inline["content"]
    assert inline["total_lines"] == 3


async def test_export_too_many_files_rejected(async_client, monkeypatch, seed_one_file):
    from src.config import settings
    monkeypatch.setattr(settings, "export_max_files", 0)
    r = await async_client.get(
        f"/api/export/loaded?sync_ids={seed_one_file['sync_id']}",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    # ValidationError → 400 (substrate_common convention)
    assert r.status_code == 400, r.text


async def test_export_sync_404_for_other_users_sync(async_client, seed_one_file):
    r = await async_client.get(
        f"/api/export/sync/{seed_one_file['sync_id']}",
        headers={"X-User-Sub": "stranger"},
    )
    assert r.status_code == 404


async def test_export_sync_owned_returns_files(async_client, seed_one_file):
    r = await async_client.get(
        f"/api/export/sync/{seed_one_file['sync_id']}",
        headers={"X-User-Sub": seed_one_file["user_sub"]},
    )
    assert r.status_code == 200, r.text
    doc = json.loads(r.text)
    assert doc["meta"]["kind"] == "sync"
    assert doc["meta"]["file_count"] >= 1
