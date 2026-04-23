#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-$(pwd)}"
DEPLOY_REF="${DEPLOY_REF:-main}"
ENV_FILE="${ENV_FILE:-.env.prod}"

cd "$DEPLOY_PATH"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing to deploy from a dirty checkout in $DEPLOY_PATH" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE in $DEPLOY_PATH" >&2
  exit 1
fi

git fetch origin --prune --tags

if git show-ref --verify --quiet "refs/remotes/origin/${DEPLOY_REF}"; then
  if git show-ref --verify --quiet "refs/heads/${DEPLOY_REF}"; then
    git switch "$DEPLOY_REF"
  else
    git switch --create "$DEPLOY_REF" --track "origin/${DEPLOY_REF}"
  fi
  git pull --ff-only origin "$DEPLOY_REF"
else
  git checkout --detach "$DEPLOY_REF"
fi

ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f compose.yaml down --remove-orphans
ENV_FILE="$ENV_FILE" docker compose --env-file "$ENV_FILE" -f compose.yaml up -d --build --force-recreate
make doctor MODE=prod
