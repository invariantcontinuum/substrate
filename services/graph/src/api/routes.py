import httpx
import structlog
from fastapi import APIRouter, Depends, Query, Response

from substrate_common import NotFoundError, UpstreamError, ValidationError

from src.api.auth import require_user_sub
from src.config import settings
from src.graph import store
from src.graph.file_reconstruct import reconstruct_chunks
from src.graph.snapshot_query import GraphQueryTimeout, get_merged_graph, get_node_detail
from src.graph.store import ensure_node_summary, get_stats, search

logger = structlog.get_logger()
router = APIRouter(prefix="/api/graph")

_VALID_PROJECTIONS = {"full", "minimal"}


async def _embed_query(query: str) -> list[float]:
    # Prefix queries so they cluster with the document embeddings produced
    # by the ingestion service. Prefix + cap are env-configurable so model
    # swaps are a .env.<mode> edit, not a code change.
    prefix = settings.embedding_query_prefix
    cap = settings.embedding_max_input_chars - len(prefix)
    prefixed = prefix + (query[:cap] if len(query) > cap else query)
    headers: dict[str, str] = {}
    if settings.llm_api_key:
        headers["Authorization"] = f"Bearer {settings.llm_api_key}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            settings.embedding_url,
            headers=headers,
            json={"input": prefixed, "model": settings.embedding_model},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]


@router.get("")
async def get_graph(
    sync_ids: str = Query(..., description="Comma-separated active sync_ids"),
    projection: str = Query("minimal", description="minimal | full"),
    user_sub: str = Depends(require_user_sub),
):
    if projection not in _VALID_PROJECTIONS:
        raise ValidationError("invalid_projection", details={"projection": projection})

    ids = [s for s in sync_ids.split(",") if s]
    if not ids:
        raise ValidationError("sync_ids required")

    try:
        result = await get_merged_graph(ids, projection=projection, user_sub=user_sub)
    except ValueError as e:
        raise ValidationError(str(e)) from e
    except GraphQueryTimeout as e:
        raise UpstreamError(
            "graph_query_timeout",
            details={
                "sync_ids": e.context.get("sync_ids", []),
                "timeout_s": e.timeout_s,
            },
        ) from e
    result.setdefault("meta", {})["projection"] = projection
    return result


@router.get("/nodes/{node_id:path}/summary")
async def get_node_summary(
    node_id: str,
    sync_id: str | None = None,
    force: bool = False,
    user_sub: str = Depends(require_user_sub),
):
    return await ensure_node_summary(node_id, sync_id=sync_id, force=force, user_sub=user_sub)


@router.get("/nodes/{node_id:path}/file")
async def get_node_file(
    node_id: str,
    sync_id: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    """Return the reconstructed source text for a file node.

    Accepts two id shapes:
      - Minimal-projection synthetic: ``src_<source_uuid>:<file_path>``
        (emitted by GET /api/graph?projection=minimal).
      - Direct ``file_embeddings.id`` UUID.

    Chunks are dedup-concatenated in `chunk_index` order; content is
    capped at 5 MB with `truncated` set when the cap is hit. Missing
    node -> 404 {"error":"node_not_found"}. Ingested-but-empty file ->
    200 with content="".
    """
    import uuid as _uuid

    pool = store.get_pool()
    async with pool.acquire() as conn:
        row = None
        if node_id.startswith("src_") and ":" in node_id:
            src_part, file_path = node_id[4:].split(":", 1)
            try:
                source_uuid = str(_uuid.UUID(src_part))
            except (ValueError, AttributeError, TypeError):
                raise NotFoundError("node_not_found")
            sync_uuid: str | None = None
            if sync_id is not None:
                try:
                    sync_uuid = str(_uuid.UUID(sync_id))
                except (ValueError, AttributeError, TypeError):
                    raise NotFoundError("node_not_found")
            row = await conn.fetchrow(
                """SELECT fe.id::text AS id, fe.file_path, fe.language, fe.line_count,
                          fe.size_bytes, fe.sync_id::text AS sync_id, fe.last_commit_sha,
                          fe.last_commit_at::text, fe.exports
                     FROM file_embeddings fe
                     JOIN sources s ON s.id = fe.source_id
                     JOIN sync_runs sr ON sr.id = fe.sync_id
                    WHERE fe.source_id = $1::uuid
                      AND fe.file_path = $2
                      AND ($3::uuid IS NULL OR fe.sync_id = $3::uuid)
                      AND s.user_sub = $4
                    ORDER BY sr.completed_at DESC NULLS LAST, sr.id DESC
                    LIMIT 1""",
                source_uuid, file_path, sync_uuid, user_sub,
            )
        else:
            try:
                node_uuid = str(_uuid.UUID(node_id))
            except (ValueError, AttributeError, TypeError):
                raise NotFoundError("node_not_found")
            sync_uuid_direct: str | None = None
            if sync_id is not None:
                try:
                    sync_uuid_direct = str(_uuid.UUID(sync_id))
                except (ValueError, AttributeError, TypeError):
                    raise NotFoundError("node_not_found")
            row = await conn.fetchrow(
                """SELECT fe.id::text AS id, fe.file_path, fe.language,
                          fe.line_count, fe.size_bytes,
                          fe.sync_id::text AS sync_id, fe.last_commit_sha,
                          fe.last_commit_at::text AS last_commit_at,
                          fe.exports
                     FROM file_embeddings fe
                     JOIN sources s ON s.id = fe.source_id
                    WHERE fe.id = $1::uuid
                      AND ($2::uuid IS NULL OR fe.sync_id = $2::uuid)
                      AND s.user_sub = $3
                    ORDER BY fe.created_at DESC
                    LIMIT 1""",
                node_uuid, sync_uuid_direct, user_sub,
            )

        if not row:
            raise NotFoundError("node_not_found")

        chunk_rows = await conn.fetch(
            """SELECT chunk_index, content, start_line, end_line
                 FROM content_chunks
                WHERE file_id = $1::uuid
                ORDER BY chunk_index""",
            row["id"],
        )

    base_payload = {
        "file_path": row["file_path"],
        "language": row["language"] or "",
        "line_count": row["line_count"],
        "size_bytes": row["size_bytes"],
        "sync_id": row["sync_id"],
        "last_commit_sha": row["last_commit_sha"] or "",
        "last_commit_at": row["last_commit_at"] or "",
        "exports": row["exports"] or [],
    }

    if not chunk_rows:
        return {
            **base_payload,
            "chunk_count": 0,
            "content": "",
            "truncated": False,
        }

    rec = reconstruct_chunks(
        [dict(c) for c in chunk_rows],
        cap_bytes=settings.file_reconstruct_max_bytes,
        total_lines=row["line_count"],
    )
    return {
        **base_payload,
        "chunk_count": rec["chunk_count"],
        "content": rec["content"],
        "truncated": rec["truncated"],
    }


@router.get("/nodes/{node_id:path}")
async def get_node(
    node_id: str,
    response: Response,
    sync_id: str | None = None,
    user_sub: str = Depends(require_user_sub),
):
    try:
        data = await get_node_detail(node_id, sync_id=sync_id, user_sub=user_sub)
    except GraphQueryTimeout as e:
        raise UpstreamError(
            "graph_query_timeout",
            details={
                "node_id": e.context.get("node_id"),
                "sync_id": e.context.get("sync_id"),
                "timeout_s": e.timeout_s,
            },
        ) from e
    if not data:
        raise NotFoundError("node not found")
    response.headers["Cache-Control"] = "private, max-age=30"
    return data


@router.get("/stats")
async def graph_stats(user_sub: str = Depends(require_user_sub)):
    return await get_stats(user_sub=user_sub)


@router.get("/search")
async def search_graph(
    q: str = "",
    type: str = "",
    limit: int = 10,
    user_sub: str = Depends(require_user_sub),
):
    if not q:
        return {"results": []}
    try:
        embedding = await _embed_query(q)
    except httpx.ConnectError:
        return {"results": []}
    return {"results": await search(embedding, limit=limit, type_filter=type, user_sub=user_sub)}
