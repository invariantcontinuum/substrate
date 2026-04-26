-- V9: api_tokens — user-issued personal access tokens.
--
-- Bearer auth alternative to a Keycloak-issued user JWT. Tokens are
-- minted in the gateway (POST /api/users/me/api-tokens), the plaintext
-- value is returned to the user once at creation, and only the sha256
-- hash + an 8-char prefix are stored. Subsequent bearer auth looks the
-- token up by hash; on hit the request runs as the owning user_sub.
--
-- The owning user_sub references user_profiles so a profile drop also
-- drops the user's tokens. Partial indexes restrict the lookup paths to
-- live (revoked_at IS NULL) tokens; expired-but-not-revoked rows are
-- filtered at query time, not via index.

CREATE TABLE api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub     TEXT NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
    label        TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    prefix       TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ
);

CREATE INDEX idx_api_tokens_user ON api_tokens(user_sub) WHERE revoked_at IS NULL;
CREATE INDEX idx_api_tokens_hash ON api_tokens(token_hash) WHERE revoked_at IS NULL;
