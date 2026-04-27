"""Shared test helpers: build a tmp repo + return a tree listing."""

from __future__ import annotations

import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

BuildTreeFn = Callable[[Path, dict[str, str]], tuple[str, list[dict[str, Any]]]]
LoadFixtureFn = Callable[[str], tuple[str, list[dict[str, Any]]]]


@pytest.fixture  # type: ignore[untyped-decorator]
def build_tree() -> BuildTreeFn:
    """Build a filesystem under tmp_path; return (root_dir, tree_list)."""
    def _build(tmp_path: Path, files: dict[str, str]) -> tuple[str, list[dict[str, Any]]]:
        for rel, content in files.items():
            p = tmp_path / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content)
        tree = [{"path": rel, "type": "blob"} for rel in files.keys()]
        return (str(tmp_path), tree)
    return _build


@pytest.fixture  # type: ignore[untyped-decorator]
def load_fixture() -> LoadFixtureFn:
    """Walk tests/fixtures/<name>/ and build a tree from it."""
    def _load(name: str) -> tuple[str, list[dict[str, Any]]]:
        base = Path(__file__).parent / "fixtures" / name
        if not base.is_dir():
            raise FileNotFoundError(base)
        files = []
        for root, _dirnames, filenames in os.walk(base):
            for fn in filenames:
                if fn == "expected.json":
                    continue
                abs_p = Path(root) / fn
                rel = abs_p.relative_to(base).as_posix()
                files.append(rel)
        tree = [{"path": r, "type": "blob"} for r in files]
        return (str(base), tree)
    return _load
