import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.auth import JWKSClient, validate_token
from src.proxy import proxy_request, proxy_websocket

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger()

jwks_client: JWKSClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global jwks_client
    jwks_client = JWKSClient(settings.jwks_url)
    logger.info("gateway_started", keycloak=settings.keycloak_url)
    yield
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


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_api(request: Request, path: str):
    claims = await _authenticate(request)
    if not claims:
        return JSONResponse({"error": "unauthorized"}, status_code=401)

    return await proxy_request(request, settings.graph_service_url)


@app.api_route(
    "/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_auth(request: Request, path: str):
    return await proxy_request(request, settings.keycloak_url)


@app.websocket("/ws/{path:path}")
async def proxy_ws(websocket: WebSocket, path: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    try:
        import jwt as pyjwt

        unverified = pyjwt.get_unverified_header(token)
        kid = unverified.get("kid")
        if not kid or not jwks_client:
            await websocket.close(code=4001, reason="Invalid token")
            return
        public_key = await jwks_client.get_key(kid)
        validate_token(token, public_key, issuer=settings.issuer)
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await proxy_websocket(
        websocket, settings.graph_service_url, f"/ws/{path}", token
    )
