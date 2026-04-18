#!/bin/bash
# substrate postgres init — creates users + databases for substrate_graph
# (AGE + pgvector) and keycloak. Fully idempotent: safe to re-run against
# an existing volume; each object is guarded with IF NOT EXISTS / DO blocks
# so nothing errors on replay.
#
# Postgres runs every file in /docker-entrypoint-initdb.d exactly once on
# a FRESH data dir. To force reapply against an existing volume, use
# `make nuke` (full wipe) or connect manually and re-exec this script.
set -euo pipefail

PSQL=(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")

role_exists() {
    "${PSQL[@]}" -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$1'" | grep -q 1
}

db_exists() {
    "${PSQL[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname = '$1'" | grep -q 1
}

echo "==> ensuring keycloak role + database"
if ! role_exists "${KC_DB_USER}"; then
    "${PSQL[@]}" <<-EOSQL
        CREATE USER ${KC_DB_USER} WITH PASSWORD '${KC_DB_PASSWORD}';
EOSQL
else
    "${PSQL[@]}" <<-EOSQL
        ALTER USER ${KC_DB_USER} WITH PASSWORD '${KC_DB_PASSWORD}';
EOSQL
fi

if ! db_exists "${KC_DB_NAME}"; then
    "${PSQL[@]}" <<-EOSQL
        CREATE DATABASE ${KC_DB_NAME} OWNER ${KC_DB_USER};
EOSQL
fi

"${PSQL[@]}" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE ${KC_DB_NAME} TO ${KC_DB_USER};
EOSQL

echo "==> ensuring substrate_graph role + database"
if ! role_exists "${GRAPH_DB_USER}"; then
    "${PSQL[@]}" <<-EOSQL
        CREATE USER ${GRAPH_DB_USER} WITH PASSWORD '${GRAPH_DB_PASSWORD}' SUPERUSER;
EOSQL
else
    "${PSQL[@]}" <<-EOSQL
        ALTER USER ${GRAPH_DB_USER} WITH PASSWORD '${GRAPH_DB_PASSWORD}' SUPERUSER;
EOSQL
fi

if ! db_exists "${GRAPH_DB_NAME}"; then
    "${PSQL[@]}" <<-EOSQL
        CREATE DATABASE ${GRAPH_DB_NAME} OWNER ${GRAPH_DB_USER};
EOSQL
fi

"${PSQL[@]}" <<-EOSQL
    GRANT ALL PRIVILEGES ON DATABASE ${GRAPH_DB_NAME} TO ${GRAPH_DB_USER};
EOSQL

echo "==> ensuring age + pgvector + 'substrate' AGE graph"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${GRAPH_DB_NAME}" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS age;
    CREATE EXTENSION IF NOT EXISTS vector;
    LOAD 'age';
    SET search_path = ag_catalog, "\$user", public;

    -- create_graph / create_vlabel aren't natively idempotent in AGE;
    -- guard with catalog lookups (ag_graph.name, ag_label.name + graph FK).
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'substrate') THEN
            PERFORM create_graph('substrate');
        END IF;
    END
    \$\$;

    DO \$\$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
              FROM ag_catalog.ag_label l
              JOIN ag_catalog.ag_graph g ON g.graphid = l.graph
             WHERE g.name = 'substrate' AND l.name = 'File'
        ) THEN
            PERFORM create_vlabel('substrate', 'File');
        END IF;
    END
    \$\$;

    DO \$\$
    BEGIN
        IF NOT EXISTS (
            SELECT 1
              FROM ag_catalog.ag_label l
              JOIN ag_catalog.ag_graph g ON g.graphid = l.graph
             WHERE g.name = 'substrate' AND l.name = 'Symbol'
        ) THEN
            PERFORM create_vlabel('substrate', 'Symbol');
        END IF;
    END
    \$\$;

    GRANT USAGE ON SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT SELECT ON TABLES TO ${GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT EXECUTE ON FUNCTIONS TO ${GRAPH_DB_USER};
EOSQL

echo "substrate postgres init complete."
