import pytest
import jwt
import time
from unittest.mock import AsyncMock, patch
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

from src.auth import validate_token, JWKSClient


def _generate_rsa_keypair():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    return private_key, public_key


def _encode_jwt(private_key, claims, kid="test-kid"):
    return jwt.encode(
        claims,
        private_key,
        algorithm="RS256",
        headers={"kid": kid},
    )


class TestValidateToken:
    def setup_method(self):
        self.private_key, self.public_key = _generate_rsa_keypair()

    def test_valid_token_returns_claims(self):
        claims = {
            "sub": "user-123",
            "preferred_username": "dany",
            "realm_access": {"roles": ["admin", "engineer"]},
            "iss": "http://local-keycloak:8080/realms/substrate",
            "aud": "substrate-frontend",
            "exp": int(time.time()) + 300,
            "iat": int(time.time()),
        }
        token = _encode_jwt(self.private_key, claims)
        result = validate_token(token, self.public_key, issuer=claims["iss"])
        assert result["sub"] == "user-123"
        assert result["preferred_username"] == "dany"

    def test_expired_token_raises(self):
        claims = {
            "sub": "user-123",
            "iss": "http://local-keycloak:8080/realms/substrate",
            "aud": "substrate-frontend",
            "exp": int(time.time()) - 60,
            "iat": int(time.time()) - 360,
        }
        token = _encode_jwt(self.private_key, claims)
        with pytest.raises(jwt.ExpiredSignatureError):
            validate_token(token, self.public_key, issuer=claims["iss"])

    def test_wrong_issuer_raises(self):
        claims = {
            "sub": "user-123",
            "iss": "http://evil-server:8080/realms/fake",
            "aud": "substrate-frontend",
            "exp": int(time.time()) + 300,
            "iat": int(time.time()),
        }
        token = _encode_jwt(self.private_key, claims)
        with pytest.raises(jwt.InvalidIssuerError):
            validate_token(
                token,
                self.public_key,
                issuer="http://local-keycloak:8080/realms/substrate",
            )
