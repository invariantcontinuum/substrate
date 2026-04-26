"""Chat (RAG chat) — turn pipeline: embed -> retrieve -> prompt -> LLM ->
stream chunks -> extract citations. Each call to stream_turn instantiates
its own SseBus from the shared pool (per-call pattern; no module-level
singleton). The HTTP handler returns 202 immediately and calls stream_turn
via asyncio.create_task.

Phase 6 retrieval pipeline:
    dense (pgvector) ─┐
                      ├─► RRF fuse ─► reranker ─► top-N descriptions
    sparse (tsv)   ───┘

The full-content reconstruction path that previously fed entire file
bodies into the prompt has been removed (pre-MVP "no back-compat" rule).
The pipeline now hands the LLM ranked file *descriptions + metadata*
only; the LLM cites by node id and the UI hydrates excerpts on demand.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, AsyncIterator
from uuid import UUID, uuid4

import asyncpg
import httpx
import structlog

from substrate_common.sse import Event, safe_publish

from src.api.routes import _embed_query
from src.config import settings
from src.graph import store
from src.graph.reranker import rerank
from src.graph.rrf import rrf_fuse
from src.graph.sparse_retrieval import sparse_top_k

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
# Phase-6 retrieval pipeline
# ---------------------------------------------------------------------------


async def _thread_context_file_ids(thread_id: UUID) -> list[str]:
    """Read the per-thread file selection from ``chat_threads.context_files``.

    V8 added the JSONB column as the canonical per-thread file picker. An
    empty array (or NULL row) means "no explicit selection" — the caller
    falls back to the full sync scope so existing threads still work.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT context_files FROM chat_threads WHERE id = $1::uuid",
            thread_id,
        )
    if not row or row["context_files"] is None:
        return []
    raw = row["context_files"]
    items = raw if isinstance(raw, list) else json.loads(raw)
    out: list[str] = []
    for it in items:
        if isinstance(it, str):
            out.append(it)
        elif isinstance(it, dict):
            fid = it.get("file_id") or it.get("id")
            if fid:
                out.append(str(fid))
    return out


async def _all_files_for_snapshots(snapshot_ids: list[str]) -> list[str]:
    """Return every ``file_embeddings.id`` for the given sync_ids.

    Used as the fall-back when ``chat_threads.context_files`` is empty.
    """
    if not snapshot_ids:
        return []
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id::text AS id FROM file_embeddings "
            "WHERE sync_id = ANY($1::uuid[])",
            snapshot_ids,
        )
    return [r["id"] for r in rows]


async def retrieve_context_files(
    *,
    query: str,
    selected_file_ids: list[str],
    snapshot_ids: list[str],
) -> list[dict]:
    """Return ranked file dicts (description + metadata only) sized to top-N.

    Steps:
      1. Dense pgvector search over ``selected_file_ids`` (cosine similarity
         to the embedded query).
      2. Optional sparse keyword search over ``snapshot_ids`` filtered down
         to ``selected_file_ids``; fused with dense via RRF.
      3. Optional cross-encoder rerank over the fused set.

    Both the sparse step and the reranker are toggleable via settings; on
    upstream failure the reranker degrades to original-order top-N (see
    ``reranker.rerank``). The sparse fuse silently falls back to the dense
    list when ``settings.retrieval_use_sparse`` is false.
    """
    if not selected_file_ids:
        return []

    # 1. Dense retrieval (pgvector cosine).
    query_emb = await _embed_query(query)
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS file_id, file_path, name, type, domain,
                   language, size_bytes, description,
                   1 - (embedding <=> $1::vector) AS dense_score
              FROM file_embeddings
             WHERE id = ANY($2::uuid[])
               AND embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector ASC
             LIMIT $3
            """,
            str(query_emb), selected_file_ids, settings.retrieval_dense_top_k,
        )
    dense_candidates = [dict(r) for r in rows]

    # 2. Optional sparse keyword retrieval scoped to the snapshot set, then
    #    intersected with the explicit file selection so the user's modal
    #    decisions still win over a noisy keyword hit.
    if settings.retrieval_use_sparse:
        sparse = await sparse_top_k(
            snapshot_ids=snapshot_ids,
            query=query,
            k=settings.sparse_keyword_top_k,
        )
        selected_set = set(selected_file_ids)
        sparse = [c for c in sparse if c["file_id"] in selected_set]
        fused = rrf_fuse([dense_candidates, sparse], k=settings.reranker_rrf_k)
    else:
        fused = dense_candidates

    # 3. Optional reranker. Hydrate descriptions for items the dense step
    #    didn't include (they came from sparse top-K only) so the reranker
    #    has real text to score against.
    if settings.retrieval_use_reranker and fused:
        fused = await _hydrate_descriptions(fused)
        ranked = await rerank(
            query=query,
            candidates=fused,
            top_n=settings.reranker_top_n,
        )
    else:
        ranked = fused[: settings.reranker_top_n]

    return ranked


async def _hydrate_descriptions(items: list[dict]) -> list[dict]:
    """Populate description + metadata for items that came from sparse-only.

    Sparse hits arrive with just ``file_id``, ``file_path``, ``score`` —
    the reranker needs description text to score, and the prompt
    formatter needs language/size/etc for display. One batch SELECT
    fills both.
    """
    missing = [
        it["file_id"]
        for it in items
        if not (it.get("description") or it.get("language") or it.get("type"))
    ]
    if not missing:
        return items
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id::text AS file_id, file_path, name, type, domain,
                   language, size_bytes, description
              FROM file_embeddings
             WHERE id = ANY($1::uuid[])
            """,
            missing,
        )
    by_id = {r["file_id"]: dict(r) for r in rows}
    out: list[dict] = []
    for it in items:
        fid = it.get("file_id")
        if fid and fid in by_id:
            out.append({**by_id[fid], **it})
        else:
            out.append(it)
    return out


def _format_files_section(files: list[dict]) -> str:
    """Render the ranked file list as a markdown bullet section.

    Empty input collapses to "" so the prompt builder can drop the
    section header without leaving an awkward "Files in scope:" with
    nothing under it.
    """
    if not files:
        return ""
    lines = ["### Files in scope (ranked by relevance):"]
    for f in files:
        size_kb = (f.get("size_bytes") or 0) / 1024
        desc = (f.get("description") or "").strip() or "(no description)"
        lang = f.get("language") or "plain"
        path = f.get("file_path") or f.get("name") or f.get("file_id") or ""
        lines.append(
            f"- **{path}** ({lang}, {size_kb:.1f} KB) — node_id={f.get('file_id')} — {desc}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------


def _build_prompt(
    *, user_content: str, prior_turns: list[dict], retrieved: list[dict] | None = None,
    graph_context: dict[str, Any] | None = None,
    sync_ids: list | None = None,
    files_section: str | None = None,
) -> list[dict]:
    """Assemble the system + history + user prompt under ``chat_total_budget_chars``.

    ``files_section`` (Phase 6) is a pre-rendered markdown block summarising
    the ranked context files; when present it replaces the legacy
    "Node context" header. The file list still trims oldest history /
    lowest-ranked items if the budget is exceeded.
    """
    budget = settings.chat_total_budget_chars
    retrieved = retrieved or []

    # Per-node block — embeds the full file summary (description column)
    # up to the per-node cap. The previous 200-char truncation lost the
    # bulk of the embedded summary; the LLM was effectively reasoning
    # from filenames + types alone. The outer budget guard below still
    # trims oldest history / lowest-ranked nodes if the prompt grows
    # past `chat_total_budget_chars`, so a generous per-node cap is
    # safe — it only loosens the worst-case where we *had* room.
    def _node_block(n: dict) -> str:
        desc = (n.get("description") or "").strip().replace("\n", " ")
        # Phase 6 candidates carry `file_id`; legacy callers carry `id`.
        node_id = n.get("file_id") or n.get("id") or ""
        return (
            f"- node_id={node_id} name={n.get('name') or ''} "
            f"type={n.get('type') or ''} desc={desc[:1500]}"
        )

    if files_section is not None:
        nodes_section = files_section
        header = ""
    else:
        nodes_section = "\n".join(_node_block(n) for n in retrieved)
        header = "### Node context (from the user's active sync set):\n"
    system = settings.chat_system_instruction
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
    user_content: str,
    sync_ids: list,
    graph_context: dict[str, Any] | None,
    user_sub: str,
    prior_turns: list[dict],
    assistant_id: UUID | None = None,
) -> None:
    """Stream an assistant turn. Caller returns 202 immediately; this
    coroutine runs in the background and writes events to sse_events as
    it goes. The final chat_messages row is inserted on success;
    chat.turn.failed event fires on any exception — including prompt-build
    failures that would previously have left the client hanging forever.

    The caller may supply ``assistant_id`` so it can be returned to the
    client in the 202 response and used as the cancel-key (the client
    posts ``DELETE /api/chat/streams/{assistant_id}`` to abort
    mid-stream). When omitted, an id is minted internally for the
    legacy fire-and-forget path."""
    from src.graph import chat_store

    # Initialise assistant_id BEFORE the try so the except block can
    # always publish CHAT_TURN_FAILED, even when the prompt-build raises.
    if assistant_id is None:
        assistant_id = uuid4()

    try:
        # Build the context-aware prompt. Any exception here (DB timeout,
        # embed failure, …) is caught below and published as CHAT_TURN_FAILED
        # so the client is never left hanging after the 202 response.
        sync_ids_str = [str(s) for s in (sync_ids or [])]
        selected_ids = await _thread_context_file_ids(thread_id)
        # When the per-thread context_files JSONB is empty (legacy threads,
        # or threads created before the user opened the picker), fall back
        # to every file in the resolved snapshot scope so retrieval still
        # has candidates to score.
        if not selected_ids:
            selected_ids = await _all_files_for_snapshots(sync_ids_str)
        chat_files = await retrieve_context_files(
            query=user_content,
            selected_file_ids=selected_ids,
            snapshot_ids=sync_ids_str,
        )
        files_section = _format_files_section(chat_files)
        messages = _build_prompt(
            user_content=user_content,
            prior_turns=prior_turns,
            retrieved=chat_files,
            graph_context=graph_context,
            sync_ids=sync_ids,
            files_section=files_section,
        )

        await safe_publish(Event(
            type=CHAT_TURN_STARTED,
            user_sub=user_sub,
            payload={
                "thread_id": str(thread_id),
                "message_id": str(assistant_id),
                "role": "assistant",
            },
        ))

        buffer: list[str] = []
        async for delta in _stream_dense_llm(messages):
            buffer.append(delta)
            await safe_publish(Event(
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

        await safe_publish(Event(
            type=CHAT_TURN_COMPLETED,
            user_sub=user_sub,
            payload={
                "thread_id": str(thread_id),
                "message_id": str(assistant_id),
                "content": full_content,
                "citations": citations,
            },
        ))
    except asyncio.CancelledError:
        # The streaming task was cancelled (user hit Stop in the
        # composer). asyncio.CancelledError is a BaseException so
        # the broader `except Exception` below would NOT catch it;
        # we publish a terminal failed event with reason "cancelled"
        # so the frontend reducer clears its streamingTurn slice,
        # then re-raise so the task is properly marked cancelled.
        logger.info("chat_stream_turn_cancelled", thread_id=str(thread_id))
        try:
            await safe_publish(Event(
                type=CHAT_TURN_FAILED,
                user_sub=user_sub,
                payload={
                    "thread_id": str(thread_id),
                    "message_id": str(assistant_id),
                    "error": "cancelled",
                },
            ))
        except Exception:  # noqa: BLE001
            pass
        raise
    except Exception as exc:  # noqa: BLE001 — user-visible error boundary
        logger.exception("chat_stream_turn_failed", thread_id=str(thread_id))
        await safe_publish(Event(
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
