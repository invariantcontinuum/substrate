#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="${1:?usage: run-with-log.sh <action> <command> [args...]}"
shift

[[ $# -gt 0 ]] || {
  printf 'error: missing command for action %s\n' "$ACTION" >&2
  exit 1
}

mkdir -p "$ROOT_DIR/logs"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$ROOT_DIR/logs/${ACTION}-${TIMESTAMP}.log"

{
  printf 'action=%s\n' "$ACTION"
  printf 'timestamp=%s\n' "$(date -Iseconds)"
  printf 'cwd=%s\n' "$PWD"
  printf 'command='
  printf '%q ' "$@"
  printf '\n\n'
} > "$LOG_FILE"

printf 'log=%s\n' "$LOG_FILE" >&2
"$@" 2>&1 | tee -a "$LOG_FILE"
