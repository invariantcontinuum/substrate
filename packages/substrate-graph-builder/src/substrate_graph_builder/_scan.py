"""One-shot repo pre-scans populating RepoContext fields.

These are called exactly once per build_graph() invocation, before any
plugin runs. Each function returns an empty default if the relevant config
file is absent or malformed — never raises.
"""

from __future__ import annotations

import json
import os
import re

import structlog

logger = structlog.get_logger()

_GO_MOD_MODULE = re.compile(r"^\s*module\s+(\S+)", re.MULTILINE)


def read_go_module(root_dir: str) -> str | None:
    """Read the `module` line from go.mod at repo root, if present."""
    path = os.path.join(root_dir, "go.mod")
    try:
        with open(path, errors="replace") as f:
            m = _GO_MOD_MODULE.search(f.read())
            return m.group(1) if m else None
    except (FileNotFoundError, OSError, UnicodeDecodeError):
        return None


def read_tsconfig_paths(root_dir: str) -> dict[str, list[str]]:
    """Parse `compilerOptions.paths` from tsconfig.json; normalize wildcards.

    Returns alias → list of candidate target prefixes (without `*`), all
    relative to the tsconfig's own `baseUrl` (default: tsconfig directory).
    """
    path = os.path.join(root_dir, "tsconfig.json")
    try:
        with open(path, errors="replace") as f:
            # tsconfig may contain JSONC (comments); strip line/block comments
            raw = _strip_jsonc_comments(f.read())
            cfg = json.loads(raw)
    except (FileNotFoundError, OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}

    opts = cfg.get("compilerOptions") or {}
    paths = opts.get("paths") or {}
    base_url = opts.get("baseUrl") or "."
    base = os.path.normpath(base_url).lstrip("./")

    out: dict[str, list[str]] = {}
    for key, targets in paths.items():
        if not isinstance(targets, list):
            continue
        stripped_key = key[:-2] if key.endswith("/*") else key
        out[stripped_key] = [
            os.path.normpath(os.path.join(base, t[:-2] if t.endswith("/*") else t))
            for t in targets
            if isinstance(t, str)
        ]
    return out


def read_composer_psr4(root_dir: str) -> dict[str, list[str]]:
    """Read PSR-4 autoload map from composer.json: namespace prefix → dir(s)."""
    path = os.path.join(root_dir, "composer.json")
    try:
        with open(path, errors="replace") as f:
            cfg = json.load(f)
    except (FileNotFoundError, OSError, UnicodeDecodeError, json.JSONDecodeError):
        return {}

    out: dict[str, list[str]] = {}
    for section in ("autoload", "autoload-dev"):
        psr4 = (cfg.get(section) or {}).get("psr-4") or {}
        for prefix, target in psr4.items():
            if isinstance(target, str):
                out.setdefault(prefix.rstrip("\\"), []).append(target.rstrip("/"))
            elif isinstance(target, list):
                for t in target:
                    if isinstance(t, str):
                        out.setdefault(prefix.rstrip("\\"), []).append(t.rstrip("/"))
    return out


_CSHARP_NAMESPACE = re.compile(r"^\s*namespace\s+([A-Za-z_][\w.]*)", re.MULTILINE)


def build_csharp_namespace_index(root_dir: str) -> dict[str, list[str]]:
    """Walk `.cs` files; collect `namespace X.Y.Z` → [file_path, ...].

    Populates the C# resolver's lookup so `using X.Y` maps to every `.cs`
    file declaring that namespace. Empty dict if no .cs files.
    """
    index: dict[str, list[str]] = {}
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d != ".git"]
        for fn in filenames:
            if not fn.endswith(".cs"):
                continue
            abs_path = os.path.join(dirpath, fn)
            rel = os.path.relpath(abs_path, root_dir)
            try:
                with open(abs_path, errors="replace") as f:
                    content = f.read()
            except (OSError, UnicodeDecodeError):
                continue
            for m in _CSHARP_NAMESPACE.finditer(content):
                ns = m.group(1)
                index.setdefault(ns, []).append(rel)
    return index


def _strip_jsonc_comments(s: str) -> str:
    # crude but sufficient for tsconfig.json; not a full JSONC parser
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        ch = s[i]
        # line comment
        if ch == "/" and i + 1 < n and s[i + 1] == "/":
            while i < n and s[i] != "\n":
                i += 1
            continue
        # block comment
        if ch == "/" and i + 1 < n and s[i + 1] == "*":
            i += 2
            while i < n - 1 and not (s[i] == "*" and s[i + 1] == "/"):
                i += 1
            i += 2
            continue
        # string literal (skip to closing quote, respecting backslash)
        if ch == '"':
            out.append(ch)
            i += 1
            while i < n and s[i] != '"':
                if s[i] == "\\" and i + 1 < n:
                    out.append(s[i:i + 2])
                    i += 2
                    continue
                out.append(s[i])
                i += 1
            if i < n:
                out.append(s[i])
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)
