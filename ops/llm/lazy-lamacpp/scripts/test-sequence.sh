#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

wait_for_active() {
  local unit="${1:?missing unit}"
  local tries="${2:-90}"
  local active_state sub_state i

  for ((i = 1; i <= tries; i++)); do
    active_state="$(systemctl --user show "$unit" -p ActiveState --value 2>/dev/null || true)"
    sub_state="$(systemctl --user show "$unit" -p SubState --value 2>/dev/null || true)"

    if [[ "$active_state" == "active" && "$sub_state" == "running" ]]; then
      return 0
    fi

    sleep 1
  done

  return 1
}

active_models() {
  systemctl --user list-units 'llamacpp-model@*.service' --state=active --no-legend --no-pager \
    | awk '{print $1}' \
    | sed -E 's/^llamacpp-model@(.*)\.service$/\1/'
}

status_brief() {
  local unit="${1:?missing unit}"

  paste -sd '|' < <(
    systemctl --user show "$unit" \
      -p Id \
      -p ActiveState \
      -p SubState \
      -p MainPID \
      -p ActiveEnterTimestamp \
      --value
  )
}

if (( $# > 0 )); then
  MODELS_TO_TEST=("$@")
else
  mapfile -t MODELS_TO_TEST < <(available_models_list)
fi

(( ${#MODELS_TO_TEST[@]} > 0 )) || fail "no models are configured"

printf 'sequence=%s\n' "${MODELS_TO_TEST[*]}"

mapfile -t CURRENTLY_ACTIVE < <(active_models || true)
if (( ${#CURRENTLY_ACTIVE[@]} > 0 )); then
  for model in "${CURRENTLY_ACTIVE[@]}"; do
    printf 'stopping-active=%s\n' "$model"
    make --no-print-directory stop MODEL="$model"
  done
fi

for idx in "${!MODELS_TO_TEST[@]}"; do
  model="${MODELS_TO_TEST[$idx]}"
  unit="$(model_service_name "$model")"

  printf 'starting=%s\n' "$model"
  make --no-print-directory start MODEL="$model"

  if wait_for_active "$unit" 90; then
    printf 'verified=%s\n' "$model"
    printf 'status=%s\n' "$(status_brief "$unit")"
  else
    printf 'failed=%s\n' "$model" >&2
    systemctl --user --no-pager --full status "$unit" >&2 || true
    journalctl --user -u "$unit" -n 120 --no-pager >&2 || true
    exit 1
  fi

  if (( idx < ${#MODELS_TO_TEST[@]} - 1 )); then
    printf 'stopping=%s\n' "$model"
    make --no-print-directory stop MODEL="$model"
  fi
done

