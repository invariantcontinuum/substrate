from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from substrate_common import (
    ExceptionLoggingMiddleware,
    KeycloakJwtVerifier,
    RequestIdMiddleware,
    UnauthorizedError,
    configure_logging,
    register_handlers,
)

from src.config import settings
from src.proxy import close_client, init_client, proxy_request
from src.sse_endpoint import close_pool as close_sse_pool
from src.sse_endpoint import init_pool as init_sse_pool
from src.sse_endpoint import router as sse_router

configure_logging(service=settings.service_name)
logger = structlog.get_logger()

jwt_verifier: KeycloakJwtVerifier | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global jwt_verifier
    jwt_verifier = KeycloakJwtVerifier(
        jwks_url=settings.jwks_url,
        expected_issuer=settings.issuer,
    )
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
app.add_middleware(RequestIdMiddleware)
app.add_middleware(ExceptionLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_handlers(app)
app.include_router(sse_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def _authenticate(request: Request) -> dict:
    """Extract and validate JWT from Authorization header.

    Raises UnauthorizedError on any failure; the error handler returns the
    canonical 401 envelope.
    """
    if settings.auth_disabled:
        return {
            "sub": "dev",
            "preferred_username": "dev",
            "realm_access": {"roles": ["admin", "engineer", "viewer"]},
        }
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise UnauthorizedError("missing bearer token")
    if jwt_verifier is None:
        raise UnauthorizedError("verifier not initialised")
    return await jwt_verifier.verify(auth_header[7:])


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
        return True
    return False


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_api(request: Request, path: str):
    claims = await _authenticate(request)
    upstream = (
        settings.ingestion_service_url
        if _route_to_ingestion(request.method, request.url.path)
        else settings.graph_service_url
    )
    return await proxy_request(request, upstream, extra_headers={"X-User-Sub": claims["sub"]})


@app.api_route("/ingest/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def proxy_ingest(request: Request, path: str):
    claims = await _authenticate(request)
    return await proxy_request(request, settings.ingestion_service_url, extra_headers={"X-User-Sub": claims["sub"]})


@app.api_route(
    "/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"]
)
async def proxy_auth(request: Request, path: str):
    return await proxy_request(request, settings.keycloak_url)
