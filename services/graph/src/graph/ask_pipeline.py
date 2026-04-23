"""Ask (RAG chat) — turn pipeline: embed -> retrieve -> prompt -> LLM ->
parse -> hydrate citations. No DB writes here; the router owns persistence
so the write ordering (user msg, then LLM, then assistant msg) is explicit."""
from __future__ import annotations

import json
import re
import uuid as _uuid
from typing import Any

import asyncpg
import httpx
import structlog

from src.api.routes import _embed_query
from src.config import settings
from src.graph import store
from src.graph.ask_store import search_scoped

logger = structlog.get_logger()

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


async def run_turn(
    *,
    user_sub: str,
    user_content: str,
    sync_ids: list[str],
    prior_turns: list[dict],
    graph_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return `{content, citations}` for the assistant message."""
    query_embedding = await _embed_query(user_content)
    retrieved = await search_scoped(
        query_embedding=query_embedding,
        sync_ids=sync_ids,
        limit=settings.ask_top_k,
    )
    prompt_messages = _build_prompt(
        user_content=user_content,
        prior_turns=prior_turns,
        retrieved=retrieved,
        graph_context=graph_context,
    )
    llm_output = await _call_dense_llm(prompt_messages)
    answer, cited_ids = _parse_response(llm_output)
    citations = await _hydrate_citations(cited_ids)
    return {"content": answer, "citations": citations}


def _build_prompt(
    *, user_content: str, prior_turns: list[dict], retrieved: list[dict],
    graph_context: dict[str, Any] | None = None,
) -> list[dict]:
    budget = settings.ask_total_budget_chars

    def _node_block(n: dict) -> str:
        desc = (n.get("description") or "").strip().replace("\n", " ")
        return (
            f"- node_id={n['id']} name={n.get('name') or ''} "
            f"type={n.get('type') or ''} desc={desc[:200]}"
        )

    nodes_section = "\n".join(_node_block(n) for n in retrieved)
    system = settings.ask_system_instruction
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
    history = prior_turns[-settings.ask_history_turns * 2:]
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


async def _call_dense_llm(messages: list[dict]) -> str:
    headers: dict[str, str] = {}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"

    last_exc: Exception | None = None
    last_text: str | None = None
    for scale in settings.ask_retry_scales_tuple:
        max_tokens = int(settings.ask_max_tokens * scale)
        payload = {
            "model": settings.dense_llm_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": settings.ask_temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            async with httpx.AsyncClient(timeout=settings.ask_llm_timeout_s) as client:
                resp = await client.post(
                    settings.dense_llm_url, headers=headers, json=payload,
                )
            if resp.status_code == 400 and "context" in resp.text.lower():
                logger.warning("ask_llm_context_retry", scale=scale)
                last_exc = httpx.HTTPStatusError(
                    "context", request=resp.request, response=resp,
                )
                continue
            resp.raise_for_status()
            data = resp.json()
            last_text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if last_text:
                return last_text
        except httpx.HTTPError as exc:
            last_exc = exc
            logger.warning("ask_llm_call_failed", scale=scale, error=str(exc))
    if last_text:
        return last_text
    if last_text == "":
        raise RuntimeError("ask_llm_empty_response") from last_exc
    raise RuntimeError(f"ask_llm_all_retries_failed: {last_exc}") from last_exc


def _parse_response(raw: str) -> tuple[str, list[str]]:
    try:
        data = json.loads(raw)
        return str(data.get("answer") or raw), [
            str(nid) for nid in (data.get("cited_node_ids") or [])
        ]
    except json.JSONDecodeError:
        m = _JSON_BLOCK_RE.search(raw)
        if m:
            try:
                data = json.loads(m.group(0))
                return str(data.get("answer") or raw), [
                    str(nid) for nid in (data.get("cited_node_ids") or [])
                ]
            except json.JSONDecodeError:
                pass
    return raw, []


async def _hydrate_citations(node_ids: list[str]) -> list[dict]:
    """Resolve {node_id,name,type} for each cited id via an AGE Cypher MATCH.

    Uses the same inline-quoted pattern as ``snapshot_query.py`` (AGE does
    not support bind parameters inside ``cypher(...)``). UUIDs are validated
    first so only canonical forms are interpolated into the Cypher string —
    anything that isn't a valid UUID is dropped silently (LLMs hallucinate).
    Ids that don't resolve in AGE are likewise dropped. Duplicate ids collapse
    to a single citation entry in input order.
    """
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
            logger.warning("ask_citation_hydrate_failed", error=str(e))
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

    # Return in the LLM-supplied order; drop unresolved ids.
    return [resolved[nid] for nid in valid_ids if nid in resolved]
