"""Tests for list_visible_messages — filters out superseded messages."""
import pytest
from uuid import UUID, uuid4

from src.graph import store
from src.graph.chat_store import (
    insert_message,
    list_messages,
    list_visible_messages,
    set_supersedes,
)

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_visible_filters_superseded(app_pool):
    thread_id_str = await _seed_thread(store.get_pool())
    thread_id = UUID(thread_id_str)

    m1 = await insert_message(
        thread_id=thread_id, role="user", content="v1",
        citations=[], sync_ids=[],
    )
    m2 = await insert_message(
        thread_id=thread_id, role="user", content="v2",
        citations=[], sync_ids=[],
    )
    await set_supersedes(store.get_pool(), UUID(m1["id"]), by=UUID(m2["id"]))

    all_msgs = await list_messages(thread_id)
    visible  = await list_visible_messages(thread_id)
    assert len(all_msgs) == 2
    assert len(visible) == 1 and visible[0]["id"] == m2["id"]


async def test_visible_returns_all_when_none_superseded(app_pool):
    thread_id_str = await _seed_thread(store.get_pool())
    thread_id = UUID(thread_id_str)

    await insert_message(
        thread_id=thread_id, role="user", content="a",
        citations=[], sync_ids=[],
    )
    await insert_message(
        thread_id=thread_id, role="assistant", content="b",
        citations=[], sync_ids=[],
    )

    all_msgs = await list_messages(thread_id)
    visible  = await list_visible_messages(thread_id)
    assert len(visible) == len(all_msgs) == 2


# ---------------------------------------------------------------------------
# Local helper — NOT in conftest
# ---------------------------------------------------------------------------

async def _seed_thread(pool) -> str:
    """Insert a minimal chat_threads row and return its id as str."""
    unique = uuid4().hex[:12]
    thread_id = await pool.fetchval(
        "INSERT INTO chat_threads (user_sub, title) VALUES ($1, $2) RETURNING id::text",
        f"test-visible-{unique}", f"thread-{unique}",
    )
    return thread_id
