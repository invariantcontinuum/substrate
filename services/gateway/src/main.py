import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.auth import JWKSClient, validate_token
from src.proxy import proxy_request, init_client, close_client
from src.sse_endpoint import router as sse_router, init_pool as init_sse_pool, close_pool as close_sse_pool

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
    await init_client()
    await init_sse_pool()
    if settings.auth_disabled:
        logger.warning(
            "gateway_auth_disabled",
            origins=settings.cors_origins,
            note="All requests receive stub admin claims. Do not run this in production.",
        )
    logger.info("gateway_started", keycloak=settings.keycloak_url)
    yield
    await close_sse_pool()
    await close_client()
    logger.info("gateway_stopped")


app = FastAPI(title="Substrate Gateway", lifespan=lifespan)
app.include_router(sse_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _authenticate(request: Request) -> dict | None:
    """Extract and validate JWT from Authorization header."""
    if settings.auth_disabled:
        return {
            "sub": "dev",
            "preferred_username": "dev",
            "realm_access": {"roles": ["admin", "engineer", "viewer"]},
        }
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
    if path.startswith("/api/sources/") and method == "PATCH":
        return True  # partial-update handled by ingestion
    return False  # /api/sources/* (POST/DELETE/GET) and everything else stays on graph


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


