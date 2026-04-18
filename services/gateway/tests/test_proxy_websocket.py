import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import WebSocket
from fastapi.websockets import WebSocketDisconnect
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

from src.proxy import proxy_websocket


class _FakeUpstream:
    """Async context manager yielding self; acts as the websockets.connect() return value."""
    def __init__(self, iter_messages=None, send_raises=None):
        self._messages = iter_messages or []
        self._send_raises = send_raises
        self.send = AsyncMock(side_effect=self._send_raises)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def __aiter__(self):
        async def gen():
            for m in self._messages:
                yield m
        return gen()


def _make_ws(receive_side_effects):
    ws = AsyncMock(spec=WebSocket)
    ws.receive_text = AsyncMock(side_effect=receive_side_effects)
    ws.send_text = AsyncMock()
    ws.accept = AsyncMock()
    ws.close = AsyncMock()
    return ws


@pytest.mark.asyncio
async def test_client_normal_disconnect_logs_info():
    ws = _make_ws([WebSocketDisconnect()])
    upstream = _FakeUpstream(iter_messages=[])
    with patch("src.proxy.websockets.connect", return_value=upstream), \
         patch("src.proxy.logger") as logger:
        await proxy_websocket(ws, "http://upstream", "/ws/path", "token")
    calls = [c for c in logger.info.call_args_list if c.args[0] == "ws_relay_client_closed"]
    assert calls, "no ws_relay_client_closed call found"
    assert any(c.kwargs.get("direction") in {"client_to_upstream", "upstream_to_client", "outer"} for c in calls)


@pytest.mark.asyncio
async def test_upstream_closed_error_logs_warning():
    ws = _make_ws([ConnectionClosedError(None, None)])
    upstream = _FakeUpstream()
    with patch("src.proxy.websockets.connect", return_value=upstream), \
         patch("src.proxy.logger") as logger:
        await proxy_websocket(ws, "http://upstream", "/ws/path", "token")
    calls = [c for c in logger.warning.call_args_list if c.args[0] == "ws_relay_upstream_closed_error"]
    assert calls, "no ws_relay_upstream_closed_error call found"
    assert any(c.kwargs.get("direction") for c in calls)
    assert any("error" in c.kwargs and c.kwargs["error"] for c in calls)


@pytest.mark.asyncio
async def test_unexpected_exception_logs_warning():
    ws = _make_ws([RuntimeError("boom")])
    upstream = _FakeUpstream()
    with patch("src.proxy.websockets.connect", return_value=upstream), \
         patch("src.proxy.logger") as logger:
        await proxy_websocket(ws, "http://upstream", "/ws/path", "token")
    calls = [c for c in logger.warning.call_args_list if c.args[0] == "ws_relay_unexpected"]
    assert calls, "no ws_relay_unexpected call found"
    assert any(c.kwargs.get("direction") for c in calls)
    assert any("error" in c.kwargs and c.kwargs["error"] for c in calls)


@pytest.mark.asyncio
async def test_close_failure_logs_warning():
    ws = _make_ws([WebSocketDisconnect()])
    ws.close.side_effect = RuntimeError("close failed")
    upstream = _FakeUpstream()
    with patch("src.proxy.websockets.connect", return_value=upstream), \
         patch("src.proxy.logger") as logger:
        await proxy_websocket(ws, "http://upstream", "/ws/path", "token")
    calls = [c for c in logger.warning.call_args_list if c.args[0] == "ws_relay_close_failed"]
    assert calls, "no ws_relay_close_failed call found"
    assert any("error" in c.kwargs and c.kwargs["error"] for c in calls)
