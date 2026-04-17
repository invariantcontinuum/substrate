import structlog
from contextlib import asynccontextmanager
from typing import Literal
from fastapi import FastAPI, Request, WebSocket, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.auth import JWKSClient, validate_token
from src.proxy import proxy_request, proxy_websocket, init_client, close_client

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()

AuthCloseReason = Literal["token_expired", "token_invalid", "no_token"]


async def handle_ws_auth_failure(websocket: WebSocket, reason: AuthCloseReason) -> None:
    """Emit a structured log line and close a WebSocket for an auth failure.

    Intentionally omits token body and any user identity — reason is a
    controlled enum derived from which auth check failed.
    """
    logger.info(
        "ws_auth_closed",
        path=websocket.url.path,
        reason=reason,
        close_code=4401,
        client=websocket.client.host if websocket.client else None,
    )
    await websocket.close(code=4401)


jwks_client: JWKSClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global jwks_client
    jwks_client = JWKSClient(settings.jwks_url)
    await init_client()
    logger.info("gateway_started", keycloak=settings.keycloak_url)
    yield
    await close_client()
    logger.info("gateway_stopped")


app = FastAPI(title="Substrate Gateway", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://app.invariantcontinuum.io",
        "https://substrate.invariantcontinuum.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _authenticate(request: Request) -> dict | None:
    """Extract and validate JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        import jwt as pyjwt

        unverified = pyjwt.get_unverified_header(token)
        kid = unverified.get("kid")
        if not kid or not jwks_client:
            return None
        public_key = await jwks_client.get_key(kid)
        return validate_token(token, public_key, issuer=settings.issuer)
    except Exception as e:
        logger.warning("auth_failed", error=str(e))
        return None


def _route_to_ingestion(method: str, path: str) -> bool:
    """Return True if this /api/* request should be proxied to ingestion
    instead of graph. Sources CRUD and read-only endpoints stay on graph."""
    if method == "GET":
        return False
    if path == "/api/syncs" or path.startswith("/api/syncs/"):
        return method in ("POST", "DELETE")
    if path == "/api/schedules" or path.startswith("/api/schedules/"):
        return method in ("POST", "PATCH", "DELETE")
    return False  # /api/sources/* and everything else stays on graph


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_api(request: Request, path: str):
    claims = await _authenticate(request)
    if not claims:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    upstream = (
        settings.ingestion_service_url
        if _route_to_ingestion(request.method, request.url.path)
        else settings.graph_service_url
    )
    return await proxy_request(request, upstream)


@app.api_route("/ingest/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_ingest(request: Request, path: str):
    claims = await _authenticate(request)
    if not claims:
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return await proxy_request(request, settings.ingestion_service_url)




@app.api_route(
    "/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_auth(request: Request, path: str):
    return await proxy_request(request, settings.keycloak_url)


@app.websocket("/ws/{path:path}")
async def proxy_ws(websocket: WebSocket, path: str):
    token = websocket.query_params.get("token")
    if not token:
        await handle_ws_auth_failure(websocket, reason="no_token")
        return

    try:
        import jwt as pyjwt

        unverified = pyjwt.get_unverified_header(token)
        kid = unverified.get("kid")
        if not kid or not jwks_client:
            await handle_ws_auth_failure(websocket, reason="token_invalid")
            return
        public_key = await jwks_client.get_key(kid)
        validate_token(token, public_key, issuer=settings.issuer)
    except Exception as exc:
        import jwt as _pyjwt
        if isinstance(exc, _pyjwt.ExpiredSignatureError):
            await handle_ws_auth_failure(websocket, reason="token_expired")
        else:
            await handle_ws_auth_failure(websocket, reason="token_invalid")
        return

    await proxy_websocket(
        websocket, settings.graph_service_url, f"/ws/{path}", token
    )
