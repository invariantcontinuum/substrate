from substrate_common.db import asyncpg_dsn


def test_strips_sqlalchemy_driver_suffix():
    assert asyncpg_dsn("postgresql+asyncpg://u:p@h:5432/db") == "postgresql://u:p@h:5432/db"


def test_passthrough_when_no_driver_suffix():
    assert asyncpg_dsn("postgresql://u:p@h:5432/db") == "postgresql://u:p@h:5432/db"
