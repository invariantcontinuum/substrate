#!/usr/bin/env bash
set -euo pipefail

FAILED=0
for svc in services/gateway services/ingestion services/graph packages/substrate-common packages/substrate-graph-builder; do
  if [[ -f "$svc/pyproject.toml" ]]; then
    echo "==> ruff $svc"
    (cd "$svc" && uv run --with ruff ruff check .) || FAILED=1
    echo "==> mypy $svc"
    (cd "$svc" && uv run --with mypy mypy .) || FAILED=1
    echo "==> vulture $svc"
    if [[ -f "$svc/.vulture_whitelist.py" ]]; then
      (cd "$svc" && uv run --with vulture vulture . .vulture_whitelist.py --min-confidence 70 --exclude 'tests,migrations,.venv') || FAILED=1
    else
      (cd "$svc" && uv run --with vulture vulture . --min-confidence 70 --exclude 'tests,migrations,.venv') || FAILED=1
    fi
  fi
done

if [[ -f apps/frontend/package.json ]]; then
  echo "==> tsc apps/frontend"
  (cd apps/frontend && pnpm exec tsc -b --noEmit) || FAILED=1
  echo "==> eslint apps/frontend"
  (cd apps/frontend && pnpm exec eslint . --max-warnings 0) || FAILED=1
  echo "==> knip apps/frontend"
  (cd apps/frontend && pnpm dlx knip) || FAILED=1
fi

# Phase 8 CI gate — banned tokens (activated once Phase 8 lands; no-op before)
echo "==> banned-token grep"
if grep -rnE '(WebSocket|/ws|refetchInterval|\bRedis\b|\bredis\b)' \
      --include='*.py' --include='*.ts' --include='*.tsx' \
      --include='*.yaml' --include='*.yml' --include='*.conf' \
      services/ apps/ ops/compose/ 2>/dev/null; then
  echo "  banned token found"
  FAILED=1
fi

exit "$FAILED"
