#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="$ROOT_DIR"
export PROJECT_ROOT

declare -ag AVAILABLE_LORA_NAMES=()
declare -Ag AVAILABLE_LORA_PATHS=()
declare -Ag AVAILABLE_LORA_SCALES=()

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

available_models_csv() {
  local path names=()
  shopt -s nullglob
  for path in "$ROOT_DIR"/config/models/*.env; do
    names+=("$(basename "${path%.env}")")
  done
  shopt -u nullglob
  printf '%s' "${names[*]}"
}

require_model() {
  local model="${1:?missing model name}"
  [[ -f "$ROOT_DIR/config/models/${model}.env" ]] || fail "unknown model '${model}'. expected one of: $(available_models_csv)"
}

load_global_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT_DIR/.env"
    set +a
  fi
}

resolve_threads_default() {
  local cpu_count
  cpu_count="$(nproc)"
  if (( cpu_count > 2 )); then
    printf '%s' "$((cpu_count - 2))"
  else
    printf '%s' "$cpu_count"
  fi
}

ensure_project_dirs() {
  mkdir -p \
    "$ROOT_DIR/logs" \
    "$ROOT_DIR/models" \
    "$ROOT_DIR/runtime" \
    "$ROOT_DIR/runtime/logs" \
    "$ROOT_DIR/runtime/config" \
    "$ROOT_DIR/runtime/config/loras" \
    "$ROOT_DIR/vendor"
}

contains_csv_item() {
  local csv="${1:-}" needle="${2:-}" item
  IFS=, read -r -a items <<< "$csv"
  for item in "${items[@]}"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}

model_service_name() {
  printf 'llamacpp-model@%s.service' "$1"
}

available_models_list() {
  local path
  shopt -s nullglob
  for path in "$ROOT_DIR"/config/models/*.env; do
    basename "${path%.env}"
  done
  shopt -u nullglob
}

load_model_env() {
  local model="${1:?missing model name}"

  require_model "$model"
  ensure_project_dirs
  load_global_env

  MODEL_ENV_FILE="$ROOT_DIR/config/models/${model}.env"
  set -a
  # shellcheck disable=SC1090
  source "$MODEL_ENV_FILE"
  if [[ -f "$ROOT_DIR/runtime/config/${model}.env" ]]; then
    # shellcheck disable=SC1090
    source "$ROOT_DIR/runtime/config/${model}.env"
  fi
  set +a

  MODEL_KEY="${MODEL_KEY:-$model}"
  MODEL_DISPLAY_NAME="${MODEL_DISPLAY_NAME:-$model}"
  MODEL_SOURCE_REPO="${MODEL_SOURCE_REPO:-${MODEL_REPO:-}}"
  MODEL_REPO="${MODEL_REPO:-}"
  MODEL_FILENAME="${MODEL_FILENAME:-}"
  [[ -n "$MODEL_REPO" ]] || fail "MODEL_REPO is not set in ${MODEL_ENV_FILE}"
  [[ -n "$MODEL_FILENAME" ]] || fail "MODEL_FILENAME is not set in ${MODEL_ENV_FILE}"
  MODEL_INCLUDE_PATTERN="${MODEL_INCLUDE_PATTERN:-$MODEL_FILENAME}"
  MODEL_REVISION="${MODEL_REVISION:-main}"
  MODEL_DIR="${MODEL_DIR:-$ROOT_DIR/models/$MODEL_KEY}"
  MODEL_FILE="${MODEL_FILE:-$MODEL_DIR/$MODEL_FILENAME}"
  MODEL_ALLOWED_DEVICES="${MODEL_ALLOWED_DEVICES:-cpu,gpu}"
  MODEL_DEVICE="${MODEL_DEVICE:-cpu}"
  MODEL_HOST="${MODEL_HOST:-127.0.0.1}"
  MODEL_PORT="${MODEL_PORT:-8080}"
  SERVER_MODE="${SERVER_MODE:-generate}"
  CONTEXT_SIZE="${CONTEXT_SIZE:-4096}"
  THREADS="${THREADS:-$(resolve_threads_default)}"
  PARALLEL="${PARALLEL:-1}"
  CPU_BATCH="${CPU_BATCH:-512}"
  CPU_UBATCH="${CPU_UBATCH:-128}"
  GPU_BATCH="${GPU_BATCH:-1024}"
  GPU_UBATCH="${GPU_UBATCH:-512}"
  GPU_LAYERS="${GPU_LAYERS:-99}"
  CPU_EXTRA_ARGS="${CPU_EXTRA_ARGS:-}"
  GPU_EXTRA_ARGS="${GPU_EXTRA_ARGS:-}"
  SERVER_EXTRA_ARGS="${SERVER_EXTRA_ARGS:-}"
  SERVER_API_KEY="${SERVER_API_KEY:-}"
  POOLING="${POOLING:-}"
  LORA_ENABLED="${LORA_ENABLED:-false}"
  LORA_MANIFEST="${LORA_MANIFEST:-}"

  mkdir -p "$MODEL_DIR"
}

apply_device_profile() {
  contains_csv_item "$MODEL_ALLOWED_DEVICES" "$MODEL_DEVICE" || fail "model '${MODEL_KEY}' does not allow device '${MODEL_DEVICE}' (allowed: ${MODEL_ALLOWED_DEVICES})"

  case "$MODEL_DEVICE" in
    cpu)
      RUNTIME_GPU_LAYERS=0
      RUNTIME_BATCH="$CPU_BATCH"
      RUNTIME_UBATCH="$CPU_UBATCH"
      RUNTIME_EXTRA_ARGS="$CPU_EXTRA_ARGS"
      ;;
    gpu)
      RUNTIME_GPU_LAYERS="$GPU_LAYERS"
      RUNTIME_BATCH="$GPU_BATCH"
      RUNTIME_UBATCH="$GPU_UBATCH"
      RUNTIME_EXTRA_ARGS="$GPU_EXTRA_ARGS"
      ;;
    *)
      fail "unsupported device '${MODEL_DEVICE}'"
      ;;
  esac
}

append_split_args() {
  local value="${1:-}"
  local -a parts=()
  [[ -n "$value" ]] || return 0
  read -r -a parts <<< "$value"
  SERVER_ARGS+=("${parts[@]}")
}

resolve_llama_server_bin() {
  local candidate
  for candidate in \
    "${LLAMA_SERVER_BIN:-}" \
    "$ROOT_DIR/vendor/llama.cpp/build/bin/llama-server" \
    "$ROOT_DIR/vendor/llama.cpp/build/bin/Release/llama-server" \
    "$(command -v llama-server 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  fail "llama-server was not found. run 'make install-prereqs' or set LLAMA_SERVER_BIN in .env"
}

resolve_python_bin() {
  local candidate
  for candidate in \
    "${HF_PYTHON_BIN:-}" \
    "$ROOT_DIR/.venv/bin/python" \
    "$(command -v python3 2>/dev/null || true)"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  fail "python3 was not found"
}

upsert_key() {
  local file="${1:?missing file}" key="${2:?missing key}" value="${3:-}"
  local escaped tmp

  printf -v escaped '%q' "$value"
  tmp="$(mktemp)"

  if [[ -f "$file" ]]; then
    awk -v key="$key" -v line="$key=$escaped" '
      BEGIN { done = 0 }
      index($0, key "=") == 1 { print line; done = 1; next }
      { print }
      END { if (!done) print line }
    ' "$file" > "$tmp"
  else
    printf '%s\n' "$key=$escaped" > "$tmp"
  fi

  mv "$tmp" "$file"
}

load_lora_manifest() {
  local name key enabled_var path_var scale_var enabled path scale

  AVAILABLE_LORA_NAMES=()
  AVAILABLE_LORA_PATHS=()
  AVAILABLE_LORA_SCALES=()

  [[ "$LORA_ENABLED" == "true" ]] || return 0
  [[ -n "$LORA_MANIFEST" && -f "$LORA_MANIFEST" ]] || return 0

  set -a
  # shellcheck disable=SC1090
  source "$LORA_MANIFEST"
  if [[ -f "$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env" ]]; then
    # shellcheck disable=SC1090
    source "$ROOT_DIR/runtime/config/loras/${MODEL_KEY}.env"
  fi
  set +a

  for name in ${LORA_NAMES:-}; do
    key="$(printf '%s' "$name" | tr '[:lower:]-' '[:upper:]_')"
    enabled_var="LORA_${key}_ENABLED"
    path_var="LORA_${key}_PATH"
    scale_var="LORA_${key}_SCALE"

    enabled="$(eval "printf '%s' \"\${$enabled_var:-false}\"")"
    path="$(eval "printf '%s' \"\${$path_var:-}\"")"
    scale="$(eval "printf '%s' \"\${$scale_var:-0.0}\"")"

    if [[ "$enabled" == "true" && -n "$path" && -f "$path" ]]; then
      AVAILABLE_LORA_NAMES+=("$name")
      AVAILABLE_LORA_PATHS["$name"]="$path"
      AVAILABLE_LORA_SCALES["$name"]="$scale"
    fi
  done
}

build_server_args() {
  load_lora_manifest

  SERVER_ARGS=(
    --host "$MODEL_HOST"
    --port "$MODEL_PORT"
    --model "$MODEL_FILE"
    -c "$CONTEXT_SIZE"
    -t "$THREADS"
    -b "$RUNTIME_BATCH"
    -ub "$RUNTIME_UBATCH"
    -np "$PARALLEL"
    -ngl "$RUNTIME_GPU_LAYERS"
  )

  case "$SERVER_MODE" in
    generate)
      ;;
    embedding)
      SERVER_ARGS+=(--embedding)
      [[ -n "$POOLING" ]] && SERVER_ARGS+=(--pooling "$POOLING")
      ;;
    reranking)
      SERVER_ARGS+=(--reranking)
      ;;
    *)
      fail "unsupported SERVER_MODE '${SERVER_MODE}'"
      ;;
  esac

  [[ -n "$SERVER_API_KEY" ]] && SERVER_ARGS+=(--api-key "$SERVER_API_KEY")
  append_split_args "$SERVER_EXTRA_ARGS"
  append_split_args "$RUNTIME_EXTRA_ARGS"

  if (( ${#AVAILABLE_LORA_NAMES[@]} > 0 )); then
    local name
    SERVER_ARGS+=(--lora-init-without-apply)
    for name in "${AVAILABLE_LORA_NAMES[@]}"; do
      SERVER_ARGS+=(--lora-scaled "${AVAILABLE_LORA_PATHS[$name]}" "${AVAILABLE_LORA_SCALES[$name]}")
    done
  fi
}

model_url() {
  printf 'http://%s:%s' "$MODEL_HOST" "$MODEL_PORT"
}
