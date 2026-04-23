"""Gateway settings — schema only; loader lives in substrate_common.config."""
from pydantic_settings import BaseSettings

from substrate_common.config import load_settings


class _GatewaySettings(BaseSettings):
    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "substrate"
    # Browser-facing issuer — must match KC_HOSTNAME on the Keycloak side.
    # Populated by docker-compose from the active deployment overlay; empty
    # default falls back to the internal keycloak_url via the issuer property.
    keycloak_issuer: str = ""
    kc_gateway_client_secret: str = ""
    graph_service_url: str = "http://graph:8082"
    ingestion_service_url: str = "http://ingestion:8081"
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    # Gateway holds one LISTEN connection per active SSE client. Tune pool
    # size with expected concurrent EventSource sessions.
    sse_pool_min_size: int = 1
    sse_pool_max_size: int = 64

    auth_disabled: bool = False
    cors_origins: list[str] = []
    service_name: str = "gateway"

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        return self.keycloak_issuer or f"{self.keycloak_url}/realms/{self.keycloak_realm}"


settings = load_settings("", _GatewaySettings)
