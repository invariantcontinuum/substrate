"""Gateway settings — schema only; loader lives in substrate_common.config."""
from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _GatewaySettings(BaseSettings):
    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "substrate"
    keycloak_issuer: str = "http://localhost:8080/realms/substrate"
    graph_service_url: str = "http://graph:8082"
    ingestion_service_url: str = "http://ingestion:8081"
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"

    auth_disabled: bool = False
    cors_origins: list[str] = ["http://localhost:3535"]
    service_name: str = "gateway"

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        return self.keycloak_issuer or f"{self.keycloak_url}/realms/{self.keycloak_realm}"


settings = load_settings("", _GatewaySettings)
