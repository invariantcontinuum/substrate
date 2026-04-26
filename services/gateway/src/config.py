"""Gateway settings — schema only; loader lives in substrate_common.config."""
from typing import ClassVar

from substrate_common.config import LayeredSettings, load_settings


class _GatewaySettings(LayeredSettings):
    SCOPE: ClassVar[str] = "gateway"

    keycloak_url: str = "http://keycloak:8080"
    keycloak_realm: str = "substrate"
    # Browser-facing issuer — must match KC_HOSTNAME on the Keycloak side.
    # Populated by docker-compose from the active deployment overlay; empty
    # default falls back to the internal keycloak_url via the issuer property.
    keycloak_issuer: str = ""
    # Keycloak public (browser) client id used by the frontend OIDC flow.
    # Surfaced read-only in Settings → Authentication so users can see
    # which client their tokens are issued for.
    keycloak_public_client_id: str = "substrate-frontend"
    # Optional explicit account-console URL. When empty, the
    # ``keycloak_account_console_url_effective`` property derives one from
    # ``keycloak_url`` + ``keycloak_realm``. Override only when the
    # account console lives behind a different hostname than the issuer
    # (e.g. ``https://account.example.com/realms/substrate/account/``).
    keycloak_account_console_url: str = ""
    kc_gateway_client_secret: str = ""
    # Service-account wiring used by the account API for admin-level
    # operations (PATCH /api/users/me, 2FA credential write/delete).
    # Empty client_secret => any endpoint that needs admin access
    # returns 501 so a misconfigured deploy fails loudly.
    keycloak_admin_url: str = "http://keycloak:8080/admin/realms/substrate"
    keycloak_token_url: str = (
        "http://keycloak:8080/realms/substrate/protocol/openid-connect/token"
    )
    keycloak_admin_client_id: str = "substrate-admin"
    keycloak_admin_client_secret: str = ""
    graph_service_url: str = "http://graph:8082"
    ingestion_service_url: str = "http://ingestion:8081"
    database_url: str = "postgresql+asyncpg://substrate_graph:change-me@postgres:5432/substrate_graph"
    # Gateway holds one LISTEN connection per active SSE client. Tune pool
    # size with expected concurrent EventSource sessions.
    sse_pool_min_size: int = 1
    sse_pool_max_size: int = 64

    # ── API tokens ─────────────────────────────────────────────────────
    # Personal access token plaintext format: ``<prefix>_<random>``. The
    # plaintext prefix lives at the head of the secret and is also stored
    # standalone for UI listing ("subs_a1b2c3d4 …"). Trade-off: shorter
    # random portion => faster brute-force; longer => more clipboard
    # awkward. 32 url-safe chars ≈ 192 bits of entropy, comfortable.
    api_token_plaintext_prefix: str = "subs_"
    api_token_random_bytes: int = 24  # secrets.token_urlsafe(N) -> ~⌈4N/3⌉ chars
    # Length of the plaintext-prefix slice (after the scheme prefix) shown
    # in the UI list. Balances enough disambiguation with not leaking too
    # much of the secret.
    api_token_display_prefix_len: int = 8

    # ── 2FA TOTP ─────────────────────────────────────────────────────
    # Issuer label embedded in the otpauth:// URL — what the authenticator
    # app shows next to the account name. Keep short.
    totp_issuer: str = "Substrate"

    auth_disabled: bool = False
    cors_origins: list[str] = []
    service_name: str = "gateway"

    @property
    def jwks_url(self) -> str:
        return f"{self.keycloak_url}/realms/{self.keycloak_realm}/protocol/openid-connect/certs"

    @property
    def issuer(self) -> str:
        return self.keycloak_issuer or f"{self.keycloak_url}/realms/{self.keycloak_realm}"

    @property
    def keycloak_account_console_url_effective(self) -> str:
        """Resolve the user-facing account console URL.

        Falls back to ``<keycloak_url>/realms/<realm>/account/`` when no
        explicit override is configured. The ``GET /api/config/auth``
        proxy returns the raw ``keycloak_account_console_url`` field;
        this property is for callers that want a guaranteed-present URL.
        """
        if self.keycloak_account_console_url:
            return self.keycloak_account_console_url
        return f"{self.keycloak_url.rstrip('/')}/realms/{self.keycloak_realm}/account/"


settings = load_settings("", _GatewaySettings)
