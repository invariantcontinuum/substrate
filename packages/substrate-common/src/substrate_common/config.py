"""Service-settings loader shared by gateway, ingestion, graph.

`load_settings(env_prefix, schema)` returns an instance of `schema` with fields
populated from env variables under `{env_prefix}_...`. Extra env vars are ignored
so services can share the same env file without every service having to declare
every variable.
"""
from __future__ import annotations

from typing import Type, TypeVar

from pydantic_settings import BaseSettings, SettingsConfigDict

T = TypeVar("T", bound=BaseSettings)


def load_settings(env_prefix: str, schema: Type[T]) -> T:
    # Empty prefix → no prefix at all (pydantic-settings treats "" as "no prefix").
    # Non-empty prefix → add trailing underscore so GATEWAY_APP_PORT resolves.
    prefix = f"{env_prefix}_" if env_prefix else ""

    class _S(schema):  # type: ignore[misc,valid-type]
        model_config = SettingsConfigDict(
            env_prefix=prefix,
            env_file=".env",
            extra="ignore",
        )

    return _S()  # type: ignore[return-value]
