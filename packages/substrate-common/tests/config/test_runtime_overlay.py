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


@pytest.mark.asyncio
async def test_string_jsonb_values_are_decoded():
    """Pools without a JSONB codec return raw JSON text in `value`. The
    overlay loader decodes it so consumers always see Python values.
    """
    pool = _FakePool([
        {"key": "chat_top_k", "value": "25"},
        {"key": "summary_instruction", "value": '"from-runtime"'},
        {"key": "active_set_leiden_labeling_enabled", "value": "true"},
    ])
    ro = RuntimeOverlay(scope="graph", pool=pool)
    await ro.refresh()
    assert ro.snapshot() == {
        "chat_top_k": 25,
        "summary_instruction": "from-runtime",
        "active_set_leiden_labeling_enabled": True,
    }


@pytest.mark.asyncio
async def test_unparseable_string_value_is_passed_through():
    """A non-JSON string (legacy data, deliberate plaintext) becomes the
    Python string itself rather than crashing the loader."""
    pool = _FakePool([{"key": "raw", "value": "not-json"}])
    ro = RuntimeOverlay(scope="graph", pool=pool)
    await ro.refresh()
    assert ro.snapshot() == {"raw": "not-json"}
