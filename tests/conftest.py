"""Fixtures the api's tests share: a clock they set, a store, and a client on both.

Every test that takes `store` (or `api`, which takes it) runs once on the in-memory
store and once on Postgres. The Postgres run needs TEST_DATABASE_URL, and is skipped
without it; it works in a schema of its own, emptied before each test and dropped
at the end, and never touches the database's other schemas.
"""

import os
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql
from psycopg_pool import ConnectionPool

from app import auth, clock, memory_store, postgres_store, store
from app.main import app

TABLES = (
    "live_item_starts",
    "position_members",
    "service_needs",
    "plan_times",
    "template_needs",
    "template_items",
    "service_types",
    "live",
    "notifications",
    "blockouts",
    "requests",
    "items",
    "services",
    "arrangements",
    "songs",
    "positions",
    "teams",
    "people",
)


class FakeClock:
    """A clock that says what the test sets, starting on Monday 2 November 2026, 12:00 UTC."""

    def __init__(self) -> None:
        self.now = datetime(2026, 11, 2, 12, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, by: timedelta) -> None:
        self.now += by


@pytest.fixture
def fake_clock() -> FakeClock:
    return FakeClock()


@pytest.fixture(scope="session")
def postgres_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set; the Postgres store is not tested")
    return url


@pytest.fixture(scope="session")
def test_schema(postgres_url: str) -> Iterator[str]:
    """A schema of the test database for this run, dropped at the end."""
    name = f"test_{uuid.uuid4().hex}"
    with psycopg.connect(postgres_url, autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
    yield name
    with psycopg.connect(postgres_url, autocommit=True) as conn:
        conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))


@pytest.fixture(scope="session")
def postgres_pool(postgres_url: str, test_schema: str) -> Iterator[ConnectionPool]:
    """A pool whose connections work in the test schema, with the store's tables made."""
    with ConnectionPool(
        postgres_url, min_size=1, kwargs={"options": f"-c search_path={test_schema}"}
    ) as pool:
        postgres_store.PostgresStore(pool).create_schema()
        yield pool


@pytest.fixture(params=["memory", "postgres"])
def store_kind(request: pytest.FixtureRequest) -> str:
    kind: str = request.param
    return kind


@pytest.fixture
def records_store(store_kind: str, request: pytest.FixtureRequest) -> store.Store:
    """An empty store of each kind."""
    if store_kind == "memory":
        return memory_store.MemoryStore()
    pool: ConnectionPool = request.getfixturevalue("postgres_pool")
    with pool.connection() as conn:
        conn.execute(
            sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(
                sql.SQL(", ").join(sql.Identifier(t) for t in TABLES)
            )
        )
    return postgres_store.PostgresStore(pool)


@pytest.fixture
def api(records_store: store.Store, fake_clock: FakeClock) -> Iterator[TestClient]:
    """A client on the app with auth off, the store given and the fake clock."""
    app.dependency_overrides[store.get_store] = lambda: records_store
    app.dependency_overrides[clock.get_clock] = lambda: fake_clock
    app.dependency_overrides[auth.get_verifier] = lambda: None
    yield TestClient(app)
    app.dependency_overrides.clear()
