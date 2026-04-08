#!/bin/bash
set -e

echo "Running Flyway PostgreSQL migrations..."
flyway -url="$FLYWAY_URL" -user="$FLYWAY_USER" -password="$FLYWAY_PASSWORD" \
       -locations="filesystem:/app/migrations/postgres" migrate

echo "Running Neo4j migrations..."
if command -v neo4j-migrations &> /dev/null; then
    neo4j-migrations --address "$NEO4J_URL" --username "$NEO4J_USER" --password "$NEO4J_PASSWORD" \
                     --location "file:///app/migrations/neo4j" migrate
else
    echo "neo4j-migrations not found, skipping (constraints will be applied on first use)"
fi

echo "Starting Graph Service..."
exec uv run uvicorn src.main:app --host 0.0.0.0 --port ${APP_PORT:-8082}
