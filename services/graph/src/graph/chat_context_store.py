"""Chat-context store — single shape per thread.

Schema (V11): per-thread context lives in `chat_threads.context` JSONB
with the form

    {
      "scope":     {"sync_ids": [...], "source_ids": [...]},
      "selection": {"kind": "all" | "files" | "communities" | "directories", ...}
    }

User-level seed (used at thread create only) lives in
`user_profiles.active_chat_context` JSONB with the form

    {"sync_ids": [...], "source_ids": [...]}.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from src.graph import store


# ── User-level seed ────────────────────────────────────────────────


async def get_active_seed(user_sub: str) -> dict | None:
    """Return the user's active chat-context seed, or None."""
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


async def set_active_seed(user_sub: str, seed: dict | None) -> None:
    """Upsert the user's active chat-context seed.

    `seed` is `{sync_ids, source_ids}` or None to clear. The row is
    created if absent — pre-MVP user_profiles rows may be missing for
    users who have never visited the account page.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub, active_chat_context)
            VALUES ($1, $2)
            ON CONFLICT (user_sub) DO UPDATE
              SET active_chat_context = EXCLUDED.active_chat_context,
                  updated_at = now()
            """,
            user_sub, seed,
        )


# ── Per-thread context ─────────────────────────────────────────────


_DEFAULT_CONTEXT: dict[str, Any] = {
    "scope": {"sync_ids": [], "source_ids": []},
    "selection": {"kind": "all"},
}


async def get_thread_context(thread_id: UUID) -> dict:
    """Return `chat_threads.context` JSONB for `thread_id`.

    Falls back to the schema default if the row is missing or the
    column is somehow null (the column has a NOT NULL DEFAULT, so
    null only happens on a brand-new row in the same txn that is
    setting it).
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT context FROM chat_threads WHERE id = $1",
            thread_id,
        )
    if not row or row["context"] is None:
        return dict(_DEFAULT_CONTEXT)
    val = row["context"]
    return val if isinstance(val, dict) else json.loads(val)


async def set_thread_context_scope(
    thread_id: UUID, sync_ids: list[str], source_ids: list[str],
) -> None:
    """Freeze a thread's scope at create-time.

    Replaces only the `scope` sub-object; selection stays at the
    schema default (`{"kind":"all"}`).
    """
    pool = store.get_pool()
    payload = {
        "scope": {"sync_ids": list(sync_ids), "source_ids": list(source_ids)},
        "selection": {"kind": "all"},
    }
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE chat_threads SET context = $2 WHERE id = $1",
            thread_id, payload,
        )


async def set_thread_context_selection(
    thread_id: UUID, selection: dict[str, Any],
) -> None:
    """Replace the selection sub-object for a thread.

    Validation is the caller's responsibility (the route layer
    rejects unknown kinds and missing per-kind keys before reaching
    here).
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE chat_threads
            SET context = jsonb_set(context, '{selection}', $2, true)
            WHERE id = $1
            """,
            thread_id, selection,
        )
