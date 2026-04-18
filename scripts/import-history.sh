#!/usr/bin/env bash
# One-shot history importer. After running once, the imported commits are
# first-class monorepo history; do not re-run.
#
# For each import:
#   1. Clone the source repo fresh into a work dir (bare then working copy).
#   2. Run `git filter-repo --subdirectory-filter <subpath>` if a subpath was given.
#   3. `git subtree add --prefix=<target>` from the filtered local clone.
set -euo pipefail

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

WORK=.import-work
mkdir -p "$WORK"

_clone_once() {
  local name="$1" remote="$2"
  local clone="$WORK/$name"
  if [[ -d "$clone" ]]; then
    echo "    work dir exists; skipping clone"
    return
  fi
  git clone --no-local --bare "$remote" "$clone.bare"
  git clone "$clone.bare" "$clone"
}

_do_subtree_add() {
  local name="$1" prefix="$2"
  local clone="$WORK/$name"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "    DRY_RUN: would subtree-add"
    return
  fi

  if [[ -e "$prefix" ]] && [[ -n "$(ls -A "$prefix" 2>/dev/null || true)" ]]; then
    rm -rf "$prefix"
  fi

  git remote add "import-$name" "$clone" 2>/dev/null || true
  git fetch "import-$name"
  git subtree add --prefix="$prefix" "import-$name" main
  git remote remove "import-$name"
}

# Import a sub-path of a source repo as a directory in this monorepo.
import() {
  local name="$1" remote="$2" subpath="$3" prefix="$4"
  echo
  echo "==> import $name ($remote :: $subpath -> $prefix)"
  _clone_once "$name" "$remote"
  (cd "$WORK/$name" && git filter-repo --force --subdirectory-filter "$subpath")
  _do_subtree_add "$name" "$prefix"
}

# Import a whole source repo as a directory in this monorepo (no subpath filter).
import_whole() {
  local name="$1" remote="$2" prefix="$3"
  echo
  echo "==> import-whole $name ($remote -> $prefix)"
  _clone_once "$name" "$remote"
  _do_subtree_add "$name" "$prefix"
}

# Phase 2 — from substrate-platform
import frontend   git@github.com:invariantcontinuum/substrate-platform.git frontend           apps/frontend
import gateway    git@github.com:invariantcontinuum/substrate-platform.git services/gateway   services/gateway
import ingestion  git@github.com:invariantcontinuum/substrate-platform.git services/ingestion services/ingestion
import graph      git@github.com:invariantcontinuum/substrate-platform.git services/graph     services/graph

echo
echo "substrate-platform imports complete."
