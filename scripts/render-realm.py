#!/usr/bin/env python3
"""Render ops/infra/keycloak/substrate-realm.json from the committed template.

Reads required env vars from the current environment (populated by
scripts/configure.sh from .env). The rendered file always includes both
the canonical APP_URL origin and localhost origins so the same realm
works in dev and prod without re-rendering when you switch modes.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = REPO_ROOT / "ops/infra/keycloak/substrate-realm.template.json"
OUTPUT = REPO_ROOT / "ops/infra/keycloak/substrate-realm.json"

LOCAL_ORIGINS = ["http://localhost:3535", "http://localhost:3000"]


def require(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        sys.exit(f"render-realm: missing required env var {name}")
    return val


def main() -> None:
    app_url = require("APP_URL").rstrip("/")
    realm = require("KEYCLOAK_REALM")
    gateway_secret = require("KC_GATEWAY_CLIENT_SECRET")
    admin_password = require("KC_BOOTSTRAP_ADMIN_PASSWORD")
    admin_email = os.environ.get("KC_BOOTSTRAP_ADMIN_EMAIL", "admin@substrate.local")

    ssl_required = "external" if app_url.startswith("https://") else "none"

    origins: list[str] = [app_url]
    for o in LOCAL_ORIGINS:
        if o not in origins:
            origins.append(o)
    redirect_uris = [f"{o}/*" for o in origins]
    web_origins = origins + ["+"]

    text = TEMPLATE.read_text()
    replacements = {
        "__KEYCLOAK_REALM__": realm,
        "__SSL_REQUIRED__": ssl_required,
        "__APP_URL__": app_url,
        "__KC_GATEWAY_CLIENT_SECRET__": gateway_secret,
        "__BOOTSTRAP_ADMIN_EMAIL__": admin_email,
        "__BOOTSTRAP_ADMIN_PASSWORD__": admin_password,
        "__FRONTEND_REDIRECT_URIS__": json.dumps(redirect_uris),
        "__FRONTEND_WEB_ORIGINS__": json.dumps(web_origins),
        "__GATEWAY_WEB_ORIGINS__": json.dumps(origins),
    }
    for key, value in replacements.items():
        text = text.replace(key, value)

    parsed = json.loads(text)
    OUTPUT.write_text(json.dumps(parsed, indent=2) + "\n")
    print(f"render-realm: wrote {OUTPUT.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
