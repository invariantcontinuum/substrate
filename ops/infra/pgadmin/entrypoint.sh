#!/usr/bin/env bash
set -euo pipefail

umask 077
cat > /pgpass <<EOF
postgres:5432:substrate_graph:substrate_graph:${GRAPH_DB_PASSWORD}
EOF

exec /entrypoint.sh "$@"
