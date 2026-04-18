"""PluginRegistry — keyed lookup by extension or filename.

Baked-in, not entry_points-driven. See D-022 Q3 for the KISS rationale:
ingestion is the only consumer today; entry_points is extensibility we
can migrate to later without breaking the `get_for_path` API.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from substrate_graph_builder.plugins._base import LanguagePlugin


class PluginRegistry:
    """Maps file paths to language plugins. Filenames win over extensions
    (e.g. `CMakeLists.txt` → cmake even though it's `.txt`)."""

    def __init__(self, plugins: list[LanguagePlugin]) -> None:
        self._plugins = list(plugins)
        self._by_ext: dict[str, LanguagePlugin] = {}
        self._by_name: dict[str, LanguagePlugin] = {}
        for p in plugins:
            for ext in p.extensions:
                self._by_ext[ext.lower()] = p
            for name in p.filenames:
                self._by_name[name] = p

    def get_for_path(self, path: str) -> LanguagePlugin | None:
        name = path.rsplit("/", 1)[-1]
        if name in self._by_name:
            return self._by_name[name]
        suffix = Path(path).suffix.lower()
        if not suffix:
            return None
        return self._by_ext.get(suffix)

    def get(self, language: str) -> LanguagePlugin | None:
        for p in self._plugins:
            if p.language == language:
                return p
        return None

    def all(self) -> list[LanguagePlugin]:
        return list(self._plugins)

    def known_extensions(self) -> frozenset[str]:
        return frozenset(self._by_ext.keys())

    def known_filenames(self) -> frozenset[str]:
        return frozenset(self._by_name.keys())
