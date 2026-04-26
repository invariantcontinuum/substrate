import time
import asyncpg
import structlog
from substrate_common.db import create_pool
from src.config import settings
from src.llm import assert_embedding_dim

logger = structlog.get_logger()

CHUNK_SIZE = settings.age_batch_size

_pool: asyncpg.Pool | None = None

def _escape_cypher(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


async def connect(database_url: str) -> None:
    global _pool
    logger.info("graph_writer_connecting")
    _pool = await create_pool(
        database_url,
        min_size=2,
        max_size=10,
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


async def ensure_source(
    source_type: str, owner: str, name: str, url: str,
    meta: dict | None = None,
    user_sub: str = "dev",
) -> str:
    """Insert source if not present; return its id."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO sources (source_type, owner, name, url, meta, user_sub)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            ON CONFLICT (user_sub, source_type, owner, name) DO UPDATE
                SET url = EXCLUDED.url,
                    meta = EXCLUDED.meta,
                    updated_at = now()
            RETURNING id::text
            """,
            source_type, owner, name, url, meta or {}, user_sub,
        )
        return row["id"]


async def insert_file(
    sync_id: str, source_id: str, file_path: str, name: str, file_type: str,
    domain: str, language: str, size_bytes: int, line_count: int,
    imports_count: int, content_hash: str | None = None,
    embedding: list[float] | None = None,
    exports: list[str] | None = None,
    last_commit_sha: str | None = None,
    last_commit_at: str | None = None,
    description: str = "",
) -> str:
    """Insert one file row tagged with sync_id; immutable per-snapshot.

    ``description`` is the ingestion-side preview text used by sparse
    retrieval (description_tsv) and chat-store reads. The richer
    on-demand LLM summary is written separately by the graph service
    via enriched_summary; that path stamps description_generated_at
    while the preview leaves it NULL so a cache-hit check never
    short-circuits the upgrade.
    """
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        if embedding is not None:
            assert_embedding_dim(sync_id=sync_id, embeddings=[embedding], expected=settings.embedding_dim)
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (sync_id, source_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count, embedding, content_hash,
                     exports, last_commit_sha, last_commit_at, description)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector,
                        $12, $13, $14, $15::timestamptz, $16)
                RETURNING id::text
                """,
                sync_id, source_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count, str(embedding), content_hash,
                exports or [], last_commit_sha, last_commit_at, description,
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (sync_id, source_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count, content_hash,
                     exports, last_commit_sha, last_commit_at, description)
                VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                        $12, $13, $14::timestamptz, $15)
                RETURNING id::text
                """,
                sync_id, source_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count, content_hash,
                exports or [], last_commit_sha, last_commit_at, description,
            )
        return row["id"]


async def update_source_meta(source_id: str, meta: dict, default_branch: str | None = None) -> None:
    """Merge metadata into an existing source row.

    When *default_branch* is provided and non-empty it also overwrites the
    column so the sources page and downstream consumers see the canonical
    branch name without reaching into the JSONB blob.
    """
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        await conn.execute(
            """UPDATE sources
               SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb,
                   default_branch = COALESCE(NULLIF($3, ''), default_branch),
                   updated_at = now()
               WHERE id = $1::uuid""",
            source_id, meta, default_branch,
        )


async def update_file_embedding(
    file_id: str,
    embedding: list[float],
    sync_id: str = "",
    description: str | None = None,
) -> None:
    """Fill in the summary embedding (and optionally description text) on an
    already-written file row.

    When ``description`` is provided, the preview text is persisted alongside
    the vector so sparse retrieval (description_tsv) and chat-store reads
    have non-empty content. ``description_generated_at`` is intentionally
    left NULL — the on-demand enriched-summary pipeline owns that flag
    and uses its NULL state to know it still needs to upgrade the row
    with a richer LLM-generated summary.
    """
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    assert_embedding_dim(
        sync_id=sync_id,
        embeddings=[embedding],
        expected=settings.embedding_dim,
    )
    async with _pool.acquire() as conn:
        if description is not None:
            await conn.execute(
                "UPDATE file_embeddings SET embedding = $2::vector, description = $3 "
                "WHERE id = $1::uuid",
                file_id, str(embedding), description,
            )
        else:
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
                         token_count, language, chunk_type, symbols, embedding)
                    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, NULL)
                    """,
                    file_id, sync_id, ch["chunk_index"], ch["content"],
                    ch["start_line"], ch["end_line"], ch["token_count"],
                    ch.get("language", ""), ch.get("chunk_type", "block"),
                    ch.get("symbols", []),
                )
            else:
                assert_embedding_dim(sync_id=sync_id, embeddings=[embedding], expected=settings.embedding_dim)
                await conn.execute(
                    """
                    INSERT INTO content_chunks
                        (file_id, sync_id, chunk_index, content, start_line, end_line,
                         token_count, language, chunk_type, symbols, embedding)
                    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::vector)
                    """,
                    file_id, sync_id, ch["chunk_index"], ch["content"],
                    ch["start_line"], ch["end_line"], ch["token_count"],
                    ch.get("language", ""), ch.get("chunk_type", "block"),
                    ch.get("symbols", []), str(embedding),
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
            except Exception as e:  # noqa: BLE001 — chunk-level fallback; per-row retry handles edge cases
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
        except Exception as e:  # noqa: BLE001 — per-row write failure counted, sync continues
            failed += 1
            logger.warning("age_node_write_failed",
                           file_id=node["file_id"], error=str(e))
    return failed


async def cleanup_partial(sync_id: str, *, conn: asyncpg.Connection | None = None) -> None:
    """Drop every row produced by a single sync_id across AGE + relational tables.

    Note: the MATCH is intentionally unlabeled, so every vertex carrying this
    sync_id — whether File, Symbol, or any future vlabel — is detached and
    deleted. Adding new vlabels (e.g. Symbol) therefore requires no change here.
    """
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    sync_id_esc = _escape_cypher(sync_id)
    async def _cleanup_on_connection(c: asyncpg.Connection) -> None:
        try:
            # Keep AGE cleanup isolated in a savepoint so failures there do not
            # poison the caller transaction (clean_sync_impl shares a tx boundary).
            async with c.transaction():
                await c.execute(
                    f"SELECT * FROM cypher('substrate', $$ "
                    f"MATCH (n) WHERE n.sync_id = '{sync_id_esc}' DETACH DELETE n "
                    f"$$) AS (v agtype)"
                )
        except Exception as e:  # noqa: BLE001 — AGE cleanup failure should not block relational cleanup
            logger.warning("age_cleanup_failed", sync_id=sync_id, error=str(e))
        # content_chunks cascades on file_embeddings delete; deleting file_embeddings is enough.
        await c.execute("DELETE FROM file_embeddings WHERE sync_id = $1::uuid", sync_id)

    if conn is not None:
        await _cleanup_on_connection(conn)
        return

    async with _pool.acquire() as local_conn:
        await _cleanup_on_connection(local_conn)


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
            except Exception as e:  # noqa: BLE001 — chunk-level fallback; per-row retry handles edge cases
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
        except Exception as e:  # noqa: BLE001 — per-row write failure counted, sync continues
            failed += 1
            logger.warning("age_edge_write_failed",
                           source=edge["source_id"], target=edge["target_id"],
                           error=str(e))
    return failed


async def write_age_symbol_nodes(nodes: list[dict], sync_id: str, source_id: str) -> int:
    """Stamp sync_id+source_id on every Symbol; batch writes via UNWIND with per-row fallback.

    Each node dict needs: symbol_id, file_path, name, kind, line, domain.
    Returns number of symbols that failed to write."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not nodes:
        return 0
    batch_count = (len(nodes) + CHUNK_SIZE - 1) // CHUNK_SIZE
    logger.info("age_symbol_nodes_write_start", count=len(nodes),
                sync_id=sync_id, batch_count=batch_count)
    start = time.monotonic()
    failed = 0
    sync_id_esc = _escape_cypher(sync_id)
    source_id_esc = _escape_cypher(source_id)

    async with _pool.acquire() as conn:
        for i in range(0, len(nodes), CHUNK_SIZE):
            chunk = nodes[i : i + CHUNK_SIZE]
            try:
                await _write_age_symbol_nodes_chunk(conn, chunk, sync_id_esc, source_id_esc)
            except Exception as e:  # noqa: BLE001 — chunk-level fallback; per-row retry handles edge cases
                # asyncpg auto-commit: each conn.execute() is its own implicit transaction,
                # so a failed chunk does not leave the connection in an aborted state.
                # Per-row fallback on the same conn is safe.
                logger.warning("age_symbol_nodes_chunk_failed_fallback",
                               chunk_index=i // CHUNK_SIZE, chunk_size=len(chunk),
                               error=str(e))
                failed += await _write_age_symbol_nodes_per_row(
                    conn, chunk, sync_id_esc, source_id_esc
                )

    elapsed = time.monotonic() - start
    logger.info("age_symbol_nodes_written", count=len(nodes), failed=failed,
                duration_ms=round(elapsed * 1000))
    return failed


async def _write_age_symbol_nodes_chunk(conn, chunk, sync_id_esc, source_id_esc):
    rows_lit = ", ".join(
        "{{symbol_id: '{sid}', file_path: '{fp}', name: '{name}', "
        "kind: '{kind}', line: {line}, domain: '{dom}'}}".format(
            sid=_escape_cypher(n["symbol_id"]),
            fp=_escape_cypher(n["file_path"]),
            name=_escape_cypher(n["name"]),
            kind=_escape_cypher(n["kind"]),
            line=int(n["line"]),
            dom=_escape_cypher(n.get("domain", "")),
        )
        for n in chunk
    )
    cypher = (
        f"UNWIND [{rows_lit}] AS r "
        f"CREATE (:Symbol {{symbol_id: r.symbol_id, file_path: r.file_path, "
        f"name: r.name, kind: r.kind, line: r.line, "
        f"sync_id: '{sync_id_esc}', source_id: '{source_id_esc}', "
        f"domain: r.domain}})"
    )
    await conn.execute(
        f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
    )


async def _write_age_symbol_nodes_per_row(conn, chunk, sync_id_esc, source_id_esc):
    """Fallback: mirrors the original per-row path, scoped to a single failing chunk."""
    failed = 0
    for node in chunk:
        symbol_id = _escape_cypher(node["symbol_id"])
        file_path = _escape_cypher(node["file_path"])
        name = _escape_cypher(node["name"])
        kind = _escape_cypher(node["kind"])
        line = int(node["line"])
        domain = _escape_cypher(node.get("domain", ""))
        cypher = (
            f"CREATE (n:Symbol {{symbol_id: '{symbol_id}', file_path: '{file_path}', "
            f"name: '{name}', kind: '{kind}', line: {line}, "
            f"sync_id: '{sync_id_esc}', source_id: '{source_id_esc}', "
            f"domain: '{domain}'}})"
        )
        try:
            await conn.execute(
                f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
            )
        except Exception as e:  # noqa: BLE001 — per-row write failure counted, sync continues
            failed += 1
            logger.warning("age_symbol_node_write_failed",
                           symbol_id=node["symbol_id"], error=str(e))
    return failed


async def write_age_defines_edges(edges: list[dict], sync_id: str, source_id: str) -> int:
    """Stamp sync_id+source_id on every DEFINES edge; batch writes via UNWIND with per-row fallback.

    Each edge dict needs: source_id (file_path), target_id (symbol_id).
    Returns number of edges that failed to write."""
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not edges:
        return 0
    batch_count = (len(edges) + CHUNK_SIZE - 1) // CHUNK_SIZE
    logger.info("age_defines_edges_write_start", count=len(edges),
                sync_id=sync_id, batch_count=batch_count)
    start = time.monotonic()
    failed = 0
    sync_id_esc = _escape_cypher(sync_id)
    source_id_esc = _escape_cypher(source_id)

    async with _pool.acquire() as conn:
        for i in range(0, len(edges), CHUNK_SIZE):
            chunk = edges[i : i + CHUNK_SIZE]
            try:
                await _write_age_defines_edges_chunk(conn, chunk, sync_id_esc, source_id_esc)
            except Exception as e:  # noqa: BLE001 — chunk-level fallback; per-row retry handles edge cases
                # asyncpg auto-commit: each conn.execute() is its own implicit transaction,
                # so a failed chunk does not leave the connection in an aborted state.
                # Per-row fallback on the same conn is safe.
                logger.warning("age_defines_edges_chunk_failed_fallback",
                               chunk_index=i // CHUNK_SIZE, chunk_size=len(chunk),
                               error=str(e))
                failed += await _write_age_defines_edges_per_row(
                    conn, chunk, sync_id_esc, source_id_esc
                )

    elapsed = time.monotonic() - start
    logger.info("age_defines_edges_written", count=len(edges), failed=failed,
                duration_ms=round(elapsed * 1000))
    return failed


async def _write_age_defines_edges_chunk(conn, chunk, sync_id_esc, source_id_esc):
    rows_lit = ", ".join(
        "{{src: '{src}', tgt: '{tgt}'}}".format(
            src=_escape_cypher(e["source_id"]),
            tgt=_escape_cypher(e["target_id"]),
        )
        for e in chunk
    )
    # Match both File and Symbol by their respective natural ids AND sync_id
    # so a Symbol/File from a prior sync cannot be cross-linked into this one.
    cypher = (
        f"UNWIND [{rows_lit}] AS r "
        f"MATCH (f:File {{file_id: r.src, sync_id: '{sync_id_esc}'}}), "
        f"(s:Symbol {{symbol_id: r.tgt, sync_id: '{sync_id_esc}'}}) "
        f"CREATE (f)-[:DEFINES {{sync_id: '{sync_id_esc}', "
        f"source_id: '{source_id_esc}'}}]->(s)"
    )
    await conn.execute(
        f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
    )


async def _write_age_defines_edges_per_row(conn, chunk, sync_id_esc, source_id_esc):
    """Fallback: mirrors the original per-row path, scoped to a single failing chunk."""
    failed = 0
    for edge in chunk:
        src = _escape_cypher(edge["source_id"])
        tgt = _escape_cypher(edge["target_id"])
        cypher = (
            f"MATCH (f:File {{file_id: '{src}', sync_id: '{sync_id_esc}'}}), "
            f"(s:Symbol {{symbol_id: '{tgt}', sync_id: '{sync_id_esc}'}}) "
            f"CREATE (f)-[r:DEFINES {{sync_id: '{sync_id_esc}', "
            f"source_id: '{source_id_esc}'}}]->(s)"
        )
        try:
            await conn.execute(
                f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
            )
        except Exception as e:  # noqa: BLE001 — per-row write failure counted, sync continues
            failed += 1
            logger.warning("age_defines_edge_write_failed",
                           source=edge["source_id"], target=edge["target_id"],
                           error=str(e))
    return failed
