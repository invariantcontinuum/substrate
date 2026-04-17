import time
import asyncpg
import structlog
from src.config import settings
from src.llm import assert_embedding_dim

logger = structlog.get_logger()

CHUNK_SIZE = 500

_pool: asyncpg.Pool | None = None

async def _init_age(conn: asyncpg.Connection) -> None:
    """Load the AGE shared library into each new pool connection.

    We intentionally do NOT `SET search_path` here: asyncpg's pool runs
    `RESET ALL` when releasing a connection back to the pool, which wipes
    any SETs done in the init callback. The second query on that
    connection then fails with `function cypher(unknown, unknown) does
    not exist`. Instead we set search_path via `server_settings` on the
    pool itself — that becomes the connection's startup default and
    survives RESET ALL. LOAD is not a GUC so it persists for the
    connection's lifetime once run here.
    """
    await conn.execute("LOAD 'age';")


def _parse_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _escape_cypher(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


async def connect(database_url: str) -> None:
    global _pool
    logger.info("graph_writer_connecting")
    _pool = await asyncpg.create_pool(
        _parse_url(database_url),
        min_size=2,
        max_size=10,
        init=_init_age,
        server_settings={"search_path": "ag_catalog,public"},
    )
    logger.info("graph_writer_connected")


def get_pool():
    """Return the active asyncpg pool. Raises RuntimeError if not connected."""
    if _pool is None:
        raise RuntimeError("graph_writer not connected")
    return _pool


async def disconnect() -> None:
    global _pool
    if _pool:
        logger.info("graph_writer_disconnecting")
        await _pool.close()
        _pool = None
        logger.info("graph_writer_disconnected")


async def ensure_source(source_type: str, owner: str, name: str, url: str) -> str:
    """Insert source if not present; return its id."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO sources (source_type, owner, name, url)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (source_type, owner, name) DO UPDATE
                SET url = EXCLUDED.url, updated_at = now()
            RETURNING id::text
            """,
            source_type, owner, name, url,
        )
        return row["id"]


async def insert_file(
    sync_id: str, source_id: str, file_path: str, name: str, file_type: str,
    domain: str, language: str, size_bytes: int, line_count: int,
    imports_count: int, content_hash: str | None = None,
    embedding: list[float] | None = None,
) -> str:
    """Insert one file row tagged with sync_id; immutable per-snapshot."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        if embedding is not None:
            assert_embedding_dim(sync_id=sync_id, embeddings=[embedding], expected=settings.embedding_dim)
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (sync_id, source_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count, embedding, content_hash)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector, $12)
                RETURNING id::text
                """,
                sync_id, source_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count, str(embedding), content_hash,
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (sync_id, source_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count, content_hash)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id::text
                """,
                sync_id, source_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count, content_hash,
            )
        return row["id"]


async def update_file_embedding(file_id: str, embedding: list[float], sync_id: str = "") -> None:
    """Fill in the summary embedding on an already-written file row."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    assert_embedding_dim(
        sync_id=sync_id,
        embeddings=[embedding],
        expected=settings.embedding_dim,
    )
    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE file_embeddings SET embedding = $2::vector WHERE id = $1::uuid",
            file_id, str(embedding),
        )


async def update_chunk_embedding(file_id: str, chunk_index: int, embedding: list[float], sync_id: str = "") -> None:
    """Fill in the embedding on an already-written chunk row."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    assert_embedding_dim(
        sync_id=sync_id,
        embeddings=[embedding],
        expected=settings.embedding_dim,
    )
    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE content_chunks SET embedding = $3::vector "
            "WHERE file_id = $1::uuid AND chunk_index = $2",
            file_id, chunk_index, str(embedding),
        )


async def insert_chunks(file_id: str, sync_id: str, chunks: list[dict]) -> None:
    """Insert chunks for one file. Embeddings may be None — backfilled later."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not chunks:
        return
    async with _pool.acquire() as conn:
        for ch in chunks:
            embedding = ch.get("embedding")
            if embedding is None:
                await conn.execute(
                    """
                    INSERT INTO content_chunks
                        (file_id, sync_id, chunk_index, content, start_line, end_line,
                         token_count, language, embedding)
                    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, NULL)
                    """,
                    file_id, sync_id, ch["chunk_index"], ch["content"],
                    ch["start_line"], ch["end_line"], ch["token_count"],
                    ch.get("language", ""),
                )
            else:
                assert_embedding_dim(sync_id=sync_id, embeddings=[embedding], expected=settings.embedding_dim)
                await conn.execute(
                    """
                    INSERT INTO content_chunks
                        (file_id, sync_id, chunk_index, content, start_line, end_line,
                         token_count, language, embedding)
                    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9::vector)
                    """,
                    file_id, sync_id, ch["chunk_index"], ch["content"],
                    ch["start_line"], ch["end_line"], ch["token_count"],
                    ch.get("language", ""), str(embedding),
                )


async def write_age_nodes(nodes: list[dict], sync_id: str, source_id: str) -> int:
    """Stamp sync_id+source_id on every node; batch writes via UNWIND with per-row fallback."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not nodes:
        return 0
    batch_count = (len(nodes) + CHUNK_SIZE - 1) // CHUNK_SIZE
    logger.info("age_nodes_write_start", count=len(nodes),
                sync_id=sync_id, batch_count=batch_count)
    start = time.monotonic()
    failed = 0
    sync_id_esc = _escape_cypher(sync_id)
    source_id_esc = _escape_cypher(source_id)

    async with _pool.acquire() as conn:
        for i in range(0, len(nodes), CHUNK_SIZE):
            chunk = nodes[i : i + CHUNK_SIZE]
            try:
                await _write_age_nodes_chunk(conn, chunk, sync_id_esc, source_id_esc)
            except Exception as e:
                # asyncpg auto-commit: each conn.execute() is its own implicit transaction,
                # so a failed chunk does not leave the connection in an aborted state.
                # Per-row fallback on the same conn is safe.
                logger.warning("age_nodes_chunk_failed_fallback",
                               chunk_index=i // CHUNK_SIZE, chunk_size=len(chunk),
                               error=str(e))
                failed += await _write_age_nodes_per_row(
                    conn, chunk, sync_id_esc, source_id_esc
                )

    elapsed = time.monotonic() - start
    logger.info("age_nodes_written", count=len(nodes), failed=failed,
                duration_ms=round(elapsed * 1000))
    return failed


async def _write_age_nodes_chunk(conn, chunk, sync_id_esc, source_id_esc):
    rows_lit = ", ".join(
        "{{file_id: '{fid}', name: '{name}', type: '{tp}', domain: '{dom}'}}".format(
            fid=_escape_cypher(n["file_id"]),
            name=_escape_cypher(n["name"]),
            tp=_escape_cypher(n["type"]),
            dom=_escape_cypher(n.get("domain", "")),
        )
        for n in chunk
    )
    cypher = (
        f"UNWIND [{rows_lit}] AS r "
        f"CREATE (:File {{file_id: r.file_id, sync_id: '{sync_id_esc}', "
        f"source_id: '{source_id_esc}', name: r.name, type: r.type, domain: r.domain}})"
    )
    await conn.execute(
        f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
    )


async def _write_age_nodes_per_row(conn, chunk, sync_id_esc, source_id_esc):
    """Fallback: mirrors the original per-row path, scoped to a single failing chunk."""
    failed = 0
    for node in chunk:
        file_id = _escape_cypher(node["file_id"])
        name = _escape_cypher(node["name"])
        node_type = _escape_cypher(node["type"])
        domain = _escape_cypher(node.get("domain", ""))
        cypher = (
            f"CREATE (n:File {{file_id: '{file_id}', sync_id: '{sync_id_esc}', "
            f"source_id: '{source_id_esc}', name: '{name}', type: '{node_type}', "
            f"domain: '{domain}'}})"
        )
        try:
            await conn.execute(
                f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
            )
        except Exception as e:
            failed += 1
            logger.warning("age_node_write_failed",
                           file_id=node["file_id"], error=str(e))
    return failed


async def cleanup_partial(sync_id: str) -> None:
    """Drop every row produced by a single sync_id across AGE + relational tables."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    sync_id_esc = _escape_cypher(sync_id)
    async with _pool.acquire() as conn:
        try:
            await conn.execute(
                f"SELECT * FROM cypher('substrate', $$ "
                f"MATCH (n) WHERE n.sync_id = '{sync_id_esc}' DETACH DELETE n "
                f"$$) AS (v agtype)"
            )
        except Exception as e:
            logger.warning("age_cleanup_failed", sync_id=sync_id, error=str(e))
        # content_chunks cascades on file_embeddings delete; deleting file_embeddings is enough.
        await conn.execute("DELETE FROM file_embeddings WHERE sync_id = $1::uuid", sync_id)


async def write_age_edges(edges: list[dict], sync_id: str, source_id: str) -> int:
    """Stamp sync_id+source_id on every edge; batch writes via UNWIND with per-row fallback.

    Each edge dict needs: source_id (file_id), target_id (file_id), weight.
    Returns number of edges that failed to write."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not edges:
        return 0
    batch_count = (len(edges) + CHUNK_SIZE - 1) // CHUNK_SIZE
    logger.info("age_edges_write_start", count=len(edges),
                sync_id=sync_id, batch_count=batch_count)
    start = time.monotonic()
    failed = 0
    sync_id_esc = _escape_cypher(sync_id)
    source_id_esc = _escape_cypher(source_id)

    async with _pool.acquire() as conn:
        for i in range(0, len(edges), CHUNK_SIZE):
            chunk = edges[i : i + CHUNK_SIZE]
            try:
                await _write_age_edges_chunk(conn, chunk, sync_id_esc, source_id_esc)
            except Exception as e:
                # asyncpg auto-commit: each conn.execute() is its own implicit transaction,
                # so a failed chunk does not leave the connection in an aborted state.
                # Per-row fallback on the same conn is safe.
                logger.warning("age_edges_chunk_failed_fallback",
                               chunk_index=i // CHUNK_SIZE, chunk_size=len(chunk),
                               error=str(e))
                failed += await _write_age_edges_per_row(
                    conn, chunk, sync_id_esc, source_id_esc
                )

    elapsed = time.monotonic() - start
    logger.info("age_edges_written", count=len(edges), failed=failed,
                duration_ms=round(elapsed * 1000))
    return failed


async def _write_age_edges_chunk(conn, chunk, sync_id_esc, source_id_esc):
    rows_lit = ", ".join(
        "{{src: '{src}', tgt: '{tgt}', weight: {w}}}".format(
            src=_escape_cypher(e["source_id"]),
            tgt=_escape_cypher(e["target_id"]),
            w=float(e.get("weight", 1.0)),
        )
        for e in chunk
    )
    cypher = (
        f"UNWIND [{rows_lit}] AS r "
        f"MATCH (a:File {{file_id: r.src, sync_id: '{sync_id_esc}'}}), "
        f"(b:File {{file_id: r.tgt, sync_id: '{sync_id_esc}'}}) "
        f"CREATE (a)-[:DEPENDS_ON {{sync_id: '{sync_id_esc}', "
        f"source_id: '{source_id_esc}', weight: r.weight}}]->(b)"
    )
    await conn.execute(
        f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
    )


async def _write_age_edges_per_row(conn, chunk, sync_id_esc, source_id_esc):
    """Fallback: mirrors the original per-row path, scoped to a single failing chunk."""
    failed = 0
    for edge in chunk:
        src = _escape_cypher(edge["source_id"])
        tgt = _escape_cypher(edge["target_id"])
        weight = float(edge.get("weight", 1.0))
        cypher = (
            f"MATCH (a:File {{file_id: '{src}', sync_id: '{sync_id_esc}'}}), "
            f"(b:File {{file_id: '{tgt}', sync_id: '{sync_id_esc}'}}) "
            f"CREATE (a)-[r:DEPENDS_ON {{sync_id: '{sync_id_esc}', "
            f"source_id: '{source_id_esc}', weight: {weight}}}]->(b)"
        )
        try:
            await conn.execute(
                f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
            )
        except Exception as e:
            failed += 1
            logger.warning("age_edge_write_failed",
                           source=edge["source_id"], target=edge["target_id"],
                           error=str(e))
    return failed
