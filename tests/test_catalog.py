import pytest
from fastapi.testclient import TestClient


def test_a_new_person_is_201_with_their_id(api: TestClient) -> None:
    response = api.post("/people", json={"name": "Anna de Vries", "email": "anna@example.nl"})
    assert response.status_code == 201
    person = response.json()
    assert person == {"id": person["id"], "name": "Anna de Vries", "email": "anna@example.nl"}


def test_email_may_be_left_out(api: TestClient) -> None:
    response = api.post("/people", json={"name": "Bram"})
    assert response.status_code == 201
    assert response.json()["email"] is None


def test_people_are_listed_by_name(api: TestClient) -> None:
    for name in ["Zoë", "Anna", "Mila"]:
        api.post("/people", json={"name": name})
    assert [p["name"] for p in api.get("/people").json()] == ["Anna", "Mila", "Zoë"]


def test_no_people_is_an_empty_list(api: TestClient) -> None:
    response = api.get("/people")
    assert response.status_code == 200
    assert response.json() == []


def test_a_name_is_trimmed(api: TestClient) -> None:
    assert api.post("/people", json={"name": "  Anna  "}).json()["name"] == "Anna"


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "   "},
        {"name": "x" * 201},
        {"name": "Anna\x00"},
        {"name": "Anna", "email": "not an address"},
        {"name": 3},
    ],
    ids=["missing", "empty", "blank", "too-long", "nul", "bad-email", "not-text"],
)
def test_a_bad_person_is_422(api: TestClient, body: dict[str, object]) -> None:
    assert api.post("/people", json=body).status_code == 422


def test_a_body_that_is_not_json_is_422(api: TestClient) -> None:
    response = api.post(
        "/people", content=b"\xff\xfe", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422


def test_a_team_lists_its_positions(api: TestClient) -> None:
    team = api.post("/teams", json={"name": "Worship band"})
    assert team.status_code == 201
    assert team.json()["positions"] == []
    team_id = team.json()["id"]
    drums = api.post(f"/teams/{team_id}/positions", json={"name": "Drums"})
    assert drums.status_code == 201
    assert drums.json() == {
        "id": drums.json()["id"],
        "team_id": team_id,
        "name": "Drums",
        "member_ids": [],
    }
    api.post(f"/teams/{team_id}/positions", json={"name": "Keys"})
    api.post("/teams", json={"name": "Sound"})
    teams = api.get("/teams").json()
    assert [(t["name"], [p["name"] for p in t["positions"]]) for t in teams] == [
        ("Sound", []),
        ("Worship band", ["Drums", "Keys"]),
    ]


def test_a_position_in_a_missing_team_is_404(api: TestClient) -> None:
    response = api.post("/teams/999/positions", json={"name": "Drums"})
    assert response.status_code == 404
    assert response.json() == {"detail": "team 999 not found"}


@pytest.mark.parametrize("path", ["/teams/0/positions", "/teams/x/positions"], ids=["zero", "word"])
def test_a_bad_team_id_is_422(api: TestClient, path: str) -> None:
    assert api.post(path, json={"name": "Drums"}).status_code == 422


def test_a_new_song_has_no_arrangements(api: TestClient) -> None:
    response = api.post("/songs", json={"title": "Amazing Grace"})
    assert response.status_code == 201
    song = response.json()
    assert song == {
        "id": song["id"],
        "title": "Amazing Grace",
        "authors": "",
        "ccli": None,
        "arrangements": [],
        "tags": [],
        "last_scheduled_on": None,
        "times_used_12_months": 0,
    }


def test_songs_are_listed_by_title_with_their_arrangements(api: TestClient) -> None:
    grace = api.post("/songs", json={"title": "Amazing Grace", "authors": "John Newton"}).json()
    api.post("/songs", json={"title": "10,000 Reasons", "ccli": "6016351"})
    api.post(
        f"/songs/{grace['id']}/arrangements",
        json={"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240},
    )
    songs = api.get("/songs").json()
    assert [s["title"] for s in songs] == ["10,000 Reasons", "Amazing Grace"]
    assert [a["name"] for a in songs[1]["arrangements"]] == ["Hymn"]
    assert songs[0]["arrangements"] == []


def test_an_arrangement_takes_the_defaults(api: TestClient) -> None:
    song_id = api.post("/songs", json={"title": "Amazing Grace"}).json()["id"]
    response = api.post(
        f"/songs/{song_id}/arrangements",
        json={"name": "Hymn", "key": "Bb", "tempo_bpm": 72, "length_seconds": 240},
    )
    assert response.status_code == 201
    arrangement = response.json()
    assert arrangement == {
        "id": arrangement["id"],
        "song_id": song_id,
        "name": "Hymn",
        "key": "Bb",
        "tempo_bpm": 72,
        "meter": "4/4",
        "length_seconds": 240,
        "sequence": "",
        "chart": "",
        "keys": ["Bb"],
        "notes": "",
        "audio_url": None,
    }
    assert api.get(f"/songs/{song_id}").json()["arrangements"] == [arrangement]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("key", "H"),
        ("key", "c"),
        ("key", "C##"),
        ("key", ""),
        ("tempo_bpm", 19),
        ("tempo_bpm", 301),
        ("meter", "4"),
        ("meter", "4/3"),
        ("length_seconds", -1),
    ],
    ids=[
        "key-h",
        "key-lower",
        "key-double-sharp",
        "key-empty",
        "tempo-slow",
        "tempo-fast",
        "meter-no-slash",
        "meter-odd-beat",
        "negative-length",
    ],
)
def test_a_bad_arrangement_is_422(api: TestClient, field: str, value: object) -> None:
    song_id = api.post("/songs", json={"title": "Amazing Grace"}).json()["id"]
    body = {"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240, field: value}
    assert api.post(f"/songs/{song_id}/arrangements", json=body).status_code == 422


@pytest.mark.parametrize("key", ["G", "Bb", "F#m", "Ebm", "A"], ids=str)
def test_a_good_key_is_kept(api: TestClient, key: str) -> None:
    song_id = api.post("/songs", json={"title": "Amazing Grace"}).json()["id"]
    body = {"name": "Hymn", "key": key, "tempo_bpm": 72, "meter": "6/8", "length_seconds": 240}
    assert api.post(f"/songs/{song_id}/arrangements", json=body).json()["key"] == key


def test_an_arrangement_of_a_missing_song_is_404(api: TestClient) -> None:
    body = {"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240}
    response = api.post("/songs/999/arrangements", json=body)
    assert response.status_code == 404
    assert response.json() == {"detail": "song 999 not found"}


def test_a_missing_song_is_404(api: TestClient) -> None:
    assert api.get("/songs/999").status_code == 404
