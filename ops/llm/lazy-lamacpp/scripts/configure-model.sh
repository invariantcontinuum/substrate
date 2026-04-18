#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: configure-model.sh <model> [KEY=VALUE ...]}"
shift || true

require_model "$MODEL_NAME"
ensure_project_dirs
MODEL_ENV_FILE="$ROOT_DIR/runtime/config/${MODEL_NAME}.env"

map_key() {
  case "$1" in
    DEVICE) printf 'MODEL_DEVICE' ;;
    DISPLAY_NAME) printf 'MODEL_DISPLAY_NAME' ;;
    SOURCE_REPO) printf 'MODEL_SOURCE_REPO' ;;
    HF_REPO) printf 'MODEL_REPO' ;;
    HF_FILE) printf 'MODEL_FILENAME' ;;
    HF_PATTERN) printf 'MODEL_INCLUDE_PATTERN' ;;
    HF_REVISION) printf 'MODEL_REVISION' ;;
    PORT) printf 'MODEL_PORT' ;;
    HOST) printf 'MODEL_HOST' ;;
    CTX_SIZE|N_CTX) printf 'CONTEXT_SIZE' ;;
    EXTRA_ARGS) printf 'SERVER_EXTRA_ARGS' ;;
    *) printf '%s' "$1" ;;
  esac
}

for assignment in "$@"; do
  [[ "$assignment" == *=* ]] || fail "invalid assignment '${assignment}'"
  key="${assignment%%=*}"
  value="${assignment#*=}"
  mapped_key="$(map_key "$key")"
  upsert_key "$MODEL_ENV_FILE" "$mapped_key" "$value"
done

load_model_env "$MODEL_NAME"
apply_device_profile

printf '%s\n' \
  "MODEL=${MODEL_KEY}" \
  "DISPLAY=${MODEL_DISPLAY_NAME}" \
  "DEVICE=${MODEL_DEVICE}" \
  "HOST=${MODEL_HOST}" \
  "PORT=${MODEL_PORT}" \
  "REPO=${MODEL_REPO}" \
  "FILE=${MODEL_FILENAME}" \
  "PATTERN=${MODEL_INCLUDE_PATTERN}" \
  "CONTEXT=${CONTEXT_SIZE}"
