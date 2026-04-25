"""Chat (RAG chat) — turn pipeline: embed -> retrieve -> prompt -> LLM ->
stream chunks -> extract citations. Each call to stream_turn instantiates
its own SseBus from the shared pool (per-call pattern; no module-level
singleton). The HTTP handler returns 202 immediately and calls stream_turn
via asyncio.create_task."""
from __future__ import annotations

import json
import re
from typing import Any, AsyncIterator
from uuid import UUID, uuid4

import asyncpg
import httpx
import structlog

from substrate_common import ValidationError
from substrate_common.sse import Event, SseBus

from src.api.routes import _embed_query
from src.config import settings
from src.graph import chat_context_store, store
from src.graph.chat_store import search_scoped
from src.graph.file_reconstruct import reconstruct_chunks

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# SSE event type constants
# ---------------------------------------------------------------------------

CHAT_TURN_STARTED = "chat.turn.started"
CHAT_TURN_CHUNK = "chat.turn.chunk"
CHAT_TURN_COMPLETED = "chat.turn.completed"
CHAT_TURN_FAILED = "chat.turn.failed"

_CITATION_MARKER_RE = re.compile(r"\[ref:([A-Za-z0-9_\-]+)\]")


# ---------------------------------------------------------------------------
# Citation marker extraction
# ---------------------------------------------------------------------------


def extract_citation_markers(text: str) -> list[str]:
    """Extract ``[ref:UUID]`` markers from streamed assistant content,
    preserving first-occurrence order and de-duping."""
    seen: set[str] = set()
    out: list[str] = []
    for match in _CITATION_MARKER_RE.finditer(text):
        node_id = match.group(1)
        if node_id not in seen:
            seen.add(node_id)
            out.append(node_id)
    return out


# ---------------------------------------------------------------------------
# Context helpers
# ---------------------------------------------------------------------------


async def _build_thread_context_files(
    thread_id: UUID,
) -> list[dict] | None:
    """Returns the included context files for a thread, or None if the
    thread has no context_summary (legacy path)."""
    summary = await chat_context_store.get_thread_context_summary(thread_id)
    if summary is None:
        return None
    rows = await chat_context_store.list_thread_context_files(thread_id)
    return [r for r in rows if r["included"]]


async def _build_thread_context_prompt(
    *, user_content: str, prior_turns: list[dict], files: list[dict],
) -> list[dict]:
    total_tokens = sum(f["total_tokens"] for f in files)
    if total_tokens > settings.chat_context_token_budget:
        raise ValidationError(
            f"context exceeds token budget ({total_tokens} > "
            f"{settings.chat_context_token_budget}); drop files in the "
            "context modal to fit",
        )
    pool = store.get_pool()
    blocks: list[str] = []
    async with pool.acquire() as conn:
        for f in files:
            chunks = await conn.fetch(
                """SELECT chunk_index, content, start_line, end_line
                   FROM content_chunks
                   WHERE file_id = $1::uuid
                   ORDER BY chunk_index""",
                f["file_id"],
            )
            meta_row = await conn.fetchrow(
                "SELECT line_count FROM file_embeddings WHERE id = $1::uuid",
                f["file_id"],
            )
            rebuilt = reconstruct_chunks(
                [dict(c) for c in chunks],
                cap_bytes=settings.file_reconstruct_max_bytes,
                total_lines=meta_row["line_count"] if meta_row else None,
            )
            lang = f.get("language") or ""
            blocks.append(
                f"### {f['path']} ({lang or 'unknown'})\n"
                f"```{lang}\n{rebuilt['content']}\n```"
            )
    history_section = ""
    if prior_turns:
        snippets = []
        for t in prior_turns[-settings.chat_history_turns :]:
            role = t.get("role", "user")
            snippets.append(f"[{role}] {t.get('content', '')}")
        history_section = "\n\n## Prior turns\n" + "\n".join(snippets)
    files_section = "\n\n".join(blocks)
    user_msg = (
        "## Files in scope\n\n"
        f"{files_section}{history_section}\n\n"
        f"## Question\n{user_content}"
    )
    return [
        {"role": "system", "content": settings.chat_system_instruction},
        {"role": "user", "content": user_msg},
    ]


def _build_prompt(
    *, user_content: str, prior_turns: list[dict], retrieved: list[dict] | None = None,
    graph_context: dict[str, Any] | None = None,
    sync_ids: list | None = None,
) -> list[dict]:
    budget = settings.chat_total_budget_chars
    retrieved = retrieved or []

    def _node_block(n: dict) -> str:
        desc = (n.get("description") or "").strip().replace("\n", " ")
        return (
            f"- node_id={n['id']} name={n.get('name') or ''} "
            f"type={n.get('type') or ''} desc={desc[:200]}"
        )

    nodes_section = "\n".join(_node_block(n) for n in retrieved)
    system = settings.chat_system_instruction
    header = "### Node context (from the user's active sync set):\n"
    graph_section = ""
    if graph_context:
        gc_nodes = graph_context.get("nodes") or []
        gc_edges = graph_context.get("edges") or []
        if gc_nodes:
            graph_nodes_lines = "\n".join(
                f"- node_id={n.get('id')} name={n.get('name') or ''} type={n.get('type') or ''}"
                for n in gc_nodes
            )
            graph_edges_lines = "\n".join(
                f"- {e.get('source')} -> {e.get('type') or 'rel'} -> {e.get('target')}"
                for e in gc_edges
            )
            graph_section = (
                "\n\n### Currently rendered graph topology:\n"
                f"Nodes:\n{graph_nodes_lines}\n"
            )
            if graph_edges_lines:
                graph_section += f"Relationships:\n{graph_edges_lines}\n"
    user_prefix = "\n\n### Question:\n"

    messages: list[dict] = [{"role": "system", "content": system}]
    history = prior_turns[-settings.chat_history_turns * 2:]
    messages.extend([{"role": t["role"], "content": t["content"]} for t in history])

    prompt_body = header + nodes_section + graph_section + user_prefix + user_content
    while _char_cost(messages) + len(prompt_body) > budget and nodes_section:
        lines = nodes_section.splitlines()
        if len(lines) <= 1:
            break
        nodes_section = "\n".join(lines[:-1])
        prompt_body = header + nodes_section + graph_section + user_prefix + user_content
    # If still over budget, trim graph context
    while _char_cost(messages) + len(prompt_body) > budget and graph_section:
        # Drop edges first, then halve nodes
        if "Relationships:" in graph_section:
            graph_section = graph_section.split("Relationships:")[0]
            prompt_body = header + nodes_section + graph_section + user_prefix + user_content
            continue
        gc_nodes = graph_context.get("nodes") or [] if graph_context else []
        if len(gc_nodes) > 5:
            half = len(gc_nodes) // 2
            graph_nodes_lines = "\n".join(
                f"- node_id={n.get('id')} name={n.get('name') or ''} type={n.get('type') or ''}"
                for n in gc_nodes[:half]
            )
            graph_section = (
                "\n\n### Currently rendered graph topology:\n"
                f"Nodes:\n{graph_nodes_lines}\n"
            )
            prompt_body = header + nodes_section + graph_section + user_prefix + user_content
            continue
        break
    while _char_cost(messages) + len(prompt_body) > budget and len(messages) > 1:
        messages.pop(1)

    messages.append({"role": "user", "content": prompt_body})
    return messages


def _char_cost(messages: list[dict]) -> int:
    return sum(len(m.get("content", "")) for m in messages)


# ---------------------------------------------------------------------------
# Streaming LLM helper
# ---------------------------------------------------------------------------


async def _stream_dense_llm(messages: list[dict]) -> AsyncIterator[str]:
    """Yield successive content deltas from the dense LLM's
    OpenAI-compatible streaming endpoint. Skips non-content chunks."""
    headers: dict[str, str] = {"Accept": "text/event-stream"}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    payload = {
        "model": settings.dense_llm_model,
        "messages": messages,
        "max_tokens": settings.chat_max_tokens,
        "temperature": settings.chat_temperature,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=settings.chat_llm_timeout_s) as client:
        async with client.stream(
            "POST", settings.dense_llm_url, headers=headers, json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning("chat_stream_parse_failed", line=data)
                    continue
                delta = (
                    (chunk.get("choices") or [{}])[0]
                    .get("delta", {})
                    .get("content", "")
                )
                if delta:
                    yield delta


# ---------------------------------------------------------------------------
# stream_turn — fire-and-forget background coroutine
# ---------------------------------------------------------------------------


async def stream_turn(
    *,
    thread_id: UUID,
    user_message_id: UUID,
    user_content: str,
    sync_ids: list,
    graph_context: dict[str, Any] | None,
    user_sub: str,
    prior_turns: list[dict],
) -> None:
    """Stream an assistant turn. Caller returns 202 immediately; this
    coroutine runs in the background and writes events to sse_events as
    it goes. The final chat_messages row is inserted on success;
    chat.turn.failed event fires on exception."""
    from src.graph import chat_store

    bus = SseBus(store.get_pool())
    assistant_id = uuid4()

    # Build the context-aware prompt (same path as run_turn used).
    ctx_files = await _build_thread_context_files(thread_id)
    if ctx_files is not None:
        messages = await _build_thread_context_prompt(
            user_content=user_content,
            prior_turns=prior_turns,
            files=ctx_files,
        )
    else:
        query_embedding = await _embed_query(user_content)
        retrieved = await search_scoped(
            query_embedding=query_embedding,
            sync_ids=sync_ids,
            limit=settings.chat_top_k,
        )
        messages = _build_prompt(
            user_content=user_content,
            prior_turns=prior_turns,
            retrieved=retrieved,
            graph_context=graph_context,
            sync_ids=sync_ids,
        )

    await bus.publish(Event(
        type=CHAT_TURN_STARTED,
        user_sub=user_sub,
        payload={
            "thread_id": str(thread_id),
            "message_id": str(assistant_id),
            "role": "assistant",
        },
    ))

    buffer: list[str] = []
    try:
        async for delta in _stream_dense_llm(messages):
            buffer.append(delta)
            await bus.publish(Event(
                type=CHAT_TURN_CHUNK,
                user_sub=user_sub,
                payload={
                    "thread_id": str(thread_id),
                    "message_id": str(assistant_id),
                    "delta": delta,
                },
            ))
        full_content = "".join(buffer)
        node_ids = extract_citation_markers(full_content)
        citations = await _hydrate_citations(node_ids)

        await chat_store.insert_message(
            thread_id=thread_id,
            role="assistant",
            content=full_content,
            citations=citations,
            sync_ids=sync_ids,
            id=assistant_id,
        )
        await chat_store.touch_thread(thread_id, maybe_title=user_content.strip()[:60])

        await bus.publish(Event(
            type=CHAT_TURN_COMPLETED,
            user_sub=user_sub,
            payload={
                "thread_id": str(thread_id),
                "message_id": str(assistant_id),
                "content": full_content,
                "citations": citations,
            },
        ))
    except Exception as exc:  # noqa: BLE001 — user-visible error boundary
        logger.exception("chat_stream_turn_failed", thread_id=str(thread_id))
        await bus.publish(Event(
            type=CHAT_TURN_FAILED,
            user_sub=user_sub,
            payload={
                "thread_id": str(thread_id),
                "message_id": str(assistant_id),
                "error": str(exc),
            },
        ))
        # No re-raise — fire-and-forget by design.


# ---------------------------------------------------------------------------
# Citation hydration
# ---------------------------------------------------------------------------


async def _hydrate_citations(node_ids: list[str]) -> list[dict]:
    """Resolve {node_id,name,type} for each cited id via an AGE Cypher MATCH.

    Uses the same inline-quoted pattern as ``snapshot_query.py`` (AGE does
    not support bind parameters inside ``cypher(...)``). UUIDs are validated
    first so only canonical forms are interpolated into the Cypher string —
    anything that isn't a valid UUID is dropped silently (LLMs hallucinate).
    Ids that don't resolve in AGE are likewise dropped. Duplicate ids collapse
    to a single citation entry in input order.
    """
    import uuid as _uuid

    if not node_ids:
        return []

    # Dedup preserving order; drop non-UUIDs up front.
    valid_ids: list[str] = []
    seen: set[str] = set()
    for nid in node_ids:
        try:
            canonical = str(_uuid.UUID(str(nid)))
        except (ValueError, AttributeError, TypeError):
            continue
        if canonical in seen:
            continue
        seen.add(canonical)
        valid_ids.append(canonical)
    if not valid_ids:
        return []

    id_list = ",".join(f"'{v}'" for v in valid_ids)
    pool = store.get_pool()
    resolved: dict[str, dict] = {}
    async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                f"""SELECT * FROM cypher('substrate', $$
                    MATCH (f:File)
                    WHERE f.file_id IN [{id_list}]
                    RETURN f.file_id, f.name, f.type
                $$) AS (file_id agtype, name agtype, type agtype)"""
            )
        except asyncpg.PostgresError as e:
            logger.warning("chat_citation_hydrate_failed", error=str(e))
            return []

        for r in rows:
            try:
                fid = json.loads(str(r["file_id"])) if r["file_id"] else None
                name = json.loads(str(r["name"])) if r["name"] else ""
                ntype = json.loads(str(r["type"])) if r["type"] else ""
            except (json.JSONDecodeError, ValueError):
                continue
            if not fid:
                continue
            resolved[str(fid)] = {
                "node_id": str(fid),
                "name": str(name) if name is not None else "",
                "type": str(ntype) if ntype is not None else "",
            }

        # Second pass: enrich every resolved node with relational-side
        # metadata — file_path and the first content chunk. Chat uses
        # this to show an expandable source excerpt under the citation,
        # so the user can read the evidence without opening the Graph page.
        # Pulled in one batch to avoid N-per-citation round-trips.
        if resolved:
            file_rows = await conn.fetch(
                "SELECT fe.id::text AS id, fe.file_path, fe.language, "
                "       cc.content AS excerpt "
                "FROM file_embeddings fe "
                "LEFT JOIN LATERAL ( "
                "  SELECT content FROM content_chunks cc "
                "   WHERE cc.file_id = fe.id "
                "   ORDER BY cc.chunk_index ASC LIMIT 1 "
                ") cc ON true "
                "WHERE fe.id::text = ANY($1::text[])",
                list(resolved.keys()),
            )
            _CHUNK_MAX = 1200
            for fr in file_rows:
                entry = resolved.get(fr["id"])
                if not entry:
                    continue
                entry["file_path"] = fr["file_path"] or ""
                entry["language"] = fr["language"] or ""
                excerpt = fr["excerpt"] or ""
                if len(excerpt) > _CHUNK_MAX:
                    excerpt = excerpt[:_CHUNK_MAX] + "…"
                entry["excerpt"] = excerpt

    # Return in the LLM-supplied order; drop unresolved ids.
    return [resolved[nid] for nid in valid_ids if nid in resolved]
