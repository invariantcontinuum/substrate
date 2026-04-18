import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

from src.main import app


def _make_keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private, private.public_key()


@pytest.fixture
def keypair():
    return _make_keypair()


@pytest.fixture
def valid_token(keypair):
    private_key, _ = keypair
    return jwt.encode(
        {
            "sub": "user-123",
            "preferred_username": "dany",
            "realm_access": {"roles": ["admin"]},
            "iss": "http://local-keycloak:8080/realms/substrate",
            "exp": int(time.time()) + 300,
            "iat": int(time.time()),
        },
        private_key,
        algorithm="RS256",
        headers={"kid": "test-kid"},
    )


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestAuthMiddleware:
    @pytest.mark.asyncio
    async def test_no_token_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/graph")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_token_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/graph", headers={"Authorization": "Bearer invalid"}
            )
        assert resp.status_code == 401
