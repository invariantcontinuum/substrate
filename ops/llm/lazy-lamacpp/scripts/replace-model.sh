#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL_NAME="${1:?usage: replace-model.sh <model> [KEY=VALUE ...]}"
shift || true

"$SCRIPT_DIR/configure-model.sh" "$MODEL_NAME" "$@"
"$SCRIPT_DIR/download-model.sh" "$MODEL_NAME"

