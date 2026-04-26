"""YAML source for LayeredSettings.

Reads the path from the SUBSTRATE_CONFIG_YAML env var (default
/etc/substrate/config.yaml). Looks up the SCOPE-keyed section.

Silently skips when the file is absent or unreadable; missing yaml is a
valid deployment shape (env-only).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic.fields import FieldInfo
from pydantic_settings.sources import PydanticBaseSettingsSource


class YamlSource(PydanticBaseSettingsSource):
    def __init__(self, settings_cls: type) -> None:
        super().__init__(settings_cls)
        self._scope = getattr(settings_cls, "SCOPE", "") or ""
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        path = Path(os.environ.get("SUBSTRATE_CONFIG_YAML", "/etc/substrate/config.yaml"))
        if not path.is_file():
            return {}
        try:
            doc = yaml.safe_load(path.read_text()) or {}
        except (yaml.YAMLError, OSError):
            return {}
        section = doc.get(self._scope, {}) if self._scope else doc
        return section if isinstance(section, dict) else {}

    def get_field_value(self, field: FieldInfo, field_name: str) -> tuple[Any, str, bool]:
        if field_name in self._data:
            return self._data[field_name], field_name, False
        return None, field_name, False

    def __call__(self) -> dict[str, Any]:
        return dict(self._data)
