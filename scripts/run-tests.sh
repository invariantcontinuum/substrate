#!/usr/bin/env bash
set -euo pipefail

FAILED=0
for svc in services/gateway services/ingestion services/graph packages/substrate-common packages/substrate-graph-builder; do
  if [[ -f "$svc/pyproject.toml" ]]; then
    echo "==> pytest $svc"
    (cd "$svc" && uv run pytest -q) || FAILED=1
  fi
done

if [[ -f apps/frontend/package.json ]]; then
  echo "==> vitest apps/frontend"
  (cd apps/frontend && pnpm test -- --run) || FAILED=1
fi

if [[ -f packages/substrate-web-common/package.json ]]; then
  echo "==> vitest packages/substrate-web-common"
  (cd packages/substrate-web-common && pnpm test -- --run) || FAILED=1
fi

exit "$FAILED"
