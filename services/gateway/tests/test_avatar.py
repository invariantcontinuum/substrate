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

    # 404 before any upload.
    r = await client.get("/api/users/me/avatar")
    assert r.status_code == 404

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

    # DELETE clears the row and the next GET 404s.
    r = await client.delete("/api/users/me/avatar")
    assert r.status_code == 200
    r = await client.get("/api/users/me/avatar")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_rejects_oversized_upload(gateway_app):
    client, _ = gateway_app

    # 1 MiB of zero bytes — exceeds the default 512 KiB cap.
    bogus = b"\x00" * (1024 * 1024)
    r = await client.post(
        "/api/users/me/avatar",
        files={"file": ("oversize.png", bogus, "image/png")},
    )
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_rejects_unsupported_mime(gateway_app):
    client, _ = gateway_app

    r = await client.post(
        "/api/users/me/avatar",
        files={"file": ("a.gif", b"GIF89a...", "image/gif")},
    )
    assert r.status_code == 422, r.text
