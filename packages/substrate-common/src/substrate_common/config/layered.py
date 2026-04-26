"""LayeredSettings: Pydantic v2 BaseSettings with a runtime overlay layer.

Precedence (highest first):
  1. _runtime_overlay kwarg (Postgres-backed runtime_config)
  2. CLI args (parsed by cli.py and injected via init kwargs)
  3. Process env (Pydantic env source)
  4. config.yaml (YamlSource — added in Task 1.2)
  5. Pydantic field defaults

The overlay is a flat ``dict[str, Any]`` keyed by lowercase field name.
Services rebuild their settings instance via ``Settings(_runtime_overlay=...)``
when they receive an SSE ``config.updated`` event.
"""
from __future__ import annotations

from typing import Any, ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class LayeredSettings(BaseSettings):
    """Base for service settings with a runtime overlay layer."""

    SCOPE: ClassVar[str] = ""

    model_config = SettingsConfigDict(extra="ignore", populate_by_name=True)

    def __init__(self, *, _runtime_overlay: dict[str, Any] | None = None, **kwargs: Any) -> None:
        if _runtime_overlay:
            for key, value in _runtime_overlay.items():
                kwargs[key] = value
        super().__init__(**kwargs)
