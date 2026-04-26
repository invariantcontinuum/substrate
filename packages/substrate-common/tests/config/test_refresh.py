"""ConfigRefresher rebinds ``module.settings`` after init + on_event."""
from __future__ import annotations

import sys
import types
from typing import Any, ClassVar

import pytest

from substrate_common.config import ConfigRefresher, LayeredSettings


class _DemoSettings(LayeredSettings):
    SCOPE: ClassVar[str] = "demo"
    chat_top_k: int = 10
    summary_instruction: str = "default"


class _FakeAcq:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    async def __aenter__(self) -> _FakeAcq:
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def fetch(self, _sql: str, *_args: Any) -> list[dict[str, Any]]:
        return list(self._rows)


class _FakePool:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows

    def acquire(self) -> _FakeAcq:
        return _FakeAcq(self.rows)


def _module_with_settings(initial: _DemoSettings) -> types.ModuleType:
    """Build a stand-in for a service's ``src.config`` module."""
    mod = types.ModuleType("test_demo_config")
    mod.settings = initial  # type: ignore[attr-defined]
    sys.modules["test_demo_config"] = mod
    return mod


@pytest.mark.asyncio
async def test_init_loads_overlay_and_rebinds_module_settings() -> None:
    mod = _module_with_settings(_DemoSettings())
    pool = _FakePool([{"key": "chat_top_k", "value": 99}])

    refresher = ConfigRefresher(
        scope="demo", settings_cls=_DemoSettings, config_module=mod,
    )
    await refresher.init(pool)

    assert mod.settings.chat_top_k == 99  # type: ignore[attr-defined]
    assert mod.settings.summary_instruction == "default"  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_on_event_filters_other_scopes() -> None:
    mod = _module_with_settings(_DemoSettings())
    pool = _FakePool([{"key": "chat_top_k", "value": 99}])

    refresher = ConfigRefresher(
        scope="demo", settings_cls=_DemoSettings, config_module=mod,
    )
    await refresher.init(pool)

    pool.rows = [{"key": "chat_top_k", "value": 7}]
    await refresher.on_event({"scope": "graph", "section": "chat", "keys": []})
    # graph-scope event ignored — overlay still has the init-time value.
    assert mod.settings.chat_top_k == 99  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_on_event_matching_scope_refreshes_overlay() -> None:
    mod = _module_with_settings(_DemoSettings())
    pool = _FakePool([{"key": "chat_top_k", "value": 99}])

    refresher = ConfigRefresher(
        scope="demo", settings_cls=_DemoSettings, config_module=mod,
    )
    await refresher.init(pool)
    assert mod.settings.chat_top_k == 99  # type: ignore[attr-defined]

    pool.rows = [{"key": "chat_top_k", "value": 7}]
    await refresher.on_event({
        "scope": "demo", "section": "chat",
        "keys": ["chat_top_k"], "updated_by": "tester",
    })

    assert mod.settings.chat_top_k == 7  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_on_event_decodes_string_jsonb_values() -> None:
    """When the pool lacks a JSONB codec, ``runtime_config.value`` arrives
    as a raw JSON string — RuntimeOverlay must decode it."""
    mod = _module_with_settings(_DemoSettings())
    # Simulate raw JSONB-as-string from a codec-less pool.
    pool = _FakePool([
        {"key": "chat_top_k", "value": "42"},
        {"key": "summary_instruction", "value": '"from-runtime"'},
    ])

    refresher = ConfigRefresher(
        scope="demo", settings_cls=_DemoSettings, config_module=mod,
    )
    await refresher.init(pool)

    assert mod.settings.chat_top_k == 42  # type: ignore[attr-defined]
    assert mod.settings.summary_instruction == "from-runtime"  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_on_event_silently_returns_when_overlay_uninitialised() -> None:
    """An event arriving before init() is a startup race — handler is
    defensive: no rebind, no exception."""
    mod = _module_with_settings(_DemoSettings())
    refresher = ConfigRefresher(
        scope="demo", settings_cls=_DemoSettings, config_module=mod,
    )
    # No init() call.
    await refresher.on_event({"scope": "demo", "section": "chat", "keys": []})
    # settings unchanged from the construction-time _DemoSettings().
    assert mod.settings.chat_top_k == 10  # type: ignore[attr-defined]
