#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: run-llama-server.sh <model>}"

load_model_env "$MODEL_NAME"
apply_device_profile
build_server_args

LLAMA_SERVER_BIN="$(resolve_llama_server_bin)"
[[ -f "$MODEL_FILE" ]] || fail "model file '${MODEL_FILE}' does not exist. run 'make download MODEL=${MODEL_KEY}' first"

mkdir -p "$ROOT_DIR/runtime/logs"

printf '[%s] starting %s on %s using %s\n' \
  "$(date -Iseconds)" \
  "$MODEL_KEY" \
  "$MODEL_DEVICE" \
  "$MODEL_FILE" >&2

exec "$LLAMA_SERVER_BIN" "${SERVER_ARGS[@]}"

