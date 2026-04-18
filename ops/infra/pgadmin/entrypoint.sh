#!/usr/bin/env bash
set -euo pipefail

PGPASS="/var/lib/pgadmin/pgpass"
umask 077
cat > "$PGPASS" <<EOF
postgres:5432:substrate_graph:substrate_graph:${GRAPH_DB_PASSWORD}
EOF
chmod 600 "$PGPASS"

exec /entrypoint.sh "$@"
