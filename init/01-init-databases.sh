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

# Create minio database and user (for future use)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${MINIO_DB_USER:-minio} WITH PASSWORD '${MINIO_DB_PASSWORD:-changeme}';
    CREATE DATABASE ${MINIO_DB_NAME:-minio} OWNER ${MINIO_DB_USER:-minio};
    GRANT ALL PRIVILEGES ON DATABASE ${MINIO_DB_NAME:-minio} TO ${MINIO_DB_USER:-minio};
EOSQL

echo "✓ Created database: ${MINIO_DB_NAME:-minio} with user: ${MINIO_DB_USER:-minio}"

# Create schema for n8n (n8n requires a specific schema)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$N8N_DB_NAME" <<-EOSQL
    CREATE SCHEMA IF NOT EXISTS ${N8N_DB_NAME} AUTHORIZATION ${N8N_DB_USER};
    ALTER USER ${N8N_DB_USER} SET search_path TO ${N8N_DB_NAME},public;
EOSQL

echo "✓ Configured schema for n8n"
