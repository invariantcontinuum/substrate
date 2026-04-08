#!/bin/bash
set -e

echo "Running Flyway migrations..."
flyway -url="$FLYWAY_URL" -user="$FLYWAY_USER" -password="$FLYWAY_PASSWORD" \
       -locations="filesystem:/app/migrations" migrate

echo "Starting Ingestion Service..."
exec uv run uvicorn src.main:app --host 0.0.0.0 --port ${APP_PORT:-8081}
