"""structlog bootstrap shared by every Python service.

`configure_logging(service, pretty)` wires a pipeline that emits one JSON
line per log call with the standard field set defined in DSG-015 §5.3:

    { "ts", "level", "event", "service", "request_id"?, "span_ms"?, ... }

Every service calls this exactly once at startup before any log.
"""
from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(service: str, pretty: bool = False) -> None:
    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts"),
        _inject_service(service),
        structlog.processors.EventRenamer("event"),
        # Render exc_info attached by `log.exception(...)` into a string
        # under the "exception" key. Without this, the JSON renderer
        # drops the traceback entirely and "X_failed" entries carry no
        # diagnostic — the source of the silent failures observed in
        # chat_pipeline.stream_turn and elsewhere (DSG-2026-04-27-A §1.5).
        structlog.processors.format_exc_info,
    ]
    renderer = (
        structlog.dev.ConsoleRenderer(colors=True)
        if pretty
        else structlog.processors.JSONRenderer()
    )
    processors.append(renderer)

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


def _inject_service(service: str):
    def _processor(_logger, _method, event_dict):
        event_dict["service"] = service
        return event_dict

    return _processor
