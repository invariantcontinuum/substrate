#!/usr/bin/env python3
"""Render ops/infra/keycloak/substrate-realm.json from the committed template.

Reads:
  - ops/infra/keycloak/substrate-realm.template.json
  - DEPLOYMENT_MODE, APP_URL, KEYCLOAK_REALM, KC_GATEWAY_CLIENT_SECRET,
    KC_BOOTSTRAP_ADMIN_USERNAME, KC_BOOTSTRAP_ADMIN_PASSWORD from the env,
  - (dev only) FRONTEND_HOST_PORT for the localhost redirect URIs.

The template uses double-underscore placeholders (__FOO__) that this
script substitutes. Array placeholders (redirectUris, webOrigins) are
built programmatically so dev can include additional localhost origins.

Output is written to ops/infra/keycloak/substrate-realm.json, which is
gitignored. The file is mounted read-only into the keycloak container by
docker-compose.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = REPO_ROOT / "ops/infra/keycloak/substrate-realm.template.json"
OUTPUT = REPO_ROOT / "ops/infra/keycloak/substrate-realm.json"


def require(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"render-realm: missing required env var {name}")
    return val


def main() -> None:
    mode = require("DEPLOYMENT_MODE")
    if mode not in {"dev", "prod"}:
        sys.exit(f"render-realm: DEPLOYMENT_MODE must be dev|prod, got {mode!r}")

    app_url = require("APP_URL").rstrip("/")
    realm = require("KEYCLOAK_REALM")
    gateway_secret = require("KC_GATEWAY_CLIENT_SECRET")
    admin_email = os.environ.get("KC_BOOTSTRAP_ADMIN_EMAIL", "admin@substrate.local")
    admin_password = require("KC_BOOTSTRAP_ADMIN_PASSWORD")

    frontend_redirects = [f"{app_url}/*"]
    frontend_origins = [app_url]
    gateway_origins = [app_url]

    if mode == "dev":
        frontend_port = os.environ.get("FRONTEND_HOST_PORT", "3535")
        extra = [f"http://localhost:{frontend_port}", "http://localhost:3000"]
        for origin in extra:
            if origin not in frontend_origins:
                frontend_origins.append(origin)
                frontend_redirects.append(f"{origin}/*")
            if origin not in gateway_origins:
                gateway_origins.append(origin)
        frontend_origins.append("+")

    ssl_required = "external" if mode == "prod" else "none"

    text = TEMPLATE.read_text()
    replacements = {
        "__KEYCLOAK_REALM__": realm,
        "__SSL_REQUIRED__": ssl_required,
        "__APP_URL__": app_url,
        "__KC_GATEWAY_CLIENT_SECRET__": gateway_secret,
        "__BOOTSTRAP_ADMIN_EMAIL__": admin_email,
        "__BOOTSTRAP_ADMIN_PASSWORD__": admin_password,
        "__FRONTEND_REDIRECT_URIS__": json.dumps(frontend_redirects),
        "__FRONTEND_WEB_ORIGINS__": json.dumps(frontend_origins),
        "__GATEWAY_WEB_ORIGINS__": json.dumps(gateway_origins),
    }
    for key, value in replacements.items():
        text = text.replace(key, value)

    # Round-trip to validate + pretty-print.
    parsed = json.loads(text)
    OUTPUT.write_text(json.dumps(parsed, indent=2) + "\n")
    print(f"render-realm: wrote {OUTPUT.relative_to(REPO_ROOT)} ({mode})")


if __name__ == "__main__":
    main()
