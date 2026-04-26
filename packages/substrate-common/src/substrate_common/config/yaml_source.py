"""YAML source for LayeredSettings.

Path resolution (first match wins):
1. ``SUBSTRATE_CONFIG_YAML`` env var (explicit override, used by tests)
2. ``./config.yaml`` next to the service's CWD (the canonical layout —
   each service ships ``services/<svc>/config.yaml`` and the container
   sets WORKDIR to that directory, so a bare ``config.yaml`` resolves
   to the service-local file at runtime).
3. ``/etc/substrate/config.yaml`` (legacy fallback for deployments
   that mount a single shared yaml).

YAML layout: flat keys at the document root (recommended for the
service-local file), or a top-level ``<SCOPE>:`` block when one yaml
serves multiple services. The loader tries the scope-keyed lookup
first and falls back to the flat document.

Silently skips when no yaml is found or the file is unreadable;
missing yaml is a valid deployment shape (env-only).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic.fields import FieldInfo
from pydantic_settings.sources import PydanticBaseSettingsSource


_SEARCH_PATHS = (Path("config.yaml"), Path("/etc/substrate/config.yaml"))


class YamlSource(PydanticBaseSettingsSource):
    def __init__(self, settings_cls: type) -> None:
        super().__init__(settings_cls)
        self._scope = getattr(settings_cls, "SCOPE", "") or ""
        self._data = self._load()

    def _resolve_path(self) -> Path | None:
        explicit = os.environ.get("SUBSTRATE_CONFIG_YAML")
        if explicit:
            p = Path(explicit)
            return p if p.is_file() else None
        for candidate in _SEARCH_PATHS:
            if candidate.is_file():
                return candidate
        return None

    def _load(self) -> dict[str, Any]:
        path = self._resolve_path()
        if path is None:
            return {}
        try:
            doc = yaml.safe_load(path.read_text()) or {}
        except (yaml.YAMLError, OSError):
            return {}
        if not isinstance(doc, dict):
            return {}
        if self._scope and isinstance(doc.get(self._scope), dict):
            return doc[self._scope]
        return doc

    def get_field_value(self, field: FieldInfo, field_name: str) -> tuple[Any, str, bool]:
        if field_name in self._data:
            return self._data[field_name], field_name, False
        return None, field_name, False

    def __call__(self) -> dict[str, Any]:
        return dict(self._data)
