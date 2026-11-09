import uuid
from collections.abc import Iterator
from pathlib import Path

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
        "position_members",
        "service_needs",
        "service_types",
        "template_items",
        "template_needs",
        "plan_times",
        "live_item_starts",
    }


# The records a church kept with v0.1: two people, a band with drums, a song, a service
# on Sunday 15 November 2026 with a song and a prayer, Anna's accepted request for
# drums with its reminder, a blockout of Bram's, and the service in live mode.
V0_1_RECORDS = """
INSERT INTO people (name, email) VALUES ('Anna', 'anna@example.nl'), ('Bram', NULL);
INSERT INTO teams (name) VALUES ('Worship band');
INSERT INTO positions (team_id, name) VALUES (1, 'Drums');
INSERT INTO songs (title, authors, ccli) VALUES ('Amazing Grace', 'John Newton', '22025');
INSERT INTO arrangements (song_id, name, key, tempo_bpm, meter, length_seconds, sequence, chart)
    VALUES (1, 'Hymn', 'G', 72, '3/4', 240, 'V1 V2', '[G]Amazing grace');
INSERT INTO services (title, service_type, starts_at, streamed, auto_switch)
    VALUES ('Sunday morning', 'Sunday morning', '2026-11-15T10:00:00+01:00', true, false);
INSERT INTO items (service_id, position, kind, title, length_seconds, arrangement_id, key,
        scene, lower_third, off_stream, notes)
    VALUES (1, 0, 'song', 'Amazing Grace', 240, 1, 'A', 'Band', NULL, false, 'Capo 2'),
        (1, 1, 'prayer', 'Prayer', 300, NULL, NULL, NULL, NULL, true, '');
INSERT INTO requests (service_id, position_id, person_id, status, blocked, created_at,
        answered_at)
    VALUES (1, 1, 1, 'accepted', false, '2026-11-02T12:00:00Z', '2026-11-02T12:05:00Z');
INSERT INTO blockouts (person_id, starts_on, ends_on, reason)
    VALUES (2, '2026-11-15', '2026-11-15', 'Away');
INSERT INTO notifications (person_id, request_id, kind, text, due_at)
    VALUES (1, 1, 'reminder', 'Reminder: you serve as Drums.', '2026-11-08T09:00:00Z');
INSERT INTO live (service_id, controller_id, current_index, version, obs, ableton)
    VALUES (1, 2, 1, 2, 'ok', 'unknown');
"""


def test_start_up_upgrades_a_v0_1_database_and_keeps_its_records(
    postgres_url: str, fresh_schema: str
) -> None:
    v0_1_schema = (Path(__file__).parent / "schema_v0_1.sql").read_text(encoding="utf-8")
    url = psycopg.conninfo.make_conninfo(postgres_url, options=f"-c search_path={fresh_schema}")
    with psycopg.connect(url) as conn:
        conn.execute(v0_1_schema)
        conn.execute(V0_1_RECORDS)
    with TestClient(app) as client:
        service = client.get("/services/1").json()
        assert [i["title"] for i in service["items"]] == ["Amazing Grace", "Prayer"]
        assert service["needed"] == []
        assert (service["service_type_id"], service["series"]) == (None, "")
        assert [t["kind"] for t in service["times"]] == ["service"]
        assert client.get("/services").json()[0]["series"] == ""
        [request] = service["requests"]
        assert (request["status"], request["decline_reason"]) == ("accepted", "")
        [team] = client.get("/teams").json()
        assert team["positions"][0]["member_ids"] == []
        # What v0.2 adds works on the upgraded records.
        member = client.post("/positions/1/members", json={"person_id": 2})
        assert member.json()["member_ids"] == [2]
        needed = client.put("/services/1/needed", json={"needed": [{"position_id": 1, "count": 2}]})
        assert (needed.json()["needed"][0]["accepted"], needed.json()["needed"][0]["open"]) == (
            1,
            1,
        )
        [bram] = client.get("/services/1/candidates", params={"position_id": 1}).json()
        assert bram["blocked"] is True
        sunday = client.post("/service-types", json={"name": "Sunday morning"}).json()
        client.post(f"/service-types/{sunday['id']}/template/from-service", json={"service_id": 1})
        planned = client.post(
            "/services", json={"service_type_id": sunday["id"], "date": "2026-11-22"}
        ).json()
        assert [i["title"] for i in planned["items"]] == ["Amazing Grace", "Prayer"]
        [song] = client.get("/songs").json()
        assert (song["tags"], song["last_scheduled_on"]) == ([], "2026-11-22")
        assert song["arrangements"][0]["keys"] == ["G"]
        assert (song["arrangements"][0]["notes"], song["arrangements"][0]["audio_url"]) == (
            "",
            None,
        )
        assert client.patch("/songs/1", json={"tags": ["Hymn"]}).json()["tags"] == ["Hymn"]
        assert (service["items"][0]["song_leader"], service["items"][0]["team_notes"]) == (None, [])
        later = client.post(
            "/services",
            json={"title": "Later", "service_type": "Sunday", "starts_at": "2026-12-06T10:00:00Z"},
        ).json()
        song_item = {"kind": "song", "title": "Grace", "length_seconds": 240, "arrangement_id": 1}
        copied = client.post(f"/services/{later['id']}/items", json=song_item).json()
        assert copied["notes"] == "Capo 2"
        live = client.get("/services/1/live").json()
        assert (live["current_index"], live["item_started_at"], live["recorded"]) == (1, None, [])
        moved = client.post("/services/1/live/advance", json={"person_id": 2, "to_index": 0})
        assert moved.json()["recorded"] == [
            {"item_id": 1, "started_at": moved.json()["item_started_at"]}
        ]
        withdrawn = client.post("/requests/1/withdraw", json={"reason": "Ill"}).json()
        assert (withdrawn["status"], withdrawn["decline_reason"]) == ("declined", "Ill")
    # A second start-up finds the schema as it left it.
    with TestClient(app) as again:
        assert again.get("/services/1").json()["requests"][0]["status"] == "declined"


def test_without_a_database_the_records_are_kept_in_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("AUTH_DISABLED", "true")
    with TestClient(app) as client:
        assert client.post("/people", json={"name": "Anna"}).status_code == 201
        assert [p["name"] for p in client.get("/people").json()] == ["Anna"]
