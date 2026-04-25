"""Resolves an ActiveContext payload to the concrete file list whose
content will be attached to a chat thread.

Scope rules:
- source_id: required.
- snapshot_ids: required, non-empty.
- community_ids: optional. When present, files must additionally appear
  in the leiden_cache.assignments JSONB blob for the matching cache_key
  with one of the listed community indices.

Token estimation is approximate — we sum content_chunks bytes per file
and convert with the same heuristic the chunker uses (4 chars ≈ 1
token). This is fine for budget display and 413-on-overage decisions;
exact tokenization happens at LLM call time."""
from __future__ import annotations

import json

from substrate_graph_builder.chunker import estimate_tokens

from src.graph import store


async def resolve(ctx: dict, user_sub: str) -> list[dict]:
    """Returns rows: ``[{file_id, path, language, total_tokens}, ...]``.
    Empty list = scope resolves to nothing (legal — the thread will run
    in fall-back mode until the user expands scope)."""
    if ctx is None:
        return []
    snapshot_ids = ctx.get("snapshot_ids") or []
    if not snapshot_ids:
        return []
    community_refs = ctx.get("community_ids") or []
    pool = store.get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT f.id::text AS file_id, f.file_path AS path,
                   f.language,
                   (SELECT string_agg(c.content, '')
                    FROM content_chunks c WHERE c.file_id = f.id
                   ) AS rough_content
            FROM file_embeddings f
            JOIN sources s ON s.id = f.source_id
            WHERE s.user_sub = $1
              AND s.id = $2::uuid
              AND f.sync_id = ANY($3::uuid[])
            """,
            user_sub, ctx["source_id"], snapshot_ids,
        )
        # Optional: post-filter by leiden community membership. Assignments
        # live in `leiden_cache.assignments` as a JSONB blob keyed by node_id;
        # we load the blob(s) once and intersect in Python rather than try
        # to express it in SQL.
        if community_refs:
            cache_keys = list({c["cache_key"] for c in community_refs})
            wanted_pairs = {
                (c["cache_key"], int(c["community_index"]))
                for c in community_refs
            }
            cache_rows = await conn.fetch(
                """
                SELECT cache_key, assignments
                FROM leiden_cache
                WHERE user_sub = $1 AND cache_key = ANY($2::text[])
                  AND expires_at > now()
                """,
                user_sub, cache_keys,
            )
            allowed_file_ids: set[str] = set()
            for row in cache_rows:
                cache_key = row["cache_key"]
                blob = row["assignments"]
                if isinstance(blob, str):
                    blob = json.loads(blob)
                if not isinstance(blob, dict):
                    continue
                for node_id, idx in blob.items():
                    try:
                        idx_int = int(idx)
                    except (TypeError, ValueError):
                        continue
                    if (cache_key, idx_int) in wanted_pairs:
                        allowed_file_ids.add(str(node_id))
            rows = [r for r in rows if r["file_id"] in allowed_file_ids]
    out: list[dict] = []
    for r in rows:
        approx = r["rough_content"] or ""
        out.append({
            "file_id": r["file_id"],
            "path": r["path"],
            "language": r["language"],
            "total_tokens": estimate_tokens(approx),
        })
    return out
