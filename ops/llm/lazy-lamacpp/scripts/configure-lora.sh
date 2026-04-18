#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: configure-lora.sh <model> <lora> [KEY=VALUE ...]}"
LORA_NAME="${2:?usage: configure-lora.sh <model> <lora> [KEY=VALUE ...]}"
shift 2 || true

load_model_env "$MODEL_NAME"
[[ -n "$LORA_MANIFEST" && -f "$LORA_MANIFEST" ]] || fail "model '${MODEL_NAME}' does not define a LORA_MANIFEST"
ensure_project_dirs

LORA_KEY="$(printf '%s' "$LORA_NAME" | tr '[:lower:]-' '[:upper:]_')"
LORA_OVERRIDE_FILE="$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env"

map_key() {
  case "$1" in
    ENABLED) printf 'LORA_%s_ENABLED' "$LORA_KEY" ;;
    HF_REPO) printf 'LORA_%s_REPO' "$LORA_KEY" ;;
    HF_FILE) printf 'LORA_%s_FILENAME' "$LORA_KEY" ;;
    HF_PATTERN) printf 'LORA_%s_INCLUDE_PATTERN' "$LORA_KEY" ;;
    HF_REVISION) printf 'LORA_%s_REVISION' "$LORA_KEY" ;;
    SCALE) printf 'LORA_%s_SCALE' "$LORA_KEY" ;;
    *) printf '%s' "$1" ;;
  esac
}

for assignment in "$@"; do
  [[ "$assignment" == *=* ]] || fail "invalid assignment '${assignment}'"
  key="${assignment%%=*}"
  value="${assignment#*=}"
  mapped_key="$(map_key "$key")"
  upsert_key "$LORA_OVERRIDE_FILE" "$mapped_key" "$value"
done

printf '%s configured for %s\n' "$LORA_NAME" "$MODEL_NAME"
