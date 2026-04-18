#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: download-lora.sh <model> <lora>}"
LORA_NAME="${2:?usage: download-lora.sh <model> <lora>}"

load_model_env "$MODEL_NAME"
[[ -n "$LORA_MANIFEST" && -f "$LORA_MANIFEST" ]] || fail "model '${MODEL_NAME}' does not define a LORA_MANIFEST"

set -a
# shellcheck disable=SC1090
source "$LORA_MANIFEST"
if [[ -f "$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env" ]]; then
  # shellcheck disable=SC1090
  source "$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env"
fi
set +a

LORA_KEY="$(printf '%s' "$LORA_NAME" | tr '[:lower:]-' '[:upper:]_')"
repo_var="LORA_${LORA_KEY}_REPO"
file_var="LORA_${LORA_KEY}_FILENAME"
pattern_var="LORA_${LORA_KEY}_INCLUDE_PATTERN"
revision_var="LORA_${LORA_KEY}_REVISION"
enabled_var="LORA_${LORA_KEY}_ENABLED"

LORA_REPO="$(eval "printf '%s' \"\${$repo_var:-}\"")"
LORA_FILENAME="$(eval "printf '%s' \"\${$file_var:-}\"")"
LORA_PATTERN="$(eval "printf '%s' \"\${$pattern_var:-$LORA_FILENAME}\"")"
LORA_REVISION="$(eval "printf '%s' \"\${$revision_var:-main}\"")"

[[ -n "$LORA_REPO" ]] || fail "LORA repo is not configured for '${LORA_NAME}'. run make lora-config MODEL=${MODEL_NAME} LORA=${LORA_NAME} HF_REPO=... HF_FILE=..."
[[ -n "$LORA_FILENAME" ]] || fail "LORA filename is not configured for '${LORA_NAME}'"

PYTHON_BIN="$(resolve_python_bin)"
LORA_DIR="$ROOT_DIR/models/${MODEL_KEY}/loras/${LORA_NAME}"
mkdir -p "$LORA_DIR"

"$PYTHON_BIN" "$ROOT_DIR/scripts/hf-download.py" \
  --repo "$LORA_REPO" \
  --pattern "$LORA_PATTERN" \
  --local-dir "$LORA_DIR" \
  --revision "$LORA_REVISION" \
  --token "${HF_TOKEN:-}"

[[ -f "$LORA_DIR/$LORA_FILENAME" ]] || fail "download completed but '${LORA_DIR}/${LORA_FILENAME}' was not found"

upsert_key "$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env" "$enabled_var" "true"

printf '%s\n' "$LORA_DIR/$LORA_FILENAME"
