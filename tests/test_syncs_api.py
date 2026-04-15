import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_list_syncs_for_unknown_source_returns_empty(client):
    r = client.get("/api/syncs?source_id=00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_list_schedules_for_unknown_source_returns_empty(client):
    r = client.get("/api/schedules?source_id=00000000-0000-0000-0000-000000000000")
    assert r.status_code == 200
    assert r.json() == []
