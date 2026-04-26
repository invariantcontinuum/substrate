"""Per-service runtime config refresh wiring.

Each substrate service holds a process-global ``settings`` instance plus a
``RuntimeOverlay`` that mirrors the ``runtime_config`` rows owned by the
service's ``SCOPE``. ``ConfigRefresher`` ties the two together:

1. ``init(pool)`` — opens the overlay against the given pool, loads the
   initial snapshot, and rebuilds the service's ``settings`` instance with
   the snapshot applied. The new instance is rebound on the service's
   ``config`` module so subsequent reads see the merged values.
2. ``on_event(payload)`` — handler for an SSE ``config.updated`` event.
   Filters by scope, refreshes the overlay, and rebinds again.

The ``config_module`` is the service-local ``src.config`` module (or the
test-shimmed equivalent). Holding the module — not the class — lets the
refresher rebind ``module.settings`` so any caller doing
``from src.config import settings`` after the next event observes the
new instance via re-import (callers that captured the *binding* at import
time still see the old instance; that's a known property of module-level
mutable globals and is acceptable for the runtime tunables we expose —
they're read on each request, not cached at import time).
"""
from __future__ import annotations

from types import ModuleType
from typing import Any, Protocol

import structlog

from substrate_common.config.layered import LayeredSettings
from substrate_common.config.runtime_overlay import RuntimeOverlay

_log = structlog.get_logger()


class _Pool(Protocol):
    def acquire(self) -> Any: ...


class ConfigRefresher:
    """Owns one ``RuntimeOverlay`` and the service's ``settings`` rebind."""

    def __init__(
        self,
        *,
        scope: str,
        settings_cls: type[LayeredSettings],
        config_module: ModuleType,
    ) -> None:
        self._scope = scope
        self._cls = settings_cls
        self._mod = config_module
        self._overlay: RuntimeOverlay | None = None

    @property
    def overlay(self) -> RuntimeOverlay | None:
        return self._overlay

    async def init(self, pool: _Pool) -> None:
        """Open the overlay against ``pool``, load it, and rebind settings."""
        self._overlay = RuntimeOverlay(scope=self._scope, pool=pool)
        await self._overlay.refresh()
        self._rebind()

    async def on_event(self, payload: dict[str, Any]) -> None:
        """Handle one SSE ``config.updated`` event payload.

        Filters by ``scope`` so a graph service ignores ``gateway``-scoped
        events and vice versa. Logs and silently returns on unrelated events
        instead of raising — SSE handlers must be defensive.
        """
        if self._overlay is None:
            return
        if payload.get("scope") != self._scope:
            return
        await self._overlay.refresh()
        self._rebind()
        _log.info(
            "config_overlay_refreshed",
            scope=self._scope,
            keys=list(payload.get("keys", []) or []),
            updated_by=payload.get("updated_by"),
        )

    def _rebind(self) -> None:
        """Rebuild the settings instance with the latest overlay snapshot
        and assign it to ``module.settings``."""
        assert self._overlay is not None
        instance = self._cls(_runtime_overlay=self._overlay.snapshot())
        # mypy doesn't like writing attributes on ModuleType; setattr is fine
        # at runtime and keeps the swap discoverable to lint.
        setattr(self._mod, "settings", instance)  # noqa: B010
