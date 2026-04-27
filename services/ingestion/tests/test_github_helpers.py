"""Unit tests for the GitHub REST helpers — auth header behavior + return types.

These guard the two bugs fixed when investigating the 100% NULL
``file_embeddings.last_commit_at`` and empty ``sources.meta`` columns:

1. With an empty token, ``Authorization`` must NOT be sent. Sending the
   literal ``Authorization: Bearer `` makes GitHub return 401 even on
   public endpoints, which the prior silent ``except Exception: pass``
   masked. The fix omits the header entirely so anonymous reads work.

2. ``fetch_commit_date`` must return a ``datetime`` (not a string).
   asyncpg's ``timestamptz`` parameter encoder rejects strings up
   front, so a string return killed the sync once auth started
   working again.
"""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from src.connectors.github import _gh_headers, fetch_commit_date, fetch_repo_metadata


def test_gh_headers_with_token_includes_authorization():
    headers = _gh_headers("ghp_realtoken")
    assert headers["Authorization"] == "Bearer ghp_realtoken"
    assert headers["Accept"] == "application/vnd.github+json"


def test_gh_headers_with_empty_token_omits_authorization():
    headers = _gh_headers("")
    assert "Authorization" not in headers
    assert headers["Accept"] == "application/vnd.github+json"


@pytest.mark.asyncio
async def test_fetch_commit_date_returns_datetime():
    fake_response = httpx.Response(
        200,
        json={"commit": {"committer": {"date": "2026-04-17T08:56:42Z"}}},
        request=httpx.Request("GET", "https://api.github.com/x"),
    )
    with patch("src.connectors.github.get_client") as get_client:
        client = AsyncMock()
        client.get = AsyncMock(return_value=fake_response)
        get_client.return_value = client
        result = await fetch_commit_date("o", "r", "main", "")
    assert isinstance(result, datetime)
    assert result == datetime(2026, 4, 17, 8, 56, 42, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_fetch_commit_date_handles_missing_field():
    fake_response = httpx.Response(
        200, json={"commit": {}},
        request=httpx.Request("GET", "https://api.github.com/x"),
    )
    with patch("src.connectors.github.get_client") as get_client:
        client = AsyncMock()
        client.get = AsyncMock(return_value=fake_response)
        get_client.return_value = client
        result = await fetch_commit_date("o", "r", "main", "")
    assert result is None


@pytest.mark.asyncio
async def test_fetch_commit_date_returns_none_on_401():
    fake_response = httpx.Response(
        401, text="Bad credentials",
        request=httpx.Request("GET", "https://api.github.com/x"),
    )
    with patch("src.connectors.github.get_client") as get_client:
        client = AsyncMock()
        client.get = AsyncMock(return_value=fake_response)
        get_client.return_value = client
        result = await fetch_commit_date("o", "r", "main", "")
    assert result is None  # graceful, but the warning log proves it wasn't silent.


@pytest.mark.asyncio
async def test_fetch_repo_metadata_returns_empty_dict_on_404():
    fake_response = httpx.Response(
        404, text="Not Found",
        request=httpx.Request("GET", "https://api.github.com/x"),
    )
    with patch("src.connectors.github.get_client") as get_client:
        client = AsyncMock()
        client.get = AsyncMock(return_value=fake_response)
        get_client.return_value = client
        result = await fetch_repo_metadata("o", "r", "")
    assert result == {}
