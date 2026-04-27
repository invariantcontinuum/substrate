"""Integration tests for the avatar upload/serve/delete API.

Same fixture pattern as ``test_api_tokens.py`` — gateway boots against
the live ``substrate_graph`` Postgres on localhost. The tests generate
a tiny in-memory PNG via Pillow so the centre-crop + resize pipeline
runs against a real input.
"""
from __future__ import annotations

import io
import os

import asyncpg
import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from PIL import Image

os.environ.setdefault("AUTH_DISABLED", "true")


def _dsn() -> str:
    return os.environ.get(
        "GRAPH_DATABASE_URL",
        "postgresql://substrate_graph:change-me@localhost:5432/substrate_graph",
    ).replace("postgresql+asyncpg://", "postgresql://")


def _png_bytes(width: int, height: int) -> bytes:
    """Return raw PNG bytes for a flat-colour image of the given size."""
    img = Image.new("RGB", (width, height), color=(180, 200, 220))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def gateway_app(monkeypatch):
    asyncpg_dsn = (
        f"postgresql+asyncpg://{_dsn().split('://', 1)[1]}"
    )
    monkeypatch.setenv("DATABASE_URL", asyncpg_dsn)
    monkeypatch.setenv("AUTH_DISABLED", "true")

    import importlib

    from src import config as _cfg
    importlib.reload(_cfg)
    from src import main as gw_main
    importlib.reload(gw_main)

    raw_dsn = _dsn()
    conn = await asyncpg.connect(raw_dsn)
    try:
        await conn.execute(
            """
            INSERT INTO user_profiles (user_sub) VALUES ('dev')
            ON CONFLICT (user_sub) DO NOTHING
            """,
        )
        await conn.execute(
            """
            UPDATE user_profiles
            SET avatar_image=NULL, avatar_mime=NULL, avatar_updated_at=NULL
            WHERE user_sub='dev'
            """,
        )
    finally:
        await conn.close()

    async with LifespanManager(gw_main.app):
        transport = ASGITransport(app=gw_main.app)
        async with AsyncClient(transport=transport, base_url="http://t") as c:
            r = await c.get("/health")
            assert r.status_code == 200
            yield c, raw_dsn

    conn = await asyncpg.connect(raw_dsn)
    try:
        await conn.execute(
            """
            UPDATE user_profiles
            SET avatar_image=NULL, avatar_mime=NULL, avatar_updated_at=NULL
            WHERE user_sub='dev'
            """,
        )
    finally:
        await conn.close()


@pytest.mark.asyncio
async def test_upload_serves_png_then_delete(gateway_app):
    client, _ = gateway_app

    # No avatar yet — expect 200 + null (not 404; see DSG-2026-04-27-A §1.4).
    r = await client.get("/api/users/me/avatar")
    assert r.status_code == 200
    assert r.json() == {"avatar": None}

    # Upload a 400x300 PNG (non-square — exercises centre-crop).
    payload = _png_bytes(400, 300)
    r = await client.post(
        "/api/users/me/avatar",
        files={"file": ("avatar.png", payload, "image/png")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["mime"] == "image/png"
    assert body["edge_px"] == 256

    # GET returns the stored bytes with the right content type + cache.
    r = await client.get("/api/users/me/avatar")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert "max-age" in r.headers["cache-control"]
    # Must round-trip as a valid PNG of the configured target edge.
    img = Image.open(io.BytesIO(r.content))
    assert img.size == (256, 256)

    # DELETE clears the row; the next GET returns 200 + null (no 404).
    r = await client.delete("/api/users/me/avatar")
    assert r.status_code == 200
    r = await client.get("/api/users/me/avatar")
    assert r.status_code == 200
    assert r.json() == {"avatar": None}


@pytest.mark.asyncio
async def test_rejects_oversized_upload(gateway_app):
    client, _ = gateway_app

    # 5 MiB of zero bytes — exceeds the 4 MiB cap.
    bogus = b"\x00" * (5 * 1024 * 1024)
    r = await client.post(
        "/api/users/me/avatar",
        files={"file": ("oversize.png", bogus, "image/png")},
    )
    # Gateway maps ValidationError to 400 (not 422).
    assert r.status_code == 400, r.text


@pytest.mark.asyncio
async def test_rejects_unsupported_mime(gateway_app):
    client, _ = gateway_app

    r = await client.post(
        "/api/users/me/avatar",
        files={"file": ("a.gif", b"GIF89a...", "image/gif")},
    )
    # Gateway maps ValidationError to 400 (not 422).
    assert r.status_code == 400, r.text


@pytest.mark.asyncio
async def test_avatar_upload_accepts_2mb_png(gateway_app):
    """4 MiB cap allows a large PNG well above the old 512 KiB limit.

    Generates a valid PNG whose uncompressed size sits between 512 KiB
    (old cap) and 4 MiB (new cap). We use a 600x500 noisy image saved at
    compress_level=0; random pixels don't compress well, so the output
    is ~900 KiB — larger than the old 512 KiB limit but smaller than 4 MiB
    (DSG-2026-04-27-A §1.3).
    """
    client, _ = gateway_app
    import random as _random
    pixels = bytes([_random.randint(0, 255) for _ in range(600 * 500 * 3)])
    img = Image.frombytes("RGB", (600, 500), pixels)
    buf = io.BytesIO()
    img.save(buf, format="PNG", compress_level=0)
    png_bytes_large = buf.getvalue()
    # Must be over 512 KiB (old cap) and under 4 MiB (new cap).
    assert len(png_bytes_large) > 512 * 1024, (
        f"Expected >512 KiB, got {len(png_bytes_large)} bytes"
    )
    assert len(png_bytes_large) < 4 * 1024 * 1024, (
        f"Expected <4 MiB, got {len(png_bytes_large)} bytes"
    )

    resp = await client.post(
        "/api/users/me/avatar",
        files={"file": ("camera.png", png_bytes_large, "image/png")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mime"] == "image/png"
    assert body["edge_px"] == 256
    assert body["size_bytes"] > 0


@pytest.mark.asyncio
async def test_avatar_get_returns_200_with_null_when_absent(gateway_app):
    """GET /api/users/me/avatar returns 200 + {avatar:null} when row absent.

    Regression for DSG-2026-04-27-A §1.4 — the old 404 caused console
    error noise on every fresh-user dashboard load.
    """
    client, _ = gateway_app
    await client.delete("/api/users/me/avatar")
    resp = await client.get("/api/users/me/avatar")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"avatar": None}
    assert "max-age=0" in resp.headers.get("Cache-Control", "")
