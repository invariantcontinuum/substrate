"""Auth tests use a mocked JWKS endpoint + a locally-issued RS256 token."""
from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.utils import to_base64url_uint

from substrate_common.auth import KeycloakJwtVerifier
from substrate_common.errors import UnauthorizedError


def _fresh_rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )


def _jwk_from_public(public_key: Any, kid: str) -> dict:
    numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "kid": kid,
        "alg": "RS256",
        "use": "sig",
        "n": to_base64url_uint(numbers.n).decode("ascii"),
        "e": to_base64url_uint(numbers.e).decode("ascii"),
    }


def _pem(private: rsa.RSAPrivateKey) -> bytes:
    return private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )


class _FakeJwks:
    def __init__(self, jwks: dict):
        self.jwks = jwks

    async def __call__(self, _self, kid: str):
        # Simulate a loaded JWKS: return matching key or raise.
        for entry in self.jwks["keys"]:
            if entry["kid"] == kid:
                from jwt import PyJWK

                return PyJWK(entry).key
        raise UnauthorizedError("JWT kid not in JWKS", details={"kid": kid})


@pytest.fixture
def token_and_verifier(monkeypatch):
    key = _fresh_rsa_key()
    jwk = _jwk_from_public(key.public_key(), kid="test-kid")
    jwks = {"keys": [jwk]}

    token = jwt.encode(
        {
            "iss": "http://localhost:8080/realms/substrate",
            "sub": "user-1",
            "exp": int(time.time()) + 60,
        },
        _pem(key),
        algorithm="RS256",
        headers={"kid": "test-kid"},
    )

    verifier = KeycloakJwtVerifier(
        jwks_url="http://unused",
        expected_issuer="http://localhost:8080/realms/substrate",
    )

    async def _get_key(self_, kid: str):
        from jwt import PyJWK

        return PyJWK(jwks["keys"][0]).key

    monkeypatch.setattr(KeycloakJwtVerifier, "_get_key", _get_key)
    return token, verifier


async def test_verify_happy_path(token_and_verifier):
    token, verifier = token_and_verifier
    claims = await verifier.verify(token)
    assert claims["sub"] == "user-1"


async def test_verify_issuer_mismatch_raises(token_and_verifier, monkeypatch):
    token, _ = token_and_verifier
    verifier = KeycloakJwtVerifier(
        jwks_url="http://unused",
        expected_issuer="http://localhost:8080/realms/WRONG",
    )

    async def _get_key(self_, kid: str):
        # Return a brand-new unrelated public key so signature validates but
        # issuer check still runs — we just need the signature path to work.
        from jwt import PyJWK
        from jwt.utils import to_base64url_uint

        key = _fresh_rsa_key()
        numbers = key.public_key().public_numbers()
        return PyJWK({
            "kty": "RSA",
            "kid": kid,
            "alg": "RS256",
            "n": to_base64url_uint(numbers.n).decode("ascii"),
            "e": to_base64url_uint(numbers.e).decode("ascii"),
        }).key

    # Signature will fail with this random key → UnauthorizedError.
    monkeypatch.setattr(KeycloakJwtVerifier, "_get_key", _get_key)
    with pytest.raises(UnauthorizedError):
        await verifier.verify(token)


async def test_malformed_token_raises():
    verifier = KeycloakJwtVerifier(
        jwks_url="http://unused",
        expected_issuer="http://localhost:8080/realms/substrate",
    )
    with pytest.raises(UnauthorizedError):
        await verifier.verify("not-a-real-jwt")
