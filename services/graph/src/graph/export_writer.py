"""Streaming JSON export generator. Yields the document one byte chunk
at a time so memory stays O(chunk) on big graphs. The output is a single
top-level JSON object: {meta, nodes, edges, files}."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import AsyncIterator

from src.config import settings
from src.graph import store
from src.graph.file_reconstruct import reconstruct_chunks


async def stream_export(
    *,
    user_sub: str,
    kind: str,
    scope: dict,
) -> AsyncIterator[bytes]:
    pool = store.get_pool()
    async with pool.acquire() as conn:
        node_rows, edge_rows, file_ids = await _resolve_scope(
            conn, user_sub, kind, scope,
        )

    if len(file_ids) > settings.export_max_files:
        from substrate_common import ValidationError
        raise ValidationError(
            f"export resolves to {len(file_ids)} files, exceeds cap "
            f"{settings.export_max_files}",
        )

    meta = {
        "kind": kind,
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": scope,
        "node_count": len(node_rows),
        "edge_count": len(edge_rows),
        "file_count": len(file_ids),
    }
    yield (b'{"meta":' + json.dumps(meta).encode() + b',"nodes":[')
    for i, n in enumerate(node_rows):
        if i:
            yield b","
        yield json.dumps(n).encode()
    yield b'],"edges":['
    for i, e in enumerate(edge_rows):
        if i:
            yield b","
        yield json.dumps(e).encode()
    yield b'],"files":['
    pool2 = store.get_pool()
    async with pool2.acquire() as conn:
        for i, file_id in enumerate(file_ids):
            if i:
                yield b","
            chunks = await conn.fetch(
                """SELECT chunk_index, content, start_line, end_line
                   FROM content_chunks WHERE file_id = $1::uuid
                   ORDER BY chunk_index""",
                file_id,
            )
            meta_row = await conn.fetchrow(
                "SELECT file_path, language, line_count "
                "FROM file_embeddings WHERE id = $1::uuid",
                file_id,
            )
            rebuilt = reconstruct_chunks(
                [dict(c) for c in chunks],
                cap_bytes=settings.file_reconstruct_max_bytes,
                total_lines=(meta_row["line_count"] if meta_row else None),
            )
            yield json.dumps({
                "file_id": file_id,
                "path": meta_row["file_path"] if meta_row else None,
                "language": meta_row["language"] if meta_row else None,
                "content": rebuilt["content"],
                "total_lines": meta_row["line_count"] if meta_row else 0,
                "truncated": rebuilt["truncated"],
            }).encode()
    yield b"]}"


async def _resolve_scope(
    conn, user_sub: str, kind: str, scope: dict,
) -> tuple[list[dict], list[dict], list[str]]:
    """Returns (nodes, edges, file_id_strings). Edges are intentionally
    empty for this iteration — the streaming + file path is what matters
    for pre-MVP. Sub-project 2 wires real edge enumeration."""
    if kind == "loaded":
        sync_ids = scope.get("sync_ids", [])
        if not sync_ids:
            return [], [], []
        rows = await conn.fetch(
            """SELECT f.id::text AS id, f.file_path AS path,
                      f.language, f.type
               FROM file_embeddings f
               JOIN sources s ON s.id = f.source_id
               WHERE s.user_sub = $1
                 AND f.sync_id = ANY($2::uuid[])""",
            user_sub, sync_ids,
        )
    elif kind == "sync":
        sync_id = scope.get("sync_id")
        rows = await conn.fetch(
            """SELECT f.id::text AS id, f.file_path AS path,
                      f.language, f.type
               FROM file_embeddings f
               JOIN sources s ON s.id = f.source_id
               WHERE s.user_sub = $1 AND f.sync_id = $2::uuid""",
            user_sub, sync_id,
        )
    elif kind == "community":
        # Filter by leiden_cache.assignments JSONB intersection (same
        # pattern as chat_context_resolver). Cache key + community
        # index pair selects the file_ids.
        cache_key = scope["cache_key"]
        community_index = int(scope["community_index"])
        cache_row = await conn.fetchrow(
            """SELECT assignments FROM leiden_cache
               WHERE user_sub = $1 AND cache_key = $2 AND expires_at > now()""",
            user_sub, cache_key,
        )
        if not cache_row:
            return [], [], []
        blob = cache_row["assignments"]
        if isinstance(blob, str):
            blob = json.loads(blob)
        wanted_ids = {
            str(node_id)
            for node_id, idx in (blob.items() if isinstance(blob, dict) else [])
            if int(idx) == community_index
        }
        if not wanted_ids:
            return [], [], []
        rows = await conn.fetch(
            """SELECT f.id::text AS id, f.file_path AS path,
                      f.language, f.type
               FROM file_embeddings f
               JOIN sources s ON s.id = f.source_id
               WHERE s.user_sub = $1
                 AND f.id::text = ANY($2::text[])""",
            user_sub, list(wanted_ids),
        )
    else:
        rows = []
    nodes = [dict(r) for r in rows]
    file_ids = [n["id"] for n in nodes]
    edges: list[dict] = []  # Sub-project 2 wires AGE edges in.
    return nodes, edges, file_ids
