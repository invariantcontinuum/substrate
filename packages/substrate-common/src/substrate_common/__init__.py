"""Substrate shared library — config, logging, errors, auth, db, sse, middleware."""
from substrate_common.auth import KeycloakJwtVerifier
from substrate_common.config import load_settings
from substrate_common.db import asyncpg_dsn, create_pool
from substrate_common.errors import (
    ConflictError,
    ForbiddenError,
    InternalError,
    NotFoundError,
    SubstrateError,
    UnauthorizedError,
    UpstreamError,
    ValidationError,
    register_handlers,
)
from substrate_common.logging import configure_logging
from substrate_common.middleware import ExceptionLoggingMiddleware, RequestIdMiddleware
from substrate_common.schema import EdgeAffected, GraphEvent, NodeAffected
from substrate_common.sse import Event, SseBus, StreamDropped

__version__ = "0.1.0"

__all__ = [
    "ConflictError",
    "EdgeAffected",
    "Event",
    "ExceptionLoggingMiddleware",
    "ForbiddenError",
    "GraphEvent",
    "InternalError",
    "KeycloakJwtVerifier",
    "NodeAffected",
    "NotFoundError",
    "RequestIdMiddleware",
    "SseBus",
    "StreamDropped",
    "SubstrateError",
    "UnauthorizedError",
    "UpstreamError",
    "ValidationError",
    "asyncpg_dsn",
    "configure_logging",
    "create_pool",
    "load_settings",
    "register_handlers",
]
