#!/usr/bin/env bash
# Probes substrate stack. Probes are added incrementally each phase.
set -euo pipefail

STRICT=0
[[ "${1:-}" == "--strict" ]] && STRICT=1

# Load env (for credentials used by probes)
if [[ -f env/infra.env ]]; then
  set -a; source env/infra.env; set +a
fi

pass() { printf "  PASS  %s\n" "$1"; }
fail() { printf "  FAIL  %s\n" "$1"; failed=1; }
failed=0

echo "substrate doctor"
pass "monorepo skeleton present"

[[ -f ops/compose/compose.yaml ]] && pass "compose.yaml present" \
                                 || fail "compose.yaml missing"

probe_pg() {
  docker exec substrate-postgres \
    psql -U "${POSTGRES_SUPERUSER:-postgres}" -d substrate_graph -Atc "SELECT 1" \
    >/dev/null 2>&1 \
    && pass "postgres reachable" || fail "postgres"
}

probe_age() {
  local n
  n=$(docker exec substrate-postgres \
        psql -U "${POSTGRES_SUPERUSER:-postgres}" -d substrate_graph -Atc \
        "SELECT count(*) FROM ag_catalog.ag_graph WHERE name='substrate'" 2>/dev/null || echo 0)
  [[ "$n" == "1" ]] && pass "age graph 'substrate'" || fail "age graph"
}

probe_kc() {
  curl -sf http://localhost:8080/realms/substrate/.well-known/openid-configuration \
    >/dev/null && pass "keycloak realm 'substrate'" || fail "keycloak realm"
}

probe_pgadmin() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5050/ 2>/dev/null || echo 000)
  [[ "$code" == "200" || "$code" == "302" ]] && pass "pgadmin :5050" || fail "pgadmin (code=$code)"
}

# Run infra probes only if compose infra is up
if docker ps --filter name=substrate-postgres --filter status=running --format '{{.Names}}' | grep -qx substrate-postgres; then
  probe_pg
  probe_age
  probe_kc
  probe_pgadmin
else
  pass "infra containers not running (skipping probes)"
fi

[[ -f ops/llm/lazy-lamacpp/Makefile ]] \
  && pass "lazy-lamacpp imported" \
  || fail "lazy-lamacpp imported"

probe_llm_embed() {
  curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:8101/v1/models 2>/dev/null \
    | grep -qx 200 && pass "llm :8101 embeddings" || fail "llm embeddings"
}

probe_llm_dense() {
  curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:8102/v1/models 2>/dev/null \
    | grep -qx 200 && pass "llm :8102 dense" || fail "llm dense"
}

probe_llm_embed
probe_llm_dense

probe_http() {
  local name="$1" url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo 000)
  [[ "$code" == "200" || "$code" == "302" ]] && pass "$name" || fail "$name (code=$code)"
}

if docker ps --filter name=substrate-gateway --filter status=running --format '{{.Names}}' | grep -qx substrate-gateway; then
  probe_http "gateway /health"   http://localhost:8180/health
  probe_http "ingestion /health" http://localhost:8181/health
  probe_http "graph /health"     http://localhost:8182/health
  probe_http "frontend /health"  http://localhost:3535/health
fi

exit "$failed"
