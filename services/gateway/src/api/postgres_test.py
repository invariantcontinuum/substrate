"""``POST /api/postgres/test`` — probe a Postgres connection with the
panel's current (unsaved) form values, before the user commits the
diff.

Mirrors ``POST /api/llm/{role}/test`` (see ``api/llm_test.py``): the
Settings → Postgres panel sends the live form fields; the gateway
opens a single asyncpg connection against them, runs a one-shot
``SELECT version()``, and reports ``{ok, latency_ms, version, error}``
so the panel can show an inline pass/fail indicator without round-
tripping a save.

The endpoint is auth-gated against the same JWT as the rest of
``/api/*``. It does not touch ``runtime_config`` and does not emit SSE.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any
from urllib.parse import quote

import asyncpg
import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from src.api.config import current_user
from src.config import settings


log = structlog.get_logger()

router = APIRouter(prefix="/api/postgres", tags=["postgres-test"])


class PostgresProbeRequest(BaseModel):
    """Mirrors the Postgres panel form. ``host`` / ``port`` are required;
    everything else falls back to a sane default so the probe still
    works for a fresh deploy where the user hasn't filled all six
    fields yet.
    """

    host: str = Field(min_length=1, max_length=253)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(default="", max_length=120)
    user: str = Field(default="", max_length=120)
    password: str = Field(default="", max_length=400)
    ssl_verify: bool = True
    timeout_s: float = Field(default=5.0, gt=0.0, le=30.0)


class PostgresProbeResponse(BaseModel):
    ok: bool
    latency_ms: int
    version: str = ""
    error: str | None = None


def _build_dsn(body: PostgresProbeRequest) -> str:
    # Build a plain ``postgresql://`` DSN — asyncpg.connect doesn't
    # accept the SQLAlchemy ``+asyncpg`` driver hint.
    user_part = ""
    if body.user:
        user_part = quote(body.user, safe="")
        if body.password:
            user_part = f"{user_part}:{quote(body.password, safe='')}"
        user_part = f"{user_part}@"
    db_part = f"/{quote(body.database, safe='')}" if body.database else "/"
    return f"postgresql://{user_part}{body.host}:{body.port}{db_part}"


@router.post("/test", response_model=PostgresProbeResponse)
async def test_postgres(
    body: PostgresProbeRequest,
    _user: dict[str, Any] = Depends(current_user),
) -> PostgresProbeResponse:
    dsn = _build_dsn(body)
    # ``ssl_verify`` toggles certificate verification in TLS handshakes.
    # asyncpg accepts ``ssl=True`` (default require + verify),
    # ``ssl=False`` (no TLS), and a string preset; we use bool so the
    # panel's checkbox round-trips cleanly.
    ssl_arg: bool | str = body.ssl_verify
    timeout_s = body.timeout_s
    start = time.perf_counter()
    error: str | None = None
    ok = False
    version = ""
    conn: asyncpg.Connection | None = None
    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(dsn, ssl=ssl_arg),
            timeout=timeout_s,
        )
        # Narrow ``conn`` for mypy — asyncio.wait_for's signature returns
        # ``Any | None`` here even though we know it succeeded if we
        # reached this line.
        assert conn is not None
        row = await asyncio.wait_for(
            conn.fetchval("SELECT version()"),
            timeout=timeout_s,
        )
        version = (row or "").strip()
        ok = True
    except asyncio.TimeoutError:
        error = f"timeout after {timeout_s:.1f}s"
    except (asyncpg.PostgresError, OSError) as exc:
        error = f"{type(exc).__name__}: {exc!s}"
    except Exception as exc:  # noqa: BLE001 — surface any transport failure
        error = f"{type(exc).__name__}: {exc!s}"
    finally:
        if conn is not None:
            try:
                await conn.close()
            except Exception:  # noqa: BLE001 — close failures shouldn't
                # mask the original probe outcome.
                pass
    latency_ms = int((time.perf_counter() - start) * 1000)

    log.info(
        "postgres_probe",
        host=body.host,
        port=body.port,
        database=body.database,
        ok=ok,
        latency_ms=latency_ms,
        error=error,
    )
    return PostgresProbeResponse(
        ok=ok,
        latency_ms=latency_ms,
        version=version,
        error=error,
    )


# Reference ``settings`` so the import isn't pruned by ruff. Kept
# explicit so future iterations can short-circuit the probe with the
# server-side stored credentials when no body fields are provided
# (matches ``llm_test.py``'s shape).
_ = settings
