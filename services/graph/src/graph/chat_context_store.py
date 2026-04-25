"""Asyncpg queries for the chat-context tables.

Schema lives in V3 (`user_profiles.active_chat_context`,
`ask_threads.context_summary`, `ask_thread_context_files`)."""
from __future__ import annotations

import json
from uuid import UUID

from src.graph import store


async def get_active(user_sub: str) -> dict | None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT active_chat_context FROM user_profiles WHERE user_sub = $1",
            user_sub,
        )
    if not row or row["active_chat_context"] is None:
        return None
    val = row["active_chat_context"]
    return val if isinstance(val, dict) else json.loads(val)


async def set_active(user_sub: str, ctx: dict | None) -> None:
    """Upsert the per-user active chat context. Pre-MVP user_profiles
    rows may not exist for users who never visited the account page;
    this UPSERT creates a minimal row in that case."""
    pool = store.get_pool()
    payload = json.dumps(ctx) if ctx is not None else None
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub, active_chat_context)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (user_sub) DO UPDATE
              SET active_chat_context = EXCLUDED.active_chat_context,
                  updated_at = now()
            """,
            user_sub, payload,
        )


async def insert_thread_context_files(
    thread_id: UUID, files: list[dict],
) -> None:
    """Bulk-insert resolved file rows for a freshly-created thread."""
    if not files:
        return
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO ask_thread_context_files
              (thread_id, file_id, path, language, total_tokens)
            VALUES ($1, $2::uuid, $3, $4, $5)
            ON CONFLICT (thread_id, file_id) DO NOTHING
            """,
            [
                (
                    thread_id, f["file_id"], f["path"],
                    f.get("language"), int(f["total_tokens"]),
                )
                for f in files
            ],
        )


async def list_thread_context_files(thread_id: UUID) -> list[dict]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT file_id::text AS file_id, path, language,
                   total_tokens, included
            FROM ask_thread_context_files
            WHERE thread_id = $1
            ORDER BY total_tokens DESC, path
            """,
            thread_id,
        )
    return [dict(r) for r in rows]


async def patch_thread_context_files(
    thread_id: UUID, updates: list[dict],
) -> None:
    if not updates:
        return
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            UPDATE ask_thread_context_files
            SET included = $3
            WHERE thread_id = $1 AND file_id = $2::uuid
            """,
            [(thread_id, u["file_id"], bool(u["included"])) for u in updates],
        )


async def write_context_summary(thread_id: UUID, summary: dict) -> None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE ask_threads SET context_summary = $2::jsonb WHERE id = $1",
            thread_id, json.dumps(summary),
        )


async def get_thread_context_summary(thread_id: UUID) -> dict | None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT context_summary FROM ask_threads WHERE id = $1",
            thread_id,
        )
    if not row or row["context_summary"] is None:
        return None
    val = row["context_summary"]
    return val if isinstance(val, dict) else json.loads(val)
