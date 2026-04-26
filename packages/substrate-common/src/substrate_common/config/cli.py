"""CLI override parser for LayeredSettings.

Supports repeated ``--override key=value`` flags. Values are coerced to
``int`` / ``float`` / ``bool`` when they parse cleanly, else left as ``str``.
Returns a flat ``dict[str, Any]`` callers pass into ``Settings(**cli_overrides)``.
"""
from __future__ import annotations

from typing import Any


def _coerce(raw: str) -> Any:
    lower = raw.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        pass
    return raw


def parse_overrides(argv: list[str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    i = 0
    while i < len(argv):
        if argv[i] == "--override":
            if i + 1 >= len(argv):
                raise ValueError("--override requires a value")
            kv = argv[i + 1]
            if "=" not in kv:
                raise ValueError(f"--override expects key=value, got: {kv!r}")
            key, _, value = kv.partition("=")
            out[key.strip()] = _coerce(value)
            i += 2
        else:
            i += 1
    return out
