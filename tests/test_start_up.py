import uuid
from collections.abc import Iterator

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from app.main import app


@pytest.fixture
def fresh_schema(postgres_url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """Point DATABASE_URL at a new, empty schema of the test database; drop it afterwards."""
    name = f"test_{uuid.uuid4().hex}"
    with psycopg.connect(postgres_url, autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
    url = psycopg.conninfo.make_conninfo(postgres_url, options=f"-c search_path={name}")
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("AUTH_DISABLED", "true")
    yield name
    with psycopg.connect(postgres_url, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))


def test_start_up_creates_the_schema_and_a_restart_keeps_the_records(
    postgres_url: str, fresh_schema: str
) -> None:
    with TestClient(app) as first:
        assert first.post("/people", json={"name": "Anna"}).status_code == 201
    with TestClient(app) as second:
        assert [p["name"] for p in second.get("/people").json()] == ["Anna"]
    with psycopg.connect(postgres_url) as conn:
        rows = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s",
            (fresh_schema,),
        ).fetchall()
    assert {name for (name,) in rows} == {
        "people",
        "teams",
        "positions",
        "songs",
        "arrangements",
        "services",
        "items",
        "requests",
        "blockouts",
        "notifications",
        "live",
    }


def test_without_a_database_the_records_are_kept_in_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("AUTH_DISABLED", "true")
    with TestClient(app) as client:
        assert client.post("/people", json={"name": "Anna"}).status_code == 201
        assert [p["name"] for p in client.get("/people").json()] == ["Anna"]
