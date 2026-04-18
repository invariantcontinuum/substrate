#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

KEY="${1:?usage: set-env-var.sh <key> <value>}"
VALUE="${2:?usage: set-env-var.sh <key> <value>}"

upsert_key "$ROOT_DIR/.env" "$KEY" "$VALUE"

