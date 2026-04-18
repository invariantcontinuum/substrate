#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: download-model.sh <model>}"

load_model_env "$MODEL_NAME"

PYTHON_BIN="$(resolve_python_bin)"
HF_TOKEN_VALUE="${HF_TOKEN:-}"

"$PYTHON_BIN" "$ROOT_DIR/scripts/hf-download.py" \
  --repo "$MODEL_REPO" \
  --pattern "$MODEL_INCLUDE_PATTERN" \
  --local-dir "$MODEL_DIR" \
  --revision "$MODEL_REVISION" \
  --token "$HF_TOKEN_VALUE"

[[ -f "$MODEL_FILE" ]] || fail "download completed but '${MODEL_FILE}' was not found"

printf '%s\n' "$MODEL_FILE"

