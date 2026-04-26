"""Chat (RAG chat) — asyncpg queries for chat_threads and chat_messages, plus
a sync-set-scoped pgvector retrieval used by the turn pipeline."""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from src.graph import store


async def list_threads(user_sub: str, limit: int = 100) -> list[dict]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT t.id::text AS id, t.title, t.created_at, t.updated_at,
                   (SELECT m.content FROM chat_messages m
                     WHERE m.thread_id = t.id
                     ORDER BY m.created_at DESC LIMIT 1) AS last_message_preview
            FROM chat_threads t
            WHERE t.user_sub = $1
            ORDER BY t.updated_at DESC
            LIMIT $2
            """,
            user_sub, limit,
        )
    return [dict(r) for r in rows]


async def create_thread(user_sub: str, title: str) -> dict:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO chat_threads (user_sub, title)
            VALUES ($1, $2)
            RETURNING id::text AS id, title, created_at, updated_at
            """,
            user_sub, title,
        )
    return dict(row)


async def rename_thread(user_sub: str, thread_id: UUID, title: str) -> dict | None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE chat_threads SET title = $1, updated_at = now()
            WHERE id = $2 AND user_sub = $3
            RETURNING id::text AS id, title, created_at, updated_at
            """,
            title, thread_id, user_sub,
        )
    return dict(row) if row else None


async def delete_thread(user_sub: str, thread_id: UUID) -> bool:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        status = await conn.execute(
            "DELETE FROM chat_threads WHERE id = $1 AND user_sub = $2",
            thread_id, user_sub,
        )
    return status.endswith(" 1")


async def get_thread(user_sub: str, thread_id: UUID) -> dict | None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id::text AS id, title, created_at, updated_at
            FROM chat_threads
            WHERE id = $1 AND user_sub = $2
            """,
            thread_id, user_sub,
        )
    return dict(row) if row else None


async def list_messages(thread_id: UUID) -> list[dict]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS id, role, content, citations, created_at
            FROM chat_messages
            WHERE thread_id = $1
            ORDER BY created_at ASC
            """,
            thread_id,
        )
    return [_row_to_message(r) for r in rows]


async def list_active_messages_before(
    thread_id: UUID, before_created_at: Any,
) -> list[dict]:
    """Return non-superseded messages on this thread strictly older than
    ``before_created_at`` — the prior_turns history fed to ``stream_turn``
    by the edit/regenerate routes. Superseded rows are excluded so a
    re-run never echoes the message it is replacing back at the LLM.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS id, role, content, citations, created_at
            FROM chat_messages
            WHERE thread_id = $1
              AND superseded_by IS NULL
              AND created_at < $2
            ORDER BY created_at ASC
            """,
            thread_id, before_created_at,
        )
    return [_row_to_message(r) for r in rows]


async def insert_message(
    *, thread_id: UUID, role: str, content: str,
    citations: list[dict[str, Any]], sync_ids: list[str],
    id: UUID | None = None,
) -> dict:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        if id is not None:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_messages (id, thread_id, role, content, citations, sync_ids)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
                RETURNING id::text AS id, role, content, citations, created_at
                """,
                id, thread_id, role, content,
                citations, sync_ids,
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO chat_messages (thread_id, role, content, citations, sync_ids)
                VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
                RETURNING id::text AS id, role, content, citations, created_at
                """,
                thread_id, role, content,
                citations, sync_ids,
            )
    return _row_to_message(row)


async def touch_thread(thread_id: UUID, maybe_title: str | None = None) -> None:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        if maybe_title is None:
            await conn.execute(
                "UPDATE chat_threads SET updated_at = now() WHERE id = $1",
                thread_id,
            )
        else:
            await conn.execute(
                """
                UPDATE chat_threads
                SET updated_at = now(),
                    title = CASE WHEN title = 'New thread' THEN $2 ELSE title END
                WHERE id = $1
                """,
                thread_id, maybe_title,
            )


async def search_scoped(
    query_embedding: list[float], sync_ids: list[str], limit: int,
) -> list[dict]:
    """Vector search over file_embeddings filtered to the supplied sync_ids."""
    if not sync_ids:
        return []
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id::text AS id, f.file_path, f.name, f.type,
                   f.description, f.language,
                   f.embedding <=> $1::vector AS distance
            FROM file_embeddings f
            WHERE f.embedding IS NOT NULL
              AND f.sync_id = ANY($2::uuid[])
            ORDER BY distance ASC
            LIMIT $3
            """,
            str(query_embedding), sync_ids, limit,
        )
    return [dict(r) for r in rows]


def _row_to_message(row) -> dict:
    d = dict(row)
    if isinstance(d.get("citations"), str):
        d["citations"] = json.loads(d["citations"])
    return d
