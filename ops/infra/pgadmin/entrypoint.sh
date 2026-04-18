#!/usr/bin/env bash
# pgadmin entrypoint — renders /var/lib/pgadmin/pgpass from env so the
# pre-registered servers.json connections log in without prompting.
# Format: host:port:db:user:password (one line per server).
set -euo pipefail

PGPASS="/var/lib/pgadmin/pgpass"
umask 077
cat > "$PGPASS" <<EOF
postgres:5432:${GRAPH_DB_NAME:-substrate_graph}:${GRAPH_DB_USER:-substrate_graph}:${GRAPH_DB_PASSWORD}
postgres:5432:${KC_DB_NAME:-keycloak}:${KC_DB_USER:-keycloak}:${KC_DB_PASSWORD}
postgres:5432:postgres:${POSTGRES_SUPERUSER:-postgres}:${POSTGRES_SUPERUSER_PASSWORD}
EOF
chmod 600 "$PGPASS"

exec /entrypoint.sh "$@"
