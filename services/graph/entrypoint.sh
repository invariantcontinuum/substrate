#!/bin/bash
set -e

# Dockerfile puts code at /workspace/services/graph (WORKDIR). Migrations
# live relative to that. The old /app/... path was a relic of the
# pre-monorepo single-service Dockerfile.
MIGRATIONS="${FLYWAY_LOCATIONS:-filesystem:/workspace/services/graph/migrations/postgres}"

echo "Running Flyway PostgreSQL migrations..."
flyway -url="$FLYWAY_URL" -user="$FLYWAY_USER" -password="$FLYWAY_PASSWORD" \
       -locations="$MIGRATIONS" migrate

echo "Starting Graph Service..."
exec uv run uvicorn src.main:app --host 0.0.0.0 --port "${APP_PORT:-8082}"
