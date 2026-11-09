from dataclasses import dataclass
from typing import Any

import pytest
from fastapi.testclient import TestClient

Json = dict[str, Any]


@dataclass
class Setup:
    """A song with an arrangement, a band and a stream team, and a leader to sing it."""

    song: Json
    arrangement: Json
    band: Json
    stream: Json
    leader: Json


def setup(api: TestClient) -> Setup:
    song = api.post("/songs", json={"title": "Amazing Grace"}).json()
    arrangement = api.post(
        f"/songs/{song['id']}/arrangements",
        json={"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240},
    ).json()
    band = api.post("/teams", json={"name": "Worship band"}).json()
    stream = api.post("/teams", json={"name": "Stream"}).json()
    leader = api.post("/people", json={"name": "Anna"}).json()
    return Setup(song, arrangement, band, stream, leader)


def new_service(api: TestClient, starts_at: str) -> Json:
    service: Json = api.post(
        "/services", json={"title": "Sunday", "service_type": "Sunday", "starts_at": starts_at}
    ).json()
    return service


def add_song(api: TestClient, service: Json, arrangement: Json, **fields: object) -> Json:
    response = api.post(
        f"/services/{service['id']}/items",
        json={
            "kind": "song",
            "title": "Amazing Grace",
            "length_seconds": 240,
            "arrangement_id": arrangement["id"],
            **fields,
        },
    )
    assert response.status_code == 201, response.json()
    item: Json = response.json()
    return item


def test_a_song_item_names_its_leader_and_notes_per_team(api: TestClient) -> None:
    s = setup(api)
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    item = add_song(
        api,
        service,
        s.arrangement,
        song_leader_id=s.leader["id"],
        team_notes=[
            {"team_id": s.band["id"], "note": "Drums in on the chorus"},
            {"team_id": s.stream["id"], "note": "Camera 2 on the choir"},
        ],
    )
    assert item["song_leader"] == s.leader
    assert item["team_notes"] == [
        {"team_id": s.stream["id"], "team_name": "Stream", "note": "Camera 2 on the choir"},
        {"team_id": s.band["id"], "team_name": "Worship band", "note": "Drums in on the chorus"},
    ]
    assert api.get(f"/services/{service['id']}").json()["items"] == [item]


def test_an_item_without_a_leader_or_notes_has_none(api: TestClient) -> None:
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    item = api.post(
        f"/services/{service['id']}/items",
        json={"kind": "reading", "title": "Psalm 23", "length_seconds": 120},
    ).json()
    assert (item["song_leader"], item["team_notes"]) == (None, [])


def test_team_notes_are_changed_per_team_and_an_empty_note_removes_one(api: TestClient) -> None:
    s = setup(api)
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    item = add_song(
        api, service, s.arrangement, team_notes=[{"team_id": s.band["id"], "note": "Soft"}]
    )
    path = f"/services/{service['id']}/items/{item['id']}"
    changed = api.patch(path, json={"team_notes": [{"team_id": s.stream["id"], "note": "Wide"}]})
    assert [(n["team_name"], n["note"]) for n in changed.json()["team_notes"]] == [
        ("Stream", "Wide"),
        ("Worship band", "Soft"),
    ]
    changed = api.patch(
        path,
        json={
            "team_notes": [
                {"team_id": s.band["id"], "note": ""},
                {"team_id": s.stream["id"], "note": "Close"},
            ]
        },
    )
    assert [(n["team_name"], n["note"]) for n in changed.json()["team_notes"]] == [
        ("Stream", "Close")
    ]


def test_a_song_leader_is_changed_and_cleared(api: TestClient) -> None:
    s = setup(api)
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    item = add_song(api, service, s.arrangement)
    path = f"/services/{service['id']}/items/{item['id']}"
    assert api.patch(path, json={"song_leader_id": s.leader["id"]}).json()["song_leader"] == (
        s.leader
    )
    assert api.patch(path, json={"song_leader_id": None}).json()["song_leader"] is None


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"kind": "reading", "title": "Reading", "length_seconds": 60, "song_leader_id": 0}, 422),
        ({"song_leader_id": 999}, 404),
        ({"team_notes": [{"team_id": 999, "note": "x"}]}, 404),
        ({"team_notes": [{"team_id": 0, "note": "x"}, {"team_id": 0, "note": "y"}]}, 422),
        ({"team_notes": [{"team_id": 0, "note": "x" * 10_001}]}, 422),
    ],
    ids=["leader-of-a-reading", "missing-leader", "missing-team", "team-twice", "long-note"],
)
def test_a_bad_leader_or_team_note_is_refused(api: TestClient, body: Json, status: int) -> None:
    s = setup(api)
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    if body.get("song_leader_id") == 0:
        body = {**body, "song_leader_id": s.leader["id"]}
    if "team_notes" in body:
        body = {
            "team_notes": [
                {**n, "team_id": s.band["id"]} if n["team_id"] == 0 else n
                for n in body["team_notes"]
            ]
        }
    if "kind" not in body:
        body = {
            "kind": "song",
            "title": "Song",
            "length_seconds": 240,
            "arrangement_id": s.arrangement["id"],
            **body,
        }
    response = api.post(f"/services/{service['id']}/items", json=body)
    assert response.status_code == status


def test_changing_a_led_song_into_a_reading_is_422(api: TestClient) -> None:
    s = setup(api)
    service = new_service(api, "2026-11-15T10:00:00+01:00")
    item = add_song(api, service, s.arrangement, song_leader_id=s.leader["id"])
    path = f"/services/{service['id']}/items/{item['id']}"
    response = api.patch(path, json={"kind": "reading", "arrangement_id": None})
    assert response.status_code == 422
    assert "song_leader_id" in response.json()["detail"]


def test_a_song_added_without_notes_copies_them_from_its_last_earlier_item(
    api: TestClient,
) -> None:
    s = setup(api)
    acoustic = api.post(
        f"/songs/{s.song['id']}/arrangements",
        json={"name": "Acoustic", "key": "A", "tempo_bpm": 68, "length_seconds": 200},
    ).json()
    older, last_week, next_week = (
        new_service(api, starts_at)
        for starts_at in (
            "2026-11-01T10:00:00+01:00",
            "2026-11-08T10:00:00+01:00",
            "2026-11-22T10:00:00+01:00",
        )
    )
    add_song(api, older, s.arrangement, notes="Old notes")
    add_song(
        api,
        last_week,
        acoustic,
        notes="Capo 2",
        team_notes=[{"team_id": s.band["id"], "note": "Drums in on verse 2"}],
    )
    add_song(api, next_week, s.arrangement, notes="Later notes")
    this_week = new_service(api, "2026-11-15T10:00:00+01:00")
    copied = add_song(api, this_week, s.arrangement)
    assert copied["notes"] == "Capo 2"
    assert [(n["team_name"], n["note"]) for n in copied["team_notes"]] == [
        ("Worship band", "Drums in on verse 2")
    ]
    # Notes given are kept; only what is left out is copied.
    own = add_song(api, this_week, s.arrangement, notes="")
    assert (own["notes"], len(own["team_notes"])) == ("", 1)
    own = add_song(api, this_week, s.arrangement, team_notes=[])
    assert (own["notes"], own["team_notes"]) == ("Capo 2", [])


def test_a_song_never_played_before_starts_with_no_notes(api: TestClient) -> None:
    s = setup(api)
    later = new_service(api, "2026-11-22T10:00:00+01:00")
    add_song(api, later, s.arrangement, notes="Later notes")
    first = add_song(api, new_service(api, "2026-11-15T10:00:00+01:00"), s.arrangement)
    assert (first["notes"], first["team_notes"]) == ("", [])


def test_a_template_item_keeps_a_leader_and_team_notes(api: TestClient) -> None:
    s = setup(api)
    service_type = api.post("/service-types", json={"name": "Sunday"}).json()
    item = {
        "kind": "song",
        "title": "Opening song",
        "length_seconds": 240,
        "arrangement_id": s.arrangement["id"],
        "song_leader_id": s.leader["id"],
        "team_notes": [{"team_id": s.band["id"], "note": "Count in"}],
    }
    changed = api.put(
        f"/service-types/{service_type['id']}/template", json={"items": [item], "needed": []}
    ).json()
    [kept] = changed["template"]["items"]
    assert (kept["song_leader"], kept["team_notes"]) == (
        s.leader,
        [{"team_id": s.band["id"], "team_name": "Worship band", "note": "Count in"}],
    )
    service = api.post(
        "/services", json={"service_type_id": service_type["id"], "date": "2026-11-29"}
    ).json()
    [planned] = service["items"]
    assert (planned["song_leader"], planned["team_notes"]) == (
        kept["song_leader"],
        kept["team_notes"],
    )
