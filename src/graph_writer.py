import asyncpg
import structlog

logger = structlog.get_logger()

_pool: asyncpg.Pool | None = None

AGE_PREAMBLE = "SET search_path = ag_catalog, \"$user\", public;"


async def _init_age(conn: asyncpg.Connection) -> None:
    await conn.execute(AGE_PREAMBLE)


def _parse_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _escape_cypher(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


async def connect(database_url: str) -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        _parse_url(database_url), min_size=2, max_size=10, init=_init_age,
    )
    logger.info("graph_writer_connected")


async def disconnect() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("graph_writer_disconnected")


async def upsert_repository(owner: str, repo: str, url: str, total_files: int, total_edges: int) -> str:
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO repositories (owner, name, url, total_files, total_edges, last_sync_at, status, updated_at)
            VALUES ($1, $2, $3, $4, $5, now(), 'syncing', now())
            ON CONFLICT (owner, name)
            DO UPDATE SET url = EXCLUDED.url,
                          total_files = EXCLUDED.total_files,
                          total_edges = EXCLUDED.total_edges,
                          last_sync_at = now(),
                          status = 'syncing',
                          updated_at = now()
            RETURNING id::text
            """,
            owner, repo, url, total_files, total_edges,
        )
        repo_id = row["id"]
        logger.info("repository_upserted", owner=owner, repo=repo, id=repo_id)
        return repo_id


async def upsert_file(
    repo_id: str, file_path: str, name: str, file_type: str,
    domain: str, language: str, size_bytes: int, line_count: int,
    imports_count: int, embedding: list[float] | None,
) -> str:
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    async with _pool.acquire() as conn:
        if embedding is not None:
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (repo_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count,
                     embedding, last_seen_at, updated_at)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,
                        $10::vector, now(), now())
                ON CONFLICT (repo_id, file_path)
                DO UPDATE SET name = EXCLUDED.name,
                              type = EXCLUDED.type,
                              domain = EXCLUDED.domain,
                              language = EXCLUDED.language,
                              size_bytes = EXCLUDED.size_bytes,
                              line_count = EXCLUDED.line_count,
                              imports_count = EXCLUDED.imports_count,
                              embedding = EXCLUDED.embedding,
                              last_seen_at = now(),
                              updated_at = now()
                RETURNING id::text
                """,
                repo_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count, str(embedding),
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO file_embeddings
                    (repo_id, file_path, name, type, domain, language,
                     size_bytes, line_count, imports_count,
                     last_seen_at, updated_at)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
                ON CONFLICT (repo_id, file_path)
                DO UPDATE SET name = EXCLUDED.name,
                              type = EXCLUDED.type,
                              domain = EXCLUDED.domain,
                              language = EXCLUDED.language,
                              size_bytes = EXCLUDED.size_bytes,
                              line_count = EXCLUDED.line_count,
                              imports_count = EXCLUDED.imports_count,
                              last_seen_at = now(),
                              updated_at = now()
                RETURNING id::text
                """,
                repo_id, file_path, name, file_type, domain, language,
                size_bytes, line_count, imports_count,
            )
        return row["id"]


async def insert_chunks(file_id: str, chunks: list[dict]) -> None:
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not chunks:
        return
    async with _pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM content_chunks WHERE file_id = $1::uuid", file_id,
        )
        for ch in chunks:
            await conn.execute(
                """
                INSERT INTO content_chunks
                    (file_id, chunk_index, content, start_line, end_line,
                     token_count, language, embedding)
                VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::vector)
                """,
                file_id, ch["chunk_index"], ch["content"],
                ch["start_line"], ch["end_line"], ch["token_count"],
                ch.get("language", ""), str(ch["embedding"]),
            )
    logger.debug("chunks_inserted", file_id=file_id, count=len(chunks))


async def write_age_nodes(nodes: list[dict]) -> None:
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not nodes:
        return
    async with _pool.acquire() as conn:
        for node in nodes:
            file_id = _escape_cypher(node["file_id"])
            name = _escape_cypher(node["name"])
            node_type = _escape_cypher(node["type"])
            domain = _escape_cypher(node.get("domain", ""))
            cypher = (
                f"MERGE (n:File {{file_id: '{file_id}'}}) "
                f"SET n.name = '{name}', n.type = '{node_type}', n.domain = '{domain}'"
            )
            try:
                await conn.execute(
                    f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
                )
            except Exception as e:
                logger.warning("age_node_write_failed", file_id=node["file_id"], error=str(e))
    logger.info("age_nodes_written", count=len(nodes))


async def write_age_edges(edges: list[dict]) -> None:
    if not _pool:
        raise RuntimeError("graph_writer not connected")
    if not edges:
        return
    async with _pool.acquire() as conn:
        for edge in edges:
            src = _escape_cypher(edge["source_id"])
            tgt = _escape_cypher(edge["target_id"])
            weight = edge.get("weight", 1.0)
            cypher = (
                f"MATCH (a:File {{file_id: '{src}'}}), (b:File {{file_id: '{tgt}'}}) "
                f"MERGE (a)-[r:DEPENDS_ON]->(b) "
                f"SET r.weight = {weight}"
            )
            try:
                await conn.execute(
                    f"SELECT * FROM cypher('substrate', $$ {cypher} $$) AS (v agtype)"
                )
            except Exception as e:
                logger.warning("age_edge_write_failed", source=edge["source_id"], target=edge["target_id"], error=str(e))
    logger.info("age_edges_written", count=len(edges))
