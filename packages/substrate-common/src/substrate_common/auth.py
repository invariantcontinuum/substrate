"""Keycloak JWT verifier with a 5-minute in-memory JWKS cache.

Consumers instantiate `KeycloakJwtVerifier(jwks_url, expected_issuer)` once
at startup, then call `await verifier.verify(token)` per incoming request.
All failure modes raise `UnauthorizedError` with the specific reason in
`details` so error handlers can render a uniform 401 body.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx
import jwt
import structlog
from jwt import PyJWK

from substrate_common.errors import UnauthorizedError

_JWKS_TTL_SECONDS = 300

log = structlog.get_logger()


class KeycloakJwtVerifier:
    def __init__(
        self,
        jwks_url: str,
        expected_issuer: str,
        *,
        ttl_seconds: int = _JWKS_TTL_SECONDS,
    ):
        self._jwks_url = jwks_url
        self._issuer = expected_issuer
        self._ttl = ttl_seconds
        self._keys: dict[str, Any] = {}
        self._last_refresh: float = 0.0
        self._refreshing = False
        self._lock = asyncio.Lock()
        self._refresh_task: asyncio.Task | None = None

    async def verify(self, token: str) -> dict[str, Any]:
        try:
            unverified = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as e:
            raise UnauthorizedError("malformed JWT", details={"reason": str(e)}) from e

        kid = unverified.get("kid")
        if not kid:
            raise UnauthorizedError("JWT missing kid header")

        key = await self._get_key(kid)
        try:
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                issuer=self._issuer,
                options={"verify_aud": False},
            )
        except jwt.InvalidTokenError as e:
            raise UnauthorizedError("JWT verification failed", details={"reason": str(e)}) from e

    async def _get_key(self, kid: str) -> Any:
        now = time.time()
        if now - self._last_refresh > self._ttl and not self._refreshing:
            self._refresh_task = asyncio.create_task(self._background_refresh())

        if kid not in self._keys:
            await self._refresh()

        if kid not in self._keys:
            raise UnauthorizedError("JWT kid not in JWKS", details={"kid": kid})

        return self._keys[kid]

    async def _background_refresh(self) -> None:
        async with self._lock:
            if self._refreshing:
                return
            self._refreshing = True
        try:
            await self._refresh()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("jwks_background_refresh_failed", error=str(e))
        finally:
            self._refreshing = False

    async def _refresh(self) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self._jwks_url)
            resp.raise_for_status()
            jwks = resp.json()

        keys: dict[str, Any] = {}
        for key_data in jwks.get("keys", []):
            if key_data.get("use") == "enc":
                continue
            try:
                keys[key_data["kid"]] = PyJWK(key_data).key
            except jwt.InvalidKeyError as e:
                log.warning("jwks_key_skip", kid=key_data.get("kid"), error=str(e))

        self._keys = keys
        self._last_refresh = time.time()
        log.info("jwks_refreshed", key_count=len(keys))
