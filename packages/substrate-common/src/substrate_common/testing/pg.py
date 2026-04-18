"""Testcontainers-backed Postgres+AGE+pgvector fixture.

Used by integration tests across all three services. Spins up a single
container per module, installs both extensions, creates the `substrate`
graph, and applies every Flyway-compatible migration checked in under
`services/graph/migrations/postgres`.

Do NOT mock the database in substrate tests — the AGE agtype codec
surface is the one thing mocks reliably get wrong.
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import asyncpg
import pytest
from testcontainers.postgres import PostgresContainer


def _repo_root() -> Path:
    """Walk up from this file until we find the monorepo root (pnpm-workspace.yaml)."""
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pnpm-workspace.yaml").exists():
            return candidate
    raise RuntimeError("could not locate monorepo root from substrate_common.testing.pg")


def _migrations_dir() -> Path:
    return _repo_root() / "services" / "graph" / "migrations" / "postgres"


@pytest.fixture(scope="module")
def pg_dsn() -> Iterator[str]:
    """Yield a DSN to a fully migrated `substrate_graph` DB.

    Uses `apache/age:PG16_latest` by default; override via env var
    `SUBSTRATE_TEST_PG_IMAGE` for a repo-scoped pre-built image.
    """
    image = os.environ.get("SUBSTRATE_TEST_PG_IMAGE", "apache/age:PG16_latest")
    with PostgresContainer(image) as pg:
        raw_dsn = pg.get_connection_url()
        dsn = raw_dsn.replace("postgresql+psycopg2", "postgresql")
        asyncio.run(_apply_migrations(dsn))
        yield dsn


async def _apply_migrations(dsn: str) -> None:
    conn = await asyncpg.connect(dsn)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS age;")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        await conn.execute("LOAD 'age';")
        await conn.execute('SET search_path = ag_catalog, "$user", public;')
        await conn.execute("SELECT create_graph('substrate');")
        await conn.execute("SELECT create_vlabel('substrate', 'File');")

        migrations = sorted(_migrations_dir().glob("V*.sql"))
        for f in migrations:
            await conn.execute(f.read_text())
    finally:
        await conn.close()
