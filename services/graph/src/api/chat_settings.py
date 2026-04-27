"""User chat settings: history window, bulk thread mutations, export."""
from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.api.auth import require_user_sub_strict
from src.graph import store

router = APIRouter()


class ChatSettings(BaseModel):
    history_turns: Annotated[int, Field(ge=0, le=50)] = 12


@router.get("/api/users/me/chat-settings", response_model=ChatSettings)
async def get_chat_settings(
    x_user_sub: str | None = Header(default=None),
) -> ChatSettings:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT chat_settings FROM user_profiles WHERE user_sub = $1", sub,
        )
    if row is None or row["chat_settings"] is None:
        return ChatSettings()
    return ChatSettings.model_validate(row["chat_settings"])


@router.patch("/api/users/me/chat-settings", response_model=ChatSettings)
async def patch_chat_settings(
    payload: ChatSettings,
    x_user_sub: str | None = Header(default=None),
) -> ChatSettings:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO user_profiles (user_sub, chat_settings) VALUES ($1, $2) "
            "ON CONFLICT (user_sub) DO UPDATE SET chat_settings = EXCLUDED.chat_settings",
            sub, payload.model_dump(),
        )
    return payload


@router.post("/api/chat/threads/delete-all")
async def delete_all_threads(
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        n = await conn.fetchval(
            "WITH d AS (DELETE FROM chat_threads WHERE user_sub = $1 RETURNING 1) "
            "SELECT count(*) FROM d",
            sub,
        )
    return {"deleted": int(n or 0)}


@router.post("/api/chat/threads/archive-all")
async def archive_all_threads(
    x_user_sub: str | None = Header(default=None),
) -> dict[str, Any]:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        n = await conn.fetchval(
            "WITH u AS (UPDATE chat_threads SET archived_at = NOW() "
            " WHERE user_sub = $1 AND archived_at IS NULL RETURNING 1) "
            "SELECT count(*) FROM u",
            sub,
        )
    return {"archived": int(n or 0)}


@router.get("/api/chat/threads/export")
async def export_threads(
    x_user_sub: str | None = Header(default=None),
) -> StreamingResponse:
    sub = require_user_sub_strict(x_user_sub)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        threads = await conn.fetch(
            "SELECT id, title, context, archived_at, created_at "
            "FROM chat_threads WHERE user_sub = $1 ORDER BY created_at",
            sub,
        )
        messages = await conn.fetch(
            "SELECT id, thread_id, role, content, citations, supersedes, "
            "       superseded_by, created_at "
            "FROM chat_messages "
            "WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_sub = $1) "
            "ORDER BY thread_id, created_at",
            sub,
        )
    export_payload = json.dumps(
        {
            "threads": [dict(t) for t in threads],
            "messages": [dict(m) for m in messages],
        },
        default=str,
    )

    async def _stream():
        yield export_payload

    return StreamingResponse(
        _stream(),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="chats-export.json"'},
    )
