#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF_NAME="${1:-${GITHUB_REF_NAME:-main}}"
REF_NAME="${REF_NAME#refs/heads/}"
REF_NAME="${REF_NAME#refs/tags/}"

BASE_VERSION="$(ROOT_DIR="$ROOT_DIR" python3 - <<'PY'
import json
import os
from pathlib import Path

root = Path(os.environ["ROOT_DIR"])
print(json.loads((root / "package.json").read_text())["version"])
PY
)"

CHANNEL="snapshot"
IS_RELEASE="false"
VERSION="${BASE_VERSION}-SNAPSHOT"
RELEASE_TAG=""

if [[ "$REF_NAME" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  CHANNEL="release"
  IS_RELEASE="true"
  VERSION="${BASH_REMATCH[1]}"
  RELEASE_TAG="v${VERSION}"
fi

SHORT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
SHORT_SHA="${SHORT_SHA:0:12}"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'ref_name=%s\n' "$REF_NAME"
    printf 'base_version=%s\n' "$BASE_VERSION"
    printf 'channel=%s\n' "$CHANNEL"
    printf 'is_release=%s\n' "$IS_RELEASE"
    printf 'version=%s\n' "$VERSION"
    printf 'image_tag=%s\n' "$VERSION"
    printf 'release_tag=%s\n' "$RELEASE_TAG"
    printf 'short_sha=%s\n' "$SHORT_SHA"
  } >>"$GITHUB_OUTPUT"
fi

cat <<EOF
REF_NAME=$REF_NAME
BASE_VERSION=$BASE_VERSION
CHANNEL=$CHANNEL
IS_RELEASE=$IS_RELEASE
VERSION=$VERSION
IMAGE_TAG=$VERSION
RELEASE_TAG=$RELEASE_TAG
SHORT_SHA=$SHORT_SHA
EOF
