#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if (( $# > 0 )); then
  MODELS_TO_RUN=("$@")
else
  mapfile -t MODELS_TO_RUN < <(available_models_list)
fi

(( ${#MODELS_TO_RUN[@]} > 0 )) || fail "no models selected"

mapfile -t CURRENTLY_ACTIVE < <(
  systemctl --user list-units 'llamacpp-model@*.service' --state=active --no-legend --no-pager \
    | awk '{print $1}' \
    | sed -E 's/^llamacpp-model@(.*)\.service$/\1/'
)

for model in "${CURRENTLY_ACTIVE[@]}"; do
  [[ -n "$model" ]] || continue
  printf 'stopping-active=%s\n' "$model"
  make --no-print-directory stop MODEL="$model"
done

for idx in "${!MODELS_TO_RUN[@]}"; do
  model="${MODELS_TO_RUN[$idx]}"
  printf 'starting=%s\n' "$model"
  make --no-print-directory start MODEL="$model"
  printf 'sampling=%s\n' "$model"
  make --no-print-directory sample MODEL="$model"
  if (( idx < ${#MODELS_TO_RUN[@]} - 1 )); then
    printf 'stopping=%s\n' "$model"
    make --no-print-directory stop MODEL="$model"
  fi
done

