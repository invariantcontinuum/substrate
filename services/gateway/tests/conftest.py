"""Gateway test conftest.

Re-exports the testcontainers ``pg_dsn`` fixture from
``substrate_common.testing.pg`` so module-scope tests in this directory
can request it by name without importing the symbol explicitly.
"""
from substrate_common.testing.pg import pg_dsn  # noqa: F401  (fixture re-export)
