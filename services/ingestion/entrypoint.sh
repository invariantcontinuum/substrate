#!/bin/bash
# Ingestion owns no migrations — the single data boundary is the graph DB,
# whose schema is migrated by the graph service on its own startup.
# (Phase 7 collapses the old substrate_ingestion DB.)
set -e

echo "Starting Ingestion Service..."
exec uv run uvicorn src.main:app --host 0.0.0.0 --port "${APP_PORT:-8081}"
