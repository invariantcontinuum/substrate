"""Verify YamlSource reads /etc/substrate/config.yaml or skip if absent."""
from __future__ import annotations

import textwrap

from substrate_common.config import LayeredSettings


class _DemoSettings(LayeredSettings):
    SCOPE = "demo"
    chat_top_k: int = 10
    summary_instruction: str = "default"


def test_yaml_overrides_defaults(tmp_path, monkeypatch):
    yml = tmp_path / "config.yaml"
    yml.write_text(textwrap.dedent("""
        demo:
          chat_top_k: 25
          summary_instruction: from-yaml
    """).strip())
    monkeypatch.setenv("SUBSTRATE_CONFIG_YAML", str(yml))
    s = _DemoSettings()
    assert s.chat_top_k == 25
    assert s.summary_instruction == "from-yaml"


def test_env_beats_yaml(tmp_path, monkeypatch):
    yml = tmp_path / "config.yaml"
    yml.write_text("demo:\n  chat_top_k: 25")
    monkeypatch.setenv("SUBSTRATE_CONFIG_YAML", str(yml))
    monkeypatch.setenv("CHAT_TOP_K", "33")
    s = _DemoSettings()
    assert s.chat_top_k == 33


def test_missing_yaml_is_silent(monkeypatch):
    monkeypatch.setenv("SUBSTRATE_CONFIG_YAML", "/does/not/exist.yaml")
    s = _DemoSettings()
    assert s.chat_top_k == 10
