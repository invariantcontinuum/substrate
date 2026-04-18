#!/usr/bin/env bash
set -euo pipefail

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

(cd packages/substrate-common && uv run python -c "
import json
from substrate_common.sse import Event
from substrate_common.errors import ErrorResponse
out = {'Event': Event.model_json_schema(), 'ErrorResponse': ErrorResponse.model_json_schema()}
print(json.dumps(out, sort_keys=True, indent=2))
" > "$WORK/py.json")

(cd packages/substrate-web-common && pnpm exec tsx scripts/dump-schemas.ts > "$WORK/ts.json")

diff -u "$WORK/py.json" "$WORK/ts.json" && echo "contracts match" || {
  echo "contracts diverge"; exit 1;
}
