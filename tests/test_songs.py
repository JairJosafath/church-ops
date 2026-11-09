from typing import Any

import pytest
from fastapi.testclient import TestClient

Json = dict[str, Any]

HYMN = {"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240}


def new_song(api: TestClient, title: str = "Amazing Grace", **fields: object) -> Json:
    response = api.post("/songs", json={"title": title, **fields})
    assert response.status_code == 201, response.json()
    song: Json = response.json()
    return song


def new_arrangement(api: TestClient, song: Json, **fields: object) -> Json:
    response = api.post(f"/songs/{song['id']}/arrangements", json={**HYMN, **fields})
    assert response.status_code == 201, response.json()
    arrangement: Json = response.json()
    return arrangement


def plan_song(api: TestClient, arrangement: Json, starts_at: str) -> Json:
    service: Json = api.post(
        "/services", json={"title": "Sunday", "service_type": "Sunday", "starts_at": starts_at}
    ).json()
    response = api.post(
        f"/services/{service['id']}/items",
        json={
            "kind": "song",
            "title": "Song",
            "length_seconds": 240,
            "arrangement_id": arrangement["id"],
        },
    )
    assert response.status_code == 201, response.json()
    return service


# Songs


def test_a_new_song_has_tags_and_has_not_been_used(api: TestClient) -> None:
    song = new_song(api, ccli="22025", tags=["Hymn", " Grace ", "hymn"])
    assert song == {
        "id": song["id"],
        "title": "Amazing Grace",
        "authors": "",
        "ccli": "22025",
        "arrangements": [],
        "tags": ["Hymn", "Grace"],
        "last_scheduled_on": None,
        "times_used_12_months": 0,
    }


@pytest.mark.parametrize(
    "tags", [[""], ["x" * 51], ["a\x00"], [f"t{n}" for n in range(31)]], ids=str
)
def test_a_bad_tag_is_422(api: TestClient, tags: list[str]) -> None:
    assert api.post("/songs", json={"title": "Song", "tags": tags}).status_code == 422


def test_a_song_is_changed_by_the_fields_given(api: TestClient) -> None:
    song = new_song(api, authors="John Newton", ccli="22025", tags=["Hymn"])
    path = f"/songs/{song['id']}"
    changed = api.patch(path, json={"title": "Amazing Grace (My Chains Are Gone)"})
    assert changed.status_code == 200
    assert changed.json() == {**song, "title": "Amazing Grace (My Chains Are Gone)"}
    changed = api.patch(path, json={"ccli": None, "tags": ["Easter"], "authors": "Chris Tomlin"})
    assert (changed.json()["ccli"], changed.json()["tags"], changed.json()["authors"]) == (
        None,
        ["Easter"],
        "Chris Tomlin",
    )
    assert api.get(path).json() == changed.json()
    assert api.patch(path, json={"title": None}).status_code == 422
    assert api.patch(path, json={"tags": None}).status_code == 422
    assert api.patch("/songs/999", json={"title": "x"}).status_code == 404


def test_songs_are_filtered_by_tag_and_by_words(api: TestClient) -> None:
    new_song(api, "Amazing Grace", authors="John Newton", tags=["Hymn", "Grace"])
    new_song(api, "Be Thou My Vision", authors="Traditional", tags=["hymn"])
    new_song(api, "10,000 Reasons", authors="Matt Redman", ccli="6016351", tags=["Praise"])

    def titles(**params: str) -> list[str]:
        response = api.get("/songs", params=params)
        assert response.status_code == 200
        return [s["title"] for s in response.json()]

    assert titles(tag="Hymn") == ["Amazing Grace", "Be Thou My Vision"]
    assert titles(tag="praise") == ["10,000 Reasons"]
    assert titles(q="grace") == ["Amazing Grace"]
    assert titles(q="REDMAN") == ["10,000 Reasons"]
    assert titles(q="6016351") == ["10,000 Reasons"]
    assert titles(tag="hymn", q="vision") == ["Be Thou My Vision"]
    assert titles(tag="Christmas") == []


def test_a_song_says_when_it_was_last_scheduled_and_how_often_lately(api: TestClient) -> None:
    song = new_song(api)
    arrangement = new_arrangement(api, song)
    acoustic = new_arrangement(api, song, name="Acoustic")
    # The fake clock says 2 November 2026: two uses in the past year, one before it,
    # and one still to come.
    plan_song(api, arrangement, "2025-10-26T10:00:00+01:00")
    plan_song(api, arrangement, "2026-03-01T10:00:00+01:00")
    plan_song(api, acoustic, "2026-11-01T10:00:00+01:00")
    plan_song(api, arrangement, "2026-11-22T10:00:00+01:00")
    other = new_song(api, "Be Thou My Vision")
    found = api.get(f"/songs/{song['id']}").json()
    assert (found["last_scheduled_on"], found["times_used_12_months"]) == ("2026-11-22", 2)
    [listed, unused] = api.get("/songs").json()
    assert (listed["last_scheduled_on"], listed["times_used_12_months"]) == ("2026-11-22", 2)
    assert (unused["id"], unused["last_scheduled_on"]) == (other["id"], None)


# Arrangements


def test_an_arrangement_has_its_keys_notes_and_recording(api: TestClient) -> None:
    song = new_song(api)
    arrangement = new_arrangement(api, song)
    assert (arrangement["keys"], arrangement["notes"], arrangement["audio_url"]) == (
        ["G"],
        "",
        None,
    )
    full = new_arrangement(
        api,
        song,
        name="Acoustic",
        keys=["A", "G", "Bb", "A"],
        notes="Build from the second verse",
        audio_url="https://example.org/grace.mp3",
    )
    assert full["keys"] == ["G", "A", "Bb"]
    assert (full["notes"], full["audio_url"]) == (
        "Build from the second verse",
        "https://example.org/grace.mp3",
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("keys", ["H"]),
        ("audio_url", "ftp://example.org/a.mp3"),
        ("audio_url", "not a link"),
        ("notes", "x" * 100_001),
    ],
    ids=["bad-key", "not-http", "not-a-link", "notes-too-long"],
)
def test_a_bad_arrangement_field_is_422(api: TestClient, field: str, value: object) -> None:
    song = new_song(api)
    body = {**HYMN, field: value}
    assert api.post(f"/songs/{song['id']}/arrangements", json=body).status_code == 422


def test_an_arrangement_is_changed_by_the_fields_given(api: TestClient) -> None:
    song = new_song(api)
    arrangement = new_arrangement(api, song, keys=["A"], audio_url="https://example.org/grace.mp3")
    path = f"/songs/{song['id']}/arrangements/{arrangement['id']}"
    changed = api.patch(path, json={"tempo_bpm": 80, "chart": "Verse 1\n[G]Amazing grace"})
    assert changed.status_code == 200
    assert changed.json() == {
        **arrangement,
        "tempo_bpm": 80,
        "chart": "Verse 1\n[G]Amazing grace",
    }
    # A new default key goes first, and the old one stays among the keys played.
    rekeyed = api.patch(path, json={"key": "A"}).json()
    assert (rekeyed["key"], rekeyed["keys"]) == ("A", ["A", "G"])
    rekeyed = api.patch(path, json={"keys": ["Bb"], "audio_url": None, "notes": "Slow"}).json()
    assert (rekeyed["keys"], rekeyed["audio_url"], rekeyed["notes"]) == (["A", "Bb"], None, "Slow")
    assert api.get(f"/songs/{song['id']}").json()["arrangements"] == [rekeyed]
    for field in ("name", "key", "tempo_bpm", "meter", "length_seconds", "sequence", "chart"):
        assert api.patch(path, json={field: None}).status_code == 422


def test_an_arrangement_of_another_song_is_404(api: TestClient) -> None:
    song = new_song(api)
    arrangement = new_arrangement(api, song)
    other = new_song(api, "Be Thou My Vision")
    response = api.patch(f"/songs/{other['id']}/arrangements/{arrangement['id']}", json={})
    assert response.status_code == 404
    assert response.json()["detail"] == (
        f"arrangement {arrangement['id']} not found in song {other['id']}"
    )


def test_a_chordpro_chart_is_kept_as_text(api: TestClient) -> None:
    chart = (
        "{c: Capo 2}\nVerse 1:\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\n"
        "Chorus\n[D]My chains are gone\n{comment: last time slow}\n"
    )
    song = new_song(api)
    assert new_arrangement(api, song, chart=chart)["chart"] == chart


# The song-usage report


def test_the_song_usage_report_counts_song_items_in_the_range(api: TestClient) -> None:
    grace = new_song(api, ccli="22025", authors="John Newton")
    vision = new_song(api, "Be Thou My Vision", authors="Traditional")
    unused = new_song(api, "10,000 Reasons")
    new_arrangement(api, unused)
    grace_hymn = new_arrangement(api, grace)
    vision_hymn = new_arrangement(api, vision)
    plan_song(api, grace_hymn, "2026-10-31T23:30:00Z")  # 1 November in Amsterdam
    plan_song(api, vision_hymn, "2026-11-08T10:00:00+01:00")
    service = plan_song(api, grace_hymn, "2026-11-15T10:00:00+01:00")
    api.post(
        f"/services/{service['id']}/items",
        json={
            "kind": "song",
            "title": "Reprise",
            "length_seconds": 120,
            "arrangement_id": grace_hymn["id"],
        },
    )
    plan_song(api, vision_hymn, "2026-12-01T10:00:00+01:00")
    response = api.get("/reports/song-usage", params={"from": "2026-11-01", "to": "2026-11-30"})
    assert response.status_code == 200
    assert response.json() == [
        {
            "song_id": grace["id"],
            "title": "Amazing Grace",
            "authors": "John Newton",
            "ccli": "22025",
            "count": 3,
        },
        {
            "song_id": vision["id"],
            "title": "Be Thou My Vision",
            "authors": "Traditional",
            "ccli": None,
            "count": 1,
        },
    ]


@pytest.mark.parametrize(
    "params",
    [{"from": "2026-11-30", "to": "2026-11-01"}, {"from": "2026-11-01"}, {"to": "2026-11-01"}],
    ids=["backwards", "no-to", "no-from"],
)
def test_a_bad_song_usage_range_is_422(api: TestClient, params: dict[str, str]) -> None:
    assert api.get("/reports/song-usage", params=params).status_code == 422
