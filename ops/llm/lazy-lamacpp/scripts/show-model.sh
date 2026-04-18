#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

MODEL_NAME="${1:?usage: show-model.sh <model>}"

load_model_env "$MODEL_NAME"
apply_device_profile
build_server_args

printf '%s\n' \
  "MODEL=${MODEL_KEY}" \
  "DISPLAY=${MODEL_DISPLAY_NAME}" \
  "SOURCE_REPO=${MODEL_SOURCE_REPO}" \
  "HF_REPO=${MODEL_REPO}" \
  "HF_FILE=${MODEL_FILENAME}" \
  "HF_PATTERN=${MODEL_INCLUDE_PATTERN}" \
  "LOCAL_FILE=${MODEL_FILE}" \
  "DEVICE=${MODEL_DEVICE}" \
  "HOST=${MODEL_HOST}" \
  "PORT=${MODEL_PORT}" \
  "CONTEXT=${CONTEXT_SIZE}" \
  "THREADS=${THREADS}" \
  "GPU_LAYERS=${RUNTIME_GPU_LAYERS}" \
  "BATCH=${RUNTIME_BATCH}" \
  "UBATCH=${RUNTIME_UBATCH}" \
  "MODE=${SERVER_MODE}"

if (( ${#AVAILABLE_LORA_NAMES[@]} > 0 )); then
  printf 'LORAS=%s\n' "${AVAILABLE_LORA_NAMES[*]}"
fi

