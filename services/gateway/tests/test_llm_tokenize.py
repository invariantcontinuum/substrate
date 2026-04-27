"""Tests for POST /api/llm/dense/tokenize.

Uses monkeypatch to intercept the two httpx.AsyncClient calls made inside
the handler:
  1. POST graph_service_url/internal/chat/preview-prompt  -> fixed prompt
  2. POST llm_dense_url/tokenize                          -> token list

AUTH_DISABLED=true bypasses JWT so the test doesn't need a real Keycloak.
"""
from __future__ import annotations

import json
from importlib import reload
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient, Response, Request


# ---------------------------------------------------------------------------
# App fixture — reload with AUTH_DISABLED so current_user returns a stub claim.
# ---------------------------------------------------------------------------


def _reload_app():
    import src.config
    import src.main

    reload(src.config)
    reload(src.main)
    return src.main.app


@pytest.fixture
def tokenize_app(monkeypatch):
    monkeypatch.setenv("AUTH_DISABLED", "true")
    app = _reload_app()
    try:
        yield app
    finally:
        monkeypatch.delenv("AUTH_DISABLED", raising=False)
        _reload_app()


# ---------------------------------------------------------------------------
# httpx.AsyncClient mock helpers
# ---------------------------------------------------------------------------

_PREVIEW_BODY = {"prompt": "hello world", "prompt_chars": 11}
_TOKENIZE_BODY = {"tokens": list(range(50))}


def _make_response(status: int, body: Any) -> Response:
    content = json.dumps(body).encode()
    return Response(
        status_code=status,
        content=content,
        headers={"content-type": "application/json"},
        request=Request("POST", "http://mock"),
    )


class _SequentialMockClient:
    """Returns pre-configured responses in call order.

    The tokenize handler creates two AsyncClient context managers:
      call 0 -> graph preview
      call 1 -> dense tokenize (or error simulation)
    """

    def __init__(self, responses: list[Response]):
        self._responses = responses
        self._call = 0

    def __call__(self, *args: Any, **kwargs: Any):
        resp = self._responses[self._call]
        self._call += 1
        return _FakeContext(resp)


class _FakeContext:
    def __init__(self, resp: Response):
        self._resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args: Any):
        return False

    async def post(self, url: str, **kwargs: Any) -> Response:
        return self._resp


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tokenize_returns_count(monkeypatch, tokenize_app):
    """Happy path: graph preview + LLM tokenize both succeed."""
    import httpx

    mock_client = _SequentialMockClient([
        _make_response(200, _PREVIEW_BODY),
        _make_response(200, _TOKENIZE_BODY),
    ])
    monkeypatch.setattr(httpx, "AsyncClient", mock_client)

    transport = ASGITransport(app=tokenize_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/llm/dense/tokenize",
            json={"entries": [], "message": "hello"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tokens"] == 50
    assert body["prompt_chars"] == 11
    assert body["error"] is None


@pytest.mark.asyncio
async def test_tokenize_falls_back_when_upstream_down(monkeypatch, tokenize_app):
    """Graceful degradation: graph preview ok, LLM tokenize 503."""
    import httpx

    mock_client = _SequentialMockClient([
        _make_response(200, _PREVIEW_BODY),
        _make_response(503, {"error": "model not loaded"}),
    ])
    monkeypatch.setattr(httpx, "AsyncClient", mock_client)

    transport = ASGITransport(app=tokenize_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/llm/dense/tokenize",
            json={"entries": [], "message": "hello"},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tokens"] is None
    assert body["error"] == "tokenizer_unreachable"
    assert body["prompt_chars"] == 11


