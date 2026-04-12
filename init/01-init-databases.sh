#!/bin/bash
set -e

# Create n8n database and user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${N8N_DB_USER} WITH PASSWORD '${N8N_DB_PASSWORD}';
    CREATE DATABASE ${N8N_DB_NAME} OWNER ${N8N_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${N8N_DB_NAME} TO ${N8N_DB_USER};
    -- Allow user to create schemas (needed for n8n)
    ALTER USER ${N8N_DB_USER} CREATEDB;
EOSQL

echo "✓ Created database: ${N8N_DB_NAME} with user: ${N8N_DB_USER}"

# Create keycloak database and user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${KC_DB_USER} WITH PASSWORD '${KC_DB_PASSWORD}';
    CREATE DATABASE ${KC_DB_NAME} OWNER ${KC_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${KC_DB_NAME} TO ${KC_DB_USER};
EOSQL

echo "✓ Created database: ${KC_DB_NAME} with user: ${KC_DB_USER}"

# Create schema for n8n (n8n requires a specific schema)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$N8N_DB_NAME" <<-EOSQL
    CREATE SCHEMA IF NOT EXISTS ${N8N_DB_NAME} AUTHORIZATION ${N8N_DB_USER};
    ALTER USER ${N8N_DB_USER} SET search_path TO ${N8N_DB_NAME},public;
EOSQL

echo "✓ Configured schema for n8n"

# ── Substrate Ingestion Database ──
echo "Creating Substrate Ingestion database..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${SUBSTRATE_INGESTION_DB_USER} WITH PASSWORD '${SUBSTRATE_INGESTION_DB_PASSWORD}';
    CREATE DATABASE ${SUBSTRATE_INGESTION_DB_NAME} OWNER ${SUBSTRATE_INGESTION_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${SUBSTRATE_INGESTION_DB_NAME} TO ${SUBSTRATE_INGESTION_DB_USER};
EOSQL

# Enable pgvector on substrate_ingestion
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$SUBSTRATE_INGESTION_DB_NAME" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "✓ Created database: ${SUBSTRATE_INGESTION_DB_NAME} with user: ${SUBSTRATE_INGESTION_DB_USER} (pgvector enabled)"

# ── Substrate Graph Database ──
echo "Creating Substrate Graph database..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${SUBSTRATE_GRAPH_DB_USER} WITH PASSWORD '${SUBSTRATE_GRAPH_DB_PASSWORD}' SUPERUSER;
    CREATE DATABASE ${SUBSTRATE_GRAPH_DB_NAME} OWNER ${SUBSTRATE_GRAPH_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${SUBSTRATE_GRAPH_DB_NAME} TO ${SUBSTRATE_GRAPH_DB_USER};
EOSQL

# Enable AGE and pgvector on substrate_graph, create graph
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$SUBSTRATE_GRAPH_DB_NAME" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS age;
    CREATE EXTENSION IF NOT EXISTS vector;
    LOAD 'age';
    SET search_path = ag_catalog, "\$user", public;
    SELECT create_graph('substrate');
    GRANT USAGE ON SCHEMA ag_catalog TO ${SUBSTRATE_GRAPH_DB_USER};
    GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO ${SUBSTRATE_GRAPH_DB_USER};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ag_catalog TO ${SUBSTRATE_GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT SELECT ON TABLES TO ${SUBSTRATE_GRAPH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ag_catalog GRANT EXECUTE ON FUNCTIONS TO ${SUBSTRATE_GRAPH_DB_USER};
EOSQL

echo "✓ Created database: ${SUBSTRATE_GRAPH_DB_NAME} with user: ${SUBSTRATE_GRAPH_DB_USER} (AGE + pgvector enabled, graph 'substrate' created)"
