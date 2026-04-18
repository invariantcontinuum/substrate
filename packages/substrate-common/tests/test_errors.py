from fastapi import FastAPI
from fastapi.testclient import TestClient

from substrate_common.errors import (
    ConflictError,
    NotFoundError,
    SubstrateError,
    register_handlers,
)


def _build_app() -> FastAPI:
    app = FastAPI()
    register_handlers(app)

    @app.get("/conflict")
    def _conflict():
        raise ConflictError("sync already running", details={"sync_id": "abc"})

    @app.get("/not-found")
    def _not_found():
        raise NotFoundError("sync missing")

    @app.get("/unknown")
    def _unknown():
        raise RuntimeError("boom")

    return app


def test_known_error_wire_shape():
    c = TestClient(_build_app())
    r = c.get("/conflict")
    assert r.status_code == 409
    body = r.json()
    assert body["error"]["code"] == "CONFLICT"
    assert body["error"]["message"] == "sync already running"
    assert body["error"]["details"] == {"sync_id": "abc"}
    assert "request_id" in body and len(body["request_id"]) > 0


def test_not_found_code():
    c = TestClient(_build_app())
    r = c.get("/not-found")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"


def test_unknown_error_maps_to_internal():
    c = TestClient(_build_app(), raise_server_exceptions=False)
    r = c.get("/unknown")
    assert r.status_code == 500
    body = r.json()
    assert body["error"]["code"] == "INTERNAL"
    assert body["error"]["message"] == "Internal error"


def test_substrate_error_default_fields():
    e = SubstrateError("oops")
    assert e.code == "INTERNAL"
    assert e.status == 500
    assert e.details == {}
