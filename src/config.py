from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    keycloak_url: str = "http://local-keycloak:8080"
    keycloak_realm: str = "substrate"
    keycloak_issuer: str = ""
    graph_service_url: str = "http://substrate-graph:8082"
    ingestion_service_url: str = "http://substrate-ingestion:8081"
    redis_url: str = "redis://local-redis:6379"

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        return self.keycloak_issuer or f"{self.keycloak_url}/realms/{self.keycloak_realm}"


settings = Settings()
