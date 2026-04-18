#!/usr/bin/env bash
# Probes substrate services. Phase 1: only reports "skeleton ready".
# Probes are added incrementally in later phases.
set -euo pipefail

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

pass() { printf "  PASS  %s\n" "$1"; }
fail() { printf "  FAIL  %s\n" "$1"; failed=1; }
failed=0

echo "substrate doctor"
pass "monorepo skeleton present"

if [[ -f ops/compose/compose.yaml ]]; then
  pass "compose.yaml present"
else
  pass "compose.yaml not yet present (expected before Phase 3)"
fi

if [[ -f ops/llm/lazy-lamacpp/Makefile ]]; then
  pass "lazy-lamacpp imported"
else
  pass "lazy-lamacpp not yet imported (expected before Phase 4)"
fi

exit "$failed"
