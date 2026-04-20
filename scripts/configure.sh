#!/usr/bin/env bash
# Bootstrap .env if missing, then render the Keycloak realm JSON from
# the committed template using values in .env. Called by `make up`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -f .env ]]; then
    cp .env.example .env
    echo "configure: created .env from .env.example"
    echo "configure: review .env (especially passwords and URLs for prod), then re-run 'make up'"
    exit 1
fi

# Export every assignment from .env so render-realm.py sees them.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

python3 scripts/render-realm.py
