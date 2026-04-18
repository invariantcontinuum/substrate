"""Shared asyncpg pool factory with AGE + JSONB codec preregistration.

Every substrate service that writes or reads `substrate_graph` needs:
- LOAD 'age' per new pooled connection (not a GUC, survives RESET ALL only
  when run in the pool `init` callback).
- JSONB/JSON codec so columns come back as dicts, not strings.
- search_path="ag_catalog,public" via server_settings so RESET ALL at pool
  release does not wipe the path on every reuse.
"""
from __future__ import annotations

import json

import asyncpg
import structlog

log = structlog.get_logger()


def asyncpg_dsn(url: str) -> str:
    """Strip the SQLAlchemy driver tag so asyncpg accepts the DSN."""
    return url.replace("postgresql+asyncpg://", "postgresql://")


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.execute("LOAD 'age';")


async def create_pool(
    database_url: str,
    *,
    min_size: int = 2,
    max_size: int = 10,
) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(
        asyncpg_dsn(database_url),
        min_size=min_size,
        max_size=max_size,
        init=_init_connection,
        server_settings={"search_path": "ag_catalog,public"},
    )
    log.info(
        "pg_pool_connected",
        min_size=min_size,
        max_size=max_size,
    )
    return pool
