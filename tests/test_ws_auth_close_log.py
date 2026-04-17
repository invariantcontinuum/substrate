"""WS auth-close structured log (P1.10-a).

Verifies auth failures emit logger.info("ws_auth_closed", ...) with right fields
before WebSocket closes, and that no token body or user identity appears in log fields.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from src.main import handle_ws_auth_failure


@pytest.mark.asyncio
async def test_logs_and_closes_with_structured_fields():
    ws = AsyncMock()
    ws.url.path = "/api/graph/ws"
    ws.client = MagicMock()
    ws.client.host = "10.0.0.1"

    with patch("src.main.logger") as mock_logger:
        await handle_ws_auth_failure(ws, reason="token_expired")

    mock_logger.info.assert_called_once_with(
        "ws_auth_closed",
        path="/api/graph/ws",
        reason="token_expired",
        close_code=4401,
        client="10.0.0.1",
    )
    ws.close.assert_awaited_once_with(code=4401)


@pytest.mark.asyncio
async def test_logs_client_none_when_client_missing():
    ws = AsyncMock()
    ws.url.path = "/api/graph/ws"
    ws.client = None

    with patch("src.main.logger") as mock_logger:
        await handle_ws_auth_failure(ws, reason="no_token")

    call_kwargs = mock_logger.info.call_args.kwargs
    assert call_kwargs["client"] is None
    assert call_kwargs["reason"] == "no_token"


@pytest.mark.asyncio
async def test_no_token_or_user_id_in_log_fields():
    ws = AsyncMock()
    ws.url.path = "/api/graph/ws"
    ws.client = MagicMock(host="10.0.0.1")

    with patch("src.main.logger") as mock_logger:
        await handle_ws_auth_failure(ws, reason="token_invalid")

    call_kwargs = mock_logger.info.call_args.kwargs
    for leaked in ("token", "access_token", "user_id", "sub", "email"):
        assert leaked not in call_kwargs
