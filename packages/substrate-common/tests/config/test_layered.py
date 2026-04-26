"""Verify LayeredSettings precedence: defaults < yaml < env < cli < runtime."""
from __future__ import annotations

from substrate_common.config import LayeredSettings


class _DemoSettings(LayeredSettings):
    SCOPE = "demo"
    chat_top_k: int = 10
    summary_total_budget_chars: int = 100000


def test_defaults_only(tmp_path, monkeypatch):
    monkeypatch.delenv("CHAT_TOP_K", raising=False)
    s = _DemoSettings()
    assert s.chat_top_k == 10
    assert s.summary_total_budget_chars == 100000


def test_env_overrides_defaults(monkeypatch):
    monkeypatch.setenv("CHAT_TOP_K", "15")
    s = _DemoSettings()
    assert s.chat_top_k == 15


def test_runtime_overlay_overrides_env(monkeypatch):
    monkeypatch.setenv("CHAT_TOP_K", "15")
    overlay = {"chat_top_k": 99}
    s = _DemoSettings(_runtime_overlay=overlay)
    assert s.chat_top_k == 99


def test_runtime_overlay_partial(monkeypatch):
    """Overlay only overrides the keys it sets; others fall through."""
    monkeypatch.setenv("CHAT_TOP_K", "15")
    overlay = {"summary_total_budget_chars": 80000}
    s = _DemoSettings(_runtime_overlay=overlay)
    assert s.chat_top_k == 15
    assert s.summary_total_budget_chars == 80000
