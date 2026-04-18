#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: set-active-loras.sh <model> [lora,lora,...]}"
ACTIVE_NAMES="${2:-}"

load_model_env "$MODEL_NAME"
load_lora_manifest
(( ${#AVAILABLE_LORA_NAMES[@]} > 0 )) || fail "no enabled LoRAs with local files are available for '${MODEL_NAME}'"

declare -A requested=()
if [[ -n "$ACTIVE_NAMES" ]]; then
  IFS=, read -r -a requested_names <<< "$ACTIVE_NAMES"
  for name in "${requested_names[@]}"; do
    requested["$name"]=1
  done
fi

payload="["
for idx in "${!AVAILABLE_LORA_NAMES[@]}"; do
  name="${AVAILABLE_LORA_NAMES[$idx]}"
  scale="0.0"
  if [[ -n "${requested[$name]:-}" ]]; then
    scale="${AVAILABLE_LORA_SCALES[$name]}"
  fi
  payload+="{\"id\":${idx},\"scale\":${scale}},"
done
payload="${payload%,}]"

curl -fsS \
  -H 'Content-Type: application/json' \
  -X POST \
  -d "$payload" \
  "$(model_url)/lora-adapters"

printf '%s\n' "$payload"

