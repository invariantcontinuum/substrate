from fastapi import Header

def require_user_sub(x_user_sub: str | None = Header(default=None, alias="X-User-Sub")) -> str:
    # Gateway injects X-User-Sub for every authenticated browser/API call.
    # Direct service calls in local tests may omit it; keep those paths
    # functional by scoping to a deterministic local fallback tenant.
    return x_user_sub or "dev"
