#!/usr/bin/env bash
# Compares the pydantic and zod JSON-schema dumps for shared types (Event,
# ErrorResponse). A strict schema diff is noisy because pydantic and
# zod-to-json-schema use different containers ($defs vs definitions), so
# this script normalizes both to a minimal {required, property_names} shape
# per type and diffs that.
set -euo pipefail

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

(cd packages/substrate-common && uv run python -c "
import json
from substrate_common.sse import Event
from substrate_common.errors import ErrorResponse

def normalize(schema: dict) -> dict:
    # pydantic emits top-level properties + required (optionally with \$defs).
    props = schema.get('properties', {})
    return {
        'required': sorted(schema.get('required', [])),
        'properties': sorted(props.keys()),
    }

out = {
    'Event': normalize(Event.model_json_schema()),
    'ErrorResponse': normalize(ErrorResponse.model_json_schema()),
}
print(json.dumps(out, sort_keys=True, indent=2))
" > "$WORK/py.json")

(cd packages/substrate-web-common && pnpm exec tsx scripts/dump-schemas.ts) \
  | node -e "
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(0, 'utf8'));

function normalize(schema) {
  // zod-to-json-schema wraps the shape in { \$ref, definitions }.
  const target = schema.definitions ? Object.values(schema.definitions)[0] : schema;
  const props = target.properties || {};
  // Emit keys in alphabetical order to match Python's sort_keys=True output.
  return {
    properties: Object.keys(props).sort(),
    required: (target.required || []).slice().sort(),
  };
}

const out = {};
for (const k of Object.keys(raw).sort()) out[k] = normalize(raw[k]);
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
" > "$WORK/ts.json"

if diff -u "$WORK/py.json" "$WORK/ts.json"; then
  echo "contracts match"
else
  echo "contracts diverge"
  exit 1
fi
