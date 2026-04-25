#!/usr/bin/env bash
# Substrate lint orchestrator.
#
# Each linter (ruff / mypy / vulture per Python package, plus tsc / eslint /
# knip / banned-token grep on the frontend) runs independently. Failures are
# accumulated into a `FAILED_NAMES` array — the script always reports every
# linter that failed, not just the first, so a developer fixing one issue
# doesn't have to re-run to discover the next.
set -uo pipefail

FAILED_NAMES=()

run_check() {
  local label="$1"
  shift
  echo "==> $label"
  if ! "$@"; then
    FAILED_NAMES+=("$label")
  fi
}

for svc in services/gateway services/ingestion services/graph packages/substrate-common packages/substrate-graph-builder; do
  if [[ -f "$svc/pyproject.toml" ]]; then
    run_check "ruff $svc" \
      bash -c "cd '$svc' && uv run --with ruff ruff check ."
    run_check "mypy $svc" \
      bash -c "cd '$svc' && uv run --with mypy mypy ."
    if [[ -f "$svc/.vulture_whitelist.py" ]]; then
      run_check "vulture $svc" \
        bash -c "cd '$svc' && uv run --with vulture vulture . .vulture_whitelist.py --min-confidence 70 --exclude 'tests,migrations,.venv'"
    else
      run_check "vulture $svc" \
        bash -c "cd '$svc' && uv run --with vulture vulture . --min-confidence 70 --exclude 'tests,migrations,.venv'"
    fi
  fi
done

if [[ -f apps/frontend/package.json ]]; then
  run_check "tsc apps/frontend" \
    bash -c "cd apps/frontend && pnpm exec tsc -b --noEmit"
  run_check "eslint apps/frontend" \
    bash -c "cd apps/frontend && pnpm exec eslint . --max-warnings 0"
  run_check "knip apps/frontend" \
    bash -c "cd apps/frontend && pnpm dlx knip"
fi

# Banned tokens: WebSocket / /ws / refetchInterval / redis are forbidden in
# app code (the architecture mandates SSE + pg_notify; no WebSocket, no
# Redis). Migrations and node_modules are excluded.
echo "==> banned-token grep"
if grep -rnE '(WebSocket|/ws|refetchInterval|\bRedis\b|\bredis\b)' \
      --include='*.py' --include='*.ts' --include='*.tsx' \
      --include='*.yaml' --include='*.yml' --include='*.conf' \
      services/ apps/ compose.yaml 2>/dev/null; then
  echo "  banned token found"
  FAILED_NAMES+=("banned-token grep")
fi

if [[ ${#FAILED_NAMES[@]} -gt 0 ]]; then
  echo
  echo "================================================================"
  echo "LINT FAILED — ${#FAILED_NAMES[@]} check(s) reported issues:"
  for name in "${FAILED_NAMES[@]}"; do
    echo "  ✗ $name"
  done
  echo "================================================================"
  exit 1
fi

echo
echo "All lint checks passed."
exit 0
