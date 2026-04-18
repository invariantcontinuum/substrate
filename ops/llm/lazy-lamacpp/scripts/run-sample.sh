#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: run-sample.sh <model> [sample]}"
SAMPLE_NAME="${2:-}"

load_model_env "$MODEL_NAME"

unit="$(model_service_name "$MODEL_KEY")"
if ! systemctl --user is-active "$unit" >/dev/null 2>&1; then
  fail "model '${MODEL_KEY}' is not active. run 'make start MODEL=${MODEL_KEY}' first"
fi

wait_for_ready() {
  local url="${1:?missing url}"
  local tries="${2:-180}"
  local i

  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "$url/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

wait_for_ready "$(model_url)" 180 || fail "model '${MODEL_KEY}' did not become ready at $(model_url)/health"

sample_root="$ROOT_DIR/data/$MODEL_KEY"
[[ -d "$sample_root" ]] || fail "sample directory '${sample_root}' does not exist"

if [[ -n "$SAMPLE_NAME" ]]; then
  sample_file="$sample_root/$SAMPLE_NAME/request.json"
  [[ -f "$sample_file" ]] || fail "sample '${SAMPLE_NAME}' not found for model '${MODEL_KEY}'"
else
  sample_file="$(find "$sample_root" -mindepth 2 -maxdepth 2 -type f -name request.json | sort | head -n 1)"
  [[ -n "$sample_file" ]] || fail "no request.json sample files found in '${sample_root}'"
  SAMPLE_NAME="$(basename "$(dirname "$sample_file")")"
fi

python3 "$ROOT_DIR/scripts/run-sample.py" \
  --model-key "$MODEL_KEY" \
  --model-name "$MODEL_DISPLAY_NAME" \
  --url "$(model_url)" \
  --sample-name "$SAMPLE_NAME" \
  --sample-file "$sample_file"
