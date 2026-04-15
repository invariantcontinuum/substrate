import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_create_then_list_source(client):
    r = client.post("/api/sources", json={
        "source_type": "github_repo", "owner": "tcli", "name": "demo", "url": "u"})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r2 = client.get("/api/sources?limit=50")
    items = r2.json()["items"]
    assert any(it["id"] == sid for it in items)
    client.delete(f"/api/sources/{sid}")
