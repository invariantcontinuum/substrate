#!/bin/bash
set -e

# Create n8n database and user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${N8N_DB_USER} WITH PASSWORD '${N8N_DB_PASSWORD}';
    CREATE DATABASE ${N8N_DB_NAME} OWNER ${N8N_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${N8N_DB_NAME} TO ${N8N_DB_USER};
EOSQL

echo "✓ Created database: ${N8N_DB_NAME} with user: ${N8N_DB_USER}"

# Create keycloak database and user
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER ${KC_DB_USER} WITH PASSWORD '${KC_DB_PASSWORD}';
    CREATE DATABASE ${KC_DB_NAME} OWNER ${KC_DB_USER};
    GRANT ALL PRIVILEGES ON DATABASE ${KC_DB_NAME} TO ${KC_DB_USER};
EOSQL

echo "✓ Created database: ${KC_DB_NAME} with user: ${KC_DB_USER}"
