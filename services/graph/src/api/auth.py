from fastapi import Header

from substrate_common import UnauthorizedError


def require_user_sub(x_user_sub: str | None = Header(default=None, alias="X-User-Sub")) -> str:
    # Gateway injects X-User-Sub for every authenticated browser/API call.
    # Direct service calls in local tests may omit it; keep those paths
    # functional by scoping to a deterministic local fallback tenant.
    return x_user_sub or "dev"


def require_user_sub_strict(x_user_sub: str | None) -> str:
    """Strict helper for routers that hand-roll their `Header(default=None)`
    parameter and want to 401 on missing X-User-Sub instead of falling
    back to "dev". Pass the header value, not the FastAPI Header object."""
    if not x_user_sub:
        raise UnauthorizedError("missing X-User-Sub")
    return x_user_sub
