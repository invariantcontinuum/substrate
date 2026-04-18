from fastapi import FastAPI
from fastapi.testclient import TestClient

from substrate_common.middleware import ExceptionLoggingMiddleware, RequestIdMiddleware


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(ExceptionLoggingMiddleware)
    app.add_middleware(RequestIdMiddleware)

    @app.get("/echo")
    def _echo():
        return {"ok": True}

    return app


def test_request_id_echoed_when_not_provided():
    c = TestClient(_app())
    r = c.get("/echo")
    assert r.status_code == 200
    assert "x-request-id" in r.headers
    assert len(r.headers["x-request-id"]) > 0


def test_request_id_echoed_when_provided():
    c = TestClient(_app())
    r = c.get("/echo", headers={"x-request-id": "my-rid-123"})
    assert r.status_code == 200
    assert r.headers["x-request-id"] == "my-rid-123"
