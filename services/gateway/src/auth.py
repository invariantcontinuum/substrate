import time
import asyncio
import jwt
import httpx
import structlog
from jwt import PyJWK
from typing import Any

logger = structlog.get_logger()

JWKS_TTL_SECONDS = 300  # 5 minutes


def validate_token(token: str, public_key: Any, issuer: str) -> dict:
    return jwt.decode(
        token, public_key, algorithms=["RS256"],
        issuer=issuer, options={"verify_aud": False},
    )


class JWKSClient:
    def __init__(self, jwks_url: str):
        self._jwks_url = jwks_url
        self._keys: dict[str, Any] = {}
        self._last_refresh: float = 0.0
        self._refreshing: bool = False

    async def get_key(self, kid: str) -> Any:
        now = time.time()
        if now - self._last_refresh > JWKS_TTL_SECONDS and not self._refreshing:
            asyncio.create_task(self._background_refresh())

        if kid not in self._keys:
            await self._refresh()
        if kid not in self._keys:
            raise jwt.InvalidTokenError(f"Key ID {kid} not found in JWKS")
        return self._keys[kid]

    async def _background_refresh(self) -> None:
        try:
            self._refreshing = True
            await self._refresh()
        except Exception as e:
            logger.warning("jwks_background_refresh_failed", error=str(e))
        finally:
            self._refreshing = False

    async def _refresh(self) -> None:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self._jwks_url)
            resp.raise_for_status()
            jwks = resp.json()
        self._keys = {}
        for key_data in jwks.get("keys", []):
            if key_data.get("use") == "enc":
                continue
            try:
                jwk = PyJWK(key_data)
                self._keys[key_data["kid"]] = jwk.key
            except Exception as e:
                logger.warning("jwks_key_skip", kid=key_data.get("kid"), error=str(e))
        self._last_refresh = time.time()
        logger.info("jwks_refreshed", key_count=len(self._keys))
