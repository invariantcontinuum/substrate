import jwt
import httpx
import structlog
from jwt import PyJWK
from typing import Any

logger = structlog.get_logger()


def validate_token(
    token: str,
    public_key: Any,
    issuer: str,
) -> dict:
    """Validate a JWT token and return decoded claims."""
    return jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        issuer=issuer,
        options={"verify_aud": False},
    )


class JWKSClient:
    """Fetches and caches JWKS public keys from Keycloak."""

    def __init__(self, jwks_url: str):
        self._jwks_url = jwks_url
        self._keys: dict[str, Any] = {}

    async def get_key(self, kid: str) -> Any:
        if kid not in self._keys:
            await self._refresh()
        if kid not in self._keys:
            raise jwt.InvalidTokenError(f"Key ID {kid} not found in JWKS")
        return self._keys[kid]

    async def _refresh(self) -> None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(self._jwks_url)
            resp.raise_for_status()
            jwks = resp.json()
        self._keys = {}
        for key_data in jwks.get("keys", []):
            jwk = PyJWK(key_data)
            self._keys[key_data["kid"]] = jwk.key
        logger.info("jwks_refreshed", key_count=len(self._keys))
