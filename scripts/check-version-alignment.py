#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROOT_VERSION = json.loads((ROOT / "package.json").read_text())["version"]


def package_version(path: Path) -> str:
    return json.loads(path.read_text())["version"]


def pyproject_version(path: Path) -> str:
    match = re.search(r'^version\s*=\s*"([^"]+)"', path.read_text(), re.MULTILINE)
    if not match:
        raise RuntimeError(f"missing version in {path}")
    return match.group(1)


CHECKS = {
    ROOT / "apps/frontend/package.json": package_version,
    ROOT / "packages/substrate-web-common/package.json": package_version,
    ROOT / "packages/substrate-common/pyproject.toml": pyproject_version,
    ROOT / "packages/substrate-graph-builder/pyproject.toml": pyproject_version,
    ROOT / "services/gateway/pyproject.toml": pyproject_version,
    ROOT / "services/ingestion/pyproject.toml": pyproject_version,
    ROOT / "services/graph/pyproject.toml": pyproject_version,
}


def main() -> int:
    mismatches: list[str] = []
    for path, reader in CHECKS.items():
        current = reader(path)
        if current != ROOT_VERSION:
            mismatches.append(f"{path.relative_to(ROOT)}: expected {ROOT_VERSION}, found {current}")

    if mismatches:
        print("version alignment check failed:", file=sys.stderr)
        for mismatch in mismatches:
            print(f"  - {mismatch}", file=sys.stderr)
        return 1

    print(f"version alignment OK: {ROOT_VERSION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
