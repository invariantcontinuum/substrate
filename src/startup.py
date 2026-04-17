import asyncpg


async def check_embedding_dim(conn: asyncpg.Connection, expected_dim: int) -> None:
    """Assert the file_embeddings.embedding column dimension matches expected_dim.

    pgvector stores the declared dim directly in pg_attribute.atttypmod
    (i.e. atttypmod == dim, unlike varchar where atttypmod == n + 4).
    Raises RuntimeError on mismatch so the service refuses to start with
    drifted vector column configuration.
    """
    row = await conn.fetchrow(
        """
        SELECT atttypmod FROM pg_attribute
        WHERE attrelid = 'file_embeddings'::regclass AND attname = 'embedding'
        """
    )
    if row is None:
        raise RuntimeError("file_embeddings.embedding column not found")
    column_dim = row["atttypmod"]
    if column_dim != expected_dim:
        raise RuntimeError(
            f"Embedding dim mismatch: config expects {expected_dim}, "
            f"file_embeddings.embedding column is {column_dim}. Refusing to start."
        )
