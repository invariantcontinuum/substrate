#!/usr/bin/env bash
# Bootstrap the active env file (${ENV_FILE} — defaults to .env.local) and
# render the Keycloak realm JSON from the committed template. Called by
# `make up`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-.env.local}"
EXAMPLE="${ENV_FILE}.example"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ ! -f "$EXAMPLE" ]]; then
        echo "configure: no $ENV_FILE and no template $EXAMPLE — aborting" >&2
        exit 1
    fi
    cp "$EXAMPLE" "$ENV_FILE"
    echo "configure: created $ENV_FILE from $EXAMPLE"
    echo "configure: review $ENV_FILE (especially passwords and URLs for prod), then re-run 'make up'"
    exit 1
fi

# Export every assignment from the active env file so render-realm.py sees them.
set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

python3 scripts/render-realm.py
