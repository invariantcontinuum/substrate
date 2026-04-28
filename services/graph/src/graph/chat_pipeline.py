"""Chat (RAG chat) — turn pipeline: embed -> retrieve -> prompt -> LLM ->
stream chunks -> extract citations. Each call to stream_turn instantiates
its own SseBus from the shared pool (per-call pattern; no module-level
singleton). The HTTP handler returns 202 immediately and calls stream_turn
via asyncio.create_task.

Phase 6 retrieval pipeline:
    dense (pgvector) ─┐
                      ├─► RRF fuse ─► reranker ─► top-N descriptions
    sparse (tsv)   ───┘

Phase 7 additions:
- Persists a ``chat_message_context`` row per assistant turn (system_prompt,
  history, files, tokens_in/out, duration_ms) so the UI can show "what was
  sent to the LLM for this turn".
- Advertises a ``cite_evidence`` tool to the dense LLM and persists any
  emitted tool calls into ``chat_message_evidence``. When the served
  llama.cpp build does not honour the ``tools`` request body, the pipeline
  falls back to parsing ``[CITE filepath:start-end "reason"]`` markers
  out of the assistant text via regex so evidence still lands.

Phase 8 additions:
- Full file content is injected into the prompt via ``_format_full_files_section``.
- Thread context is resolved via ``resolve_entries`` from ``chat_context_resolver``.
- History uses ``list_visible_messages`` (non-superseded only).
- A Graph Context section is emitted for ``node_neighborhood`` entries.
"""
from __future__ import annotations

import asyncio
import json
import re
from time import monotonic
from typing import Any, AsyncIterator
from uuid import UUID, uuid4

import asyncpg
import httpx
import structlog

from substrate_common.sse import Event, safe_publish

from src.api.routes import _embed_query
from src.config import settings
from src.graph import store
from src.graph.chat_context_resolver import (
    Neighbor, _parse_entry, resolve_entries,
)
from src.graph.chat_store import list_visible_messages
from src.graph.file_full_content import IncompleteReconstruction, load_full
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
CHAT_EVIDENCE_COLLECTED = "chat.evidence.collected"

_CITATION_MARKER_RE = re.compile(r"\[ref:([A-Za-z0-9_\-]+)\]")

# Fallback regex for builds that ignore the ``tools`` request body. Matches
# `[CITE path/to/file.py:12-20 "reason text"]` — quoted reason, optional
# inner backslash-escapes are not supported (LLMs rarely emit them).
_CITE_FALLBACK_RE = re.compile(
    r'\[CITE\s+(?P<path>[^:\]]+):(?P<start>\d+)-(?P<end>\d+)\s+"(?P<reason>[^"]+)"\s*\]'
)

# ---------------------------------------------------------------------------
# Tool spec advertised to the dense LLM. llama.cpp's OpenAI-compatible
# /v1/chat/completions accepts the OpenAI ``tools`` array with
# ``tool_choice = "auto"``; servers that ignore it simply stream content
# unchanged and the regex fallback above picks up any inline markers.
# ---------------------------------------------------------------------------

_CITE_EVIDENCE_TOOL: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "cite_evidence",
        "description": (
            "Cite a file and line range as evidence for a claim in your reply. "
            "Use precise line numbers; call multiple times to cite multiple ranges."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "filepath": {"type": "string"},
                "start_line": {"type": "integer", "minimum": 1},
                "end_line": {"type": "integer", "minimum": 1},
                "reason": {
                    "type": "string",
                    "description": "Why this range is evidence for the answer.",
                },
            },
            "required": ["filepath", "start_line", "end_line", "reason"],
        },
    },
}


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


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------


def _build_prompt(
    *, user_content: str, prior_turns: list[dict],
    files_section: str = "",
    graph_section: str = "",
) -> list[dict]:
    """Assemble the system + history + user prompt under ``chat_total_budget_chars``.

    ``files_section`` is a pre-rendered full-content block for the context
    files. ``graph_section`` is a pre-rendered edge-list block for
    node_neighborhood entries. Both collapse to "" when empty so no
    placeholder headers bleed into the prompt.
    """
    budget = settings.chat_total_budget_chars

    system = settings.chat_system_instruction
    if settings.chat_tools_enabled:
        evidence_addendum = (settings.chat_evidence_instruction or "").strip()
        if evidence_addendum:
            system = f"{system}\n\n{evidence_addendum}"

    user_section = f"## Question\n\n{user_content}"

    messages: list[dict] = [{"role": "system", "content": system}]
    messages.extend([{"role": t["role"], "content": t["content"]} for t in prior_turns])

    nodes_section = files_section
    # History is in the messages list already; don't duplicate it in the body.
    prompt_parts = [p for p in (nodes_section, graph_section, user_section) if p]
    prompt_body = "\n\n".join(prompt_parts)

    # Trim files section line-by-line if over budget.
    while _char_cost(messages) + len(prompt_body) > budget and nodes_section:
        lines = nodes_section.splitlines()
        if len(lines) <= 1:
            break
        nodes_section = "\n".join(lines[:-1])
        prompt_parts = [p for p in (nodes_section, graph_section, user_section) if p]
        prompt_body = "\n\n".join(prompt_parts)

    # Trim oldest history messages if still over budget.
    while _char_cost(messages) + len(prompt_body) > budget and len(messages) > 1:
        messages.pop(1)

    messages.append({"role": "user", "content": prompt_body})
    return messages


def _char_cost(messages: list[dict]) -> int:
    return sum(len(m.get("content", "")) for m in messages)


# ---------------------------------------------------------------------------
# Phase-8 prompt section builders
# ---------------------------------------------------------------------------


async def _format_full_files_section(pool, file_ids: list) -> str:
    """Emit one fenced block per file with the FULL source content."""
    if not file_ids:
        return ""
    blocks: list[str] = []
    for fid in file_ids:
        meta = await pool.fetchrow(
            "SELECT file_path, language FROM file_embeddings WHERE id = $1", fid,
        )
        if meta is None:
            continue
        try:
            text = await load_full(pool, fid)
        except IncompleteReconstruction as exc:
            logger.warning(
                "file_full_content_incomplete",
                file_id=str(exc.file_id),
                covered_lines=exc.covered_lines,
                total_lines=exc.total_lines,
            )
            text = await _load_partial(pool, fid)
        numbered = "\n".join(
            f"{i+1:>5}| {line}" for i, line in enumerate(text.splitlines())
        )
        lang = (meta["language"] or "").lower()
        blocks.append(
            f"### {meta['file_path']}  [ref:{fid}]\n```{lang}\n{numbered}\n```"
        )
    return "\n\n".join(blocks)


async def _load_partial(pool, file_id) -> str:
    """Best-effort fallback when chunks under-cover the file."""
    rows = await pool.fetch(
        "SELECT content FROM content_chunks WHERE file_id = $1 ORDER BY chunk_index",
        file_id,
    )
    return "\n".join(r["content"] for r in rows)


async def _format_graph_context_section(neighbors: list[Neighbor], pool) -> str:
    """Emit a 'Graph context' block for node_neighborhood entries."""
    if not neighbors:
        return ""
    lines: list[str] = []
    for n in neighbors:
        seed = await _path_for(pool, n.seed_id)
        nbr  = await _path_for(pool, n.neighbor_id)
        arrow = {"out": "→", "in": "←", "undirected": "—"}[n.direction]
        lines.append(f"- {seed}  ─[{n.edge_type}]{arrow}  {nbr}")
    return f"## Graph context ({len(neighbors)} edges)\n\n" + "\n".join(lines)


async def _path_for(pool, file_id) -> str:
    row = await pool.fetchrow(
        "SELECT file_path FROM file_embeddings WHERE id = $1", file_id,
    )
    return row["file_path"] if row else f"<unknown:{file_id}>"


async def _effective_history_turns(pool, user_sub: str) -> int:
    row = await pool.fetchrow(
        "SELECT chat_settings FROM user_profiles WHERE user_sub = $1", user_sub,
    )
    if row is not None and isinstance(row["chat_settings"], dict):
        v = row["chat_settings"].get("history_turns")
        if isinstance(v, int) and v >= 0:
            return v
    return settings.chat_history_turns_default


# ---------------------------------------------------------------------------
# Streaming LLM helper
# ---------------------------------------------------------------------------


async def _stream_dense_llm(messages: list[dict]) -> AsyncIterator[str]:
    """Yield successive content deltas from the dense LLM's
    OpenAI-compatible streaming endpoint. Skips non-content chunks.

    Kept content-only for backwards compatibility with tests/monkeypatches
    that stub this generator with a content-string iterator. Tool-call
    handling lives in :func:`_stream_dense_llm_with_tools` below; the
    pipeline default uses that wider stream so cite_evidence calls land,
    but stubbing this function still produces a working content-only run.
    """
    async for kind, payload in _stream_dense_llm_with_tools(messages):
        if kind == "content":
            yield payload  # type: ignore[misc]


async def _stream_dense_llm_with_tools(
    messages: list[dict],
) -> AsyncIterator[tuple[str, Any]]:
    """Yield ("content", str) deltas and ("tool_call", dict) chunks from
    the dense LLM's OpenAI-compatible streaming endpoint.

    Each ``tool_call`` payload has shape::

        {"index": int, "name": str | None, "arguments": str | None}

    The caller accumulates ``arguments`` per index and JSON-decodes after
    streaming completes — OpenAI/llama.cpp emit the arguments string in
    chunks. ``name`` arrives once at the start of the call.

    The ``tools`` + ``tool_choice`` keys are only sent when
    ``settings.chat_tools_enabled`` is true; this gives operators a single
    env-flag escape hatch for llama.cpp builds that 400 on the keys.
    """
    headers: dict[str, str] = {"Accept": "text/event-stream"}
    if settings.dense_llm_api_key:
        headers["Authorization"] = f"Bearer {settings.dense_llm_api_key}"
    payload: dict[str, Any] = {
        "model": settings.dense_llm_model,
        "messages": messages,
        "max_tokens": settings.chat_max_tokens,
        "temperature": settings.chat_temperature,
        "stream": True,
    }
    if settings.chat_tools_enabled:
        payload["tools"] = [_CITE_EVIDENCE_TOOL]
        payload["tool_choice"] = "auto"
    async with httpx.AsyncClient(
        timeout=settings.dense_llm_timeout_s,
        verify=settings.dense_llm_ssl_verify,
    ) as client:
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
                delta = (chunk.get("choices") or [{}])[0].get("delta", {})
                content = delta.get("content") or ""
                if content:
                    yield "content", content
                tool_calls = delta.get("tool_calls") or []
                for tc in tool_calls:
                    fn = tc.get("function") or {}
                    yield "tool_call", {
                        "index": tc.get("index", 0),
                        "name": fn.get("name"),
                        "arguments": fn.get("arguments"),
                    }


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

    turn_start = monotonic()
    try:
        # Build the context-aware prompt. Any exception here (DB timeout,
        # embed failure, …) is caught below and published as CHAT_TURN_FAILED
        # so the client is never left hanging after the 202 response.
        pool = store.get_pool()

        # Resolve thread context entries to file_ids + neighbors.
        ctx_row = await pool.fetchrow(
            "SELECT context FROM chat_threads WHERE id = $1", thread_id,
        )
        entries_raw = (ctx_row["context"] or {}).get("entries", []) if ctx_row else []
        entries = [_parse_entry(e) for e in entries_raw]

        scope = await resolve_entries(entries, pool, user_sub)
        files_section = await _format_full_files_section(pool, scope.file_ids)
        graph_section = await _format_graph_context_section(scope.neighbors, pool)

        # Load visible (non-superseded) history and slice to the turn window.
        # The current user message is already in chat_messages; exclude it
        # so the history passed to the LLM contains only completed turns.
        turns = await _effective_history_turns(pool, user_sub)
        prior_all = await list_visible_messages(thread_id)
        # Exclude the most-recent message if it is the in-flight user turn
        # (role=user, no assistant reply yet). The caller still supplies
        # prior_turns for context; we use the fresh DB-loaded list instead.
        sliced_turns = prior_all[-turns * 2:]
        # Drop the tail if it is the current (user) in-flight message.
        if sliced_turns and sliced_turns[-1].get("role") == "user":
            sliced_turns = sliced_turns[:-1]

        messages = _build_prompt(
            user_content=user_content,
            prior_turns=sliced_turns,
            files_section=files_section,
            graph_section=graph_section,
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
        # Tool-call accumulation buffer, keyed on the streaming index (a
        # single tool call may arrive across multiple chunks; OpenAI sends
        # `name` first, then `arguments` as one or more JSON-string deltas).
        collected_tool_calls: dict[int, dict[str, Any]] = {}
        async for kind, payload in _stream_dense_llm_with_tools(messages):
            if kind == "content":
                delta_text = payload  # type: ignore[assignment]
                if not delta_text:
                    continue
                buffer.append(delta_text)
                await safe_publish(Event(
                    type=CHAT_TURN_CHUNK,
                    user_sub=user_sub,
                    payload={
                        "thread_id": str(thread_id),
                        "message_id": str(assistant_id),
                        "delta": delta_text,
                    },
                ))
            elif kind == "tool_call":
                tc = payload  # type: ignore[assignment]
                idx = int(tc.get("index", 0))
                slot = collected_tool_calls.setdefault(
                    idx, {"name": None, "arguments": ""}
                )
                if tc.get("name"):
                    slot["name"] = tc["name"]
                args_chunk = tc.get("arguments")
                if args_chunk:
                    slot["arguments"] += args_chunk
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

        # ── Persist chat_message_context (system_prompt, history, files,
        #    tokens_in/out, duration_ms). Treat persistence as a side
        #    channel: a write failure here must not break the user-visible
        #    turn (it would leave the client without a "context" panel
        #    but the assistant content is already in chat_messages). ──
        duration_ms = int((monotonic() - turn_start) * 1000)
        try:
            history_for_storage = [
                {"role": m.get("role"), "content": m.get("content")}
                for m in messages
                if m.get("role") in ("user", "assistant")
            ]
            # Store the resolved file_ids as a flat list for the context panel.
            files_for_storage = [{"file_id": str(fid)} for fid in scope.file_ids]
            # Naive 4-char ≈ 1-token estimate matches the rest of the
            # pipeline's char-budgeting heuristic; swapping in tiktoken
            # later only affects the displayed numbers.
            tokens_in = sum(
                len(m.get("content", "")) for m in messages
            ) // 4
            tokens_out = len(full_content) // 4
            await _persist_message_context(
                message_id=assistant_id,
                system_prompt=messages[0].get("content", "") if messages else "",
                history=history_for_storage,
                files=files_for_storage,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                duration_ms=duration_ms,
            )
        except Exception as exc:  # noqa: BLE001 — telemetry side-channel
            logger.warning(
                "chat_message_context_persist_failed",
                message_id=str(assistant_id), error=str(exc),
            )

        # ── Persist cite_evidence tool calls and any [CITE …] inline
        #    fallback markers parsed from the final assistant text. ──
        evidence_calls = _decode_evidence_calls(
            collected_tool_calls, full_content,
        )
        if evidence_calls:
            try:
                await _persist_evidence(assistant_id, evidence_calls)
            except Exception as exc:  # noqa: BLE001 — side-channel
                logger.warning(
                    "chat_evidence_persist_failed",
                    message_id=str(assistant_id), error=str(exc),
                )
            await safe_publish(Event(
                type=CHAT_EVIDENCE_COLLECTED,
                user_sub=user_sub,
                payload={
                    "thread_id": str(thread_id),
                    "message_id": str(assistant_id),
                    "evidence": evidence_calls,
                },
            ))

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
            for fr in file_rows:
                entry = resolved.get(fr["id"])
                if not entry:
                    continue
                entry["file_path"] = fr["file_path"] or ""
                entry["language"] = fr["language"] or ""
                excerpt = fr["excerpt"] or ""
                if len(excerpt) > settings.chat_excerpt_max_chars:
                    excerpt = excerpt[:settings.chat_excerpt_max_chars] + "…"
                entry["excerpt"] = excerpt

    # Return in the LLM-supplied order; drop unresolved ids.
    return [resolved[nid] for nid in valid_ids if nid in resolved]


# ---------------------------------------------------------------------------
# Evidence (cite_evidence tool calls + [CITE …] regex fallback)
# ---------------------------------------------------------------------------


def _decode_evidence_calls(
    collected_tool_calls: dict[int, dict[str, Any]],
    full_content: str,
) -> list[dict[str, Any]]:
    """Materialise the per-turn evidence list.

    Combines:
      1. Streaming tool_call slots whose ``name == "cite_evidence"`` and
         whose accumulated ``arguments`` JSON-decodes to an object with
         the four required fields.
      2. Inline ``[CITE path:start-end "reason"]`` markers parsed from the
         final assistant text. These are the fallback for llama.cpp builds
         that ignore the ``tools`` request body — the LLM still emits the
         markers in its prose because the system prompt asks for them.

    Output entries are deduped on (filepath, start_line, end_line, reason)
    preserving first-seen order. Capped at
    ``settings.chat_evidence_max_per_turn`` to bound the worst case.
    """
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int, str]] = set()

    def _push(filepath: str, start: int, end: int, reason: str) -> None:
        key = (filepath, int(start), int(end), reason)
        if key in seen:
            return
        seen.add(key)
        out.append({
            "filepath": filepath,
            "start_line": int(start),
            "end_line": int(end),
            "reason": reason,
        })

    # 1. Tool-call slots — sorted by stream index so output is stable.
    for idx in sorted(collected_tool_calls.keys()):
        slot = collected_tool_calls[idx]
        if slot.get("name") != "cite_evidence":
            continue
        raw = slot.get("arguments") or ""
        try:
            args = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            continue
        if not isinstance(args, dict):
            continue
        try:
            _push(
                str(args["filepath"]),
                int(args["start_line"]),
                int(args["end_line"]),
                str(args["reason"]),
            )
        except (KeyError, ValueError, TypeError):
            continue

    # 2. Inline-marker fallback — only consulted if the tool path produced
    #    nothing (some builds emit BOTH; preferring tool calls keeps the
    #    schema-validated path authoritative).
    if not out:
        for m in _CITE_FALLBACK_RE.finditer(full_content):
            try:
                _push(
                    m.group("path").strip(),
                    int(m.group("start")),
                    int(m.group("end")),
                    m.group("reason").strip(),
                )
            except (ValueError, TypeError):
                continue

    cap = max(0, int(settings.chat_evidence_max_per_turn))
    if cap and len(out) > cap:
        out = out[:cap]
    return out


async def _persist_evidence(
    message_id: UUID, evidence: list[dict[str, Any]],
) -> None:
    """Insert one row per evidence entry into ``chat_message_evidence``.

    Bad rows (negative ranges, end < start) are dropped silently rather
    than aborting the whole batch — an LLM emitting a single bogus call
    must not lose every other valid call alongside it.
    """
    if not evidence:
        return
    pool = store.get_pool()
    rows = []
    for ev in evidence:
        try:
            filepath = str(ev["filepath"])
            start = int(ev["start_line"])
            end = int(ev["end_line"])
            reason = str(ev["reason"])
        except (KeyError, ValueError, TypeError):
            continue
        if start < 1 or end < start or not filepath:
            continue
        rows.append((message_id, filepath, start, end, reason))
    if not rows:
        return
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO chat_message_evidence
                (message_id, filepath, start_line, end_line, reason)
            VALUES ($1::uuid, $2, $3, $4, $5)
            """,
            rows,
        )


async def _persist_message_context(
    *,
    message_id: UUID,
    system_prompt: str,
    history: list[dict[str, Any]],
    files: list[dict[str, Any]],
    tokens_in: int,
    tokens_out: int,
    duration_ms: int,
) -> None:
    """Write/replace the ``chat_message_context`` row for an assistant turn.

    Uses ``ON CONFLICT (message_id) DO UPDATE`` so a regenerate that
    re-uses an existing assistant id replaces its context snapshot
    rather than tripping the PK. The columns are stored as raw JSONB so
    the GET context route can return them straight to the UI.
    """
    pool = store.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO chat_message_context
                (message_id, system_prompt, history, files,
                 tokens_in, tokens_out, duration_ms)
            VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
            ON CONFLICT (message_id) DO UPDATE SET
                system_prompt = EXCLUDED.system_prompt,
                history       = EXCLUDED.history,
                files         = EXCLUDED.files,
                tokens_in     = EXCLUDED.tokens_in,
                tokens_out    = EXCLUDED.tokens_out,
                duration_ms   = EXCLUDED.duration_ms
            """,
            message_id,
            system_prompt,
            json.dumps(history),
            json.dumps(files),
            int(tokens_in),
            int(tokens_out),
            int(duration_ms),
        )
