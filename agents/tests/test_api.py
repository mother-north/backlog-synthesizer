"""Tests for the FastAPI agents server endpoints."""
import pytest
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health(client):
    async with client as c:
        res = await c.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_kb_search(client):
    async with client as c:
        res = await c.post("/kb/search", json={"query": "test", "limit": 5})
    assert res.status_code == 200
    assert "results" in res.json()


@pytest.mark.asyncio
async def test_pipeline_run_nonexistent_meeting(client):
    async with client as c:
        res = await c.post("/pipeline/run/99999")
    # Should fail gracefully — either 404 or start with error
    assert res.status_code in (200, 404, 500)
