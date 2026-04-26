"""Verify RuntimeOverlay loads from runtime_config rows and refreshes on demand."""
from __future__ import annotations

from typing import Any

import pytest

from substrate_common.config.runtime_overlay import RuntimeOverlay


class _FakePool:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def acquire(self):
        return _FakeAcq(self._rows)


class _FakeAcq:
    def __init__(self, rows): self._rows = rows
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return None
    async def fetch(self, sql: str, *args):
        return list(self._rows)


@pytest.mark.asyncio
async def test_load_overlay():
    pool = _FakePool([
        {"key": "chat_top_k", "value": 25},
        {"key": "summary_instruction", "value": "from-runtime"},
    ])
    ro = RuntimeOverlay(scope="graph", pool=pool)
    await ro.refresh()
    assert ro.snapshot() == {"chat_top_k": 25, "summary_instruction": "from-runtime"}


@pytest.mark.asyncio
async def test_empty_overlay():
    pool = _FakePool([])
    ro = RuntimeOverlay(scope="graph", pool=pool)
    await ro.refresh()
    assert ro.snapshot() == {}


@pytest.mark.asyncio
async def test_refresh_replaces_snapshot():
    pool = _FakePool([{"key": "chat_top_k", "value": 25}])
    ro = RuntimeOverlay(scope="graph", pool=pool)
    await ro.refresh()
    assert ro.snapshot() == {"chat_top_k": 25}
    pool._rows = [{"key": "chat_top_k", "value": 99}]
    await ro.refresh()
    assert ro.snapshot() == {"chat_top_k": 99}
