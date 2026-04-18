#!/bin/bash
# substrate postgres init — creates only the databases the monorepo owns.
# Runs once on fresh volumes via Postgres /docker-entrypoint-initdb.d.
set -euo pipefail

echo "==> creating keycloak database (owned by superuser; KC initializes its own schema)"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE keycloak OWNER ${POSTGRES_USER};
EOSQL

echo "==> creating substrate_graph database + role"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${GRAPH_DB_USER} WITH PASSWORD '${GRAPH_DB_PASSWORD}' SUPERUSER;
    CREATE DATABASE ${GRAPH_DB_NAME} OWNER ${GRAPH_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${GRAPH_DB_NAME} TO ${GRAPH_DB_USER};
EOSQL

echo "==> enabling age + pgvector + creating 'substrate' AGE graph"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$GRAPH_DB_NAME" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS age;
    CREATE EXTENSION IF NOT EXISTS vector;
    LOAD 'age';
    SET search_path = ag_catalog, "\$user", public;
    SELECT create_graph('substrate');
    SELECT create_vlabel('substrate', 'File');
    GRANT USAGE ON SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ag_catalog TO ${GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT SELECT ON TABLES TO ${GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT EXECUTE ON FUNCTIONS TO ${GRAPH_DB_USER};
EOSQL

echo "substrate postgres init complete."
