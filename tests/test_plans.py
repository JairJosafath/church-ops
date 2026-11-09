from typing import Any

import pytest
from fastapi.testclient import TestClient

Json = dict[str, Any]

SUNDAY = "2026-11-15T10:00:00+01:00"


def new_service(api: TestClient, starts_at: str = SUNDAY, title: str = "Sunday morning") -> Json:
    response = api.post(
        "/services",
        json={"title": title, "service_type": "Sunday morning", "starts_at": starts_at},
    )
    assert response.status_code == 201
    body: Json = response.json()
    return body


def new_arrangement(api: TestClient, key: str = "G") -> Json:
    song = api.post("/songs", json={"title": "Amazing Grace", "authors": "John Newton"}).json()
    arrangement: Json = api.post(
        f"/songs/{song['id']}/arrangements",
        json={
            "name": "Hymn",
            "key": key,
            "tempo_bpm": 72,
            "meter": "3/4",
            "length_seconds": 240,
            "sequence": "V1 V2 V3",
            "chart": "[G]Amazing [C]grace",
        },
    ).json()
    return arrangement


def add_item(api: TestClient, service_id: int, **fields: object) -> Json:
    body: Json = {"kind": "reading", "title": "Reading", "length_seconds": 300, **fields}
    response = api.post(f"/services/{service_id}/items", json=body)
    assert response.status_code == 201, response.json()
    item: Json = response.json()
    return item


def test_a_new_service_has_no_items_and_ends_when_it_starts(api: TestClient) -> None:
    service = new_service(api, starts_at="2026-11-15T09:00:00Z")
    assert service == {
        "id": service["id"],
        "title": "Sunday morning",
        "service_type": "Sunday morning",
        "starts_at": "2026-11-15T10:00:00+01:00",
        "streamed": True,
        "auto_switch": False,
        "items": [],
        "ends_at": "2026-11-15T10:00:00+01:00",
        "requests": [],
    }
    assert api.get(f"/services/{service['id']}").json() == service


@pytest.mark.parametrize(
    "starts_at",
    ["2026-11-15T10:00:00", "2026-11-15", "next sunday", "1850-01-01T10:00:00Z"],
    ids=["no-offset", "date-only", "words", "too-early"],
)
def test_a_start_without_an_offset_is_422(api: TestClient, starts_at: str) -> None:
    body = {"title": "Sunday", "service_type": "Sunday morning", "starts_at": starts_at}
    assert api.post("/services", json=body).status_code == 422


def test_items_start_after_the_lengths_before_them(api: TestClient) -> None:
    service = new_service(api)
    arrangement = new_arrangement(api)
    welcome = add_item(api, service["id"], kind="announcement", title="Welcome", length_seconds=120)
    header = add_item(api, service["id"], kind="header", title="Worship", length_seconds=0)
    song = add_item(
        api,
        service["id"],
        kind="song",
        title="Amazing Grace",
        length_seconds=240,
        arrangement_id=arrangement["id"],
    )
    sermon = add_item(api, service["id"], kind="sermon", title="Sermon", length_seconds=1800)
    assert [i["position"] for i in (welcome, header, song, sermon)] == [0, 1, 2, 3]
    assert [i["starts_at"] for i in (welcome, header, song, sermon)] == [
        "2026-11-15T10:00:00+01:00",
        "2026-11-15T10:02:00+01:00",
        "2026-11-15T10:02:00+01:00",
        "2026-11-15T10:06:00+01:00",
    ]
    planned = api.get(f"/services/{service['id']}").json()
    assert planned["items"] == [welcome, header, song, sermon]
    assert planned["ends_at"] == "2026-11-15T10:36:00+01:00"


def test_lengths_are_elapsed_time_across_the_clock_change(api: TestClient) -> None:
    # Summer time ends at 03:00 on 25 October 2026: the clocks go back to 02:00, so an
    # hour after 02:30 summer time is 02:30 winter time.
    service = new_service(api, starts_at="2026-10-25T02:30:00+02:00")
    add_item(api, service["id"], length_seconds=3600)
    second = add_item(api, service["id"], length_seconds=60)
    assert second["starts_at"] == "2026-10-25T02:30:00+01:00"


def test_a_song_item_shows_its_arrangement_in_its_own_key(api: TestClient) -> None:
    service = new_service(api)
    arrangement = new_arrangement(api, key="G")
    item = add_item(
        api,
        service["id"],
        kind="song",
        title="Amazing Grace",
        length_seconds=240,
        arrangement_id=arrangement["id"],
        key="Bb",
        scene="Band",
        lower_third="Amazing Grace",
        notes="Capo 3",
    )
    assert item == {
        "id": item["id"],
        "service_id": service["id"],
        "position": 0,
        "kind": "song",
        "title": "Amazing Grace",
        "length_seconds": 240,
        "starts_at": SUNDAY,
        "arrangement": {
            "id": arrangement["id"],
            "song_title": "Amazing Grace",
            "name": "Hymn",
            "key": "Bb",
            "tempo_bpm": 72,
            "meter": "3/4",
            "sequence": "V1 V2 V3",
            "chart": "[G]Amazing [C]grace",
        },
        "key": "Bb",
        "scene": "Band",
        "lower_third": "Amazing Grace",
        "off_stream": False,
        "notes": "Capo 3",
    }
    path = f"/services/{service['id']}/items/{item['id']}"
    back = api.patch(path, json={"key": None}).json()
    assert (back["key"], back["arrangement"]["key"]) == (None, "G")
    assert api.get(f"/songs/{arrangement['song_id']}").json()["arrangements"][0]["key"] == "G"


@pytest.mark.parametrize(
    ("fields", "detail"),
    [
        ({"kind": "song"}, "a song item needs an arrangement_id"),
        ({"kind": "header", "length_seconds": 60}, "a header takes no time"),
        ({"kind": "reading", "key": "G"}, "a reading item has no key"),
    ],
    ids=["song-without-arrangement", "header-with-length", "reading-with-key"],
)
def test_an_item_that_does_not_fit_its_kind_is_422(
    api: TestClient, fields: Json, detail: str
) -> None:
    service = new_service(api)
    body = {"title": "Item", "length_seconds": 300, **fields}
    response = api.post(f"/services/{service['id']}/items", json=body)
    assert response.status_code == 422
    assert response.json()["detail"].startswith(detail)


def test_an_item_other_than_a_song_with_an_arrangement_is_422(api: TestClient) -> None:
    service = new_service(api)
    arrangement = new_arrangement(api)
    body = {
        "kind": "video",
        "title": "Clip",
        "length_seconds": 60,
        "arrangement_id": arrangement["id"],
    }
    response = api.post(f"/services/{service['id']}/items", json=body)
    assert response.status_code == 422
    assert "has no arrangement" in response.json()["detail"]


@pytest.mark.parametrize(
    "fields",
    [{"kind": "hymn"}, {"length_seconds": -1}, {"length_seconds": 86_401}, {"title": ""}],
    ids=["unknown-kind", "negative-length", "longer-than-a-day", "no-title"],
)
def test_a_malformed_item_is_422(api: TestClient, fields: Json) -> None:
    service = new_service(api)
    body = {"kind": "reading", "title": "Reading", "length_seconds": 300, **fields}
    assert api.post(f"/services/{service['id']}/items", json=body).status_code == 422


def test_a_song_with_a_missing_arrangement_is_404(api: TestClient) -> None:
    service = new_service(api)
    body = {"kind": "song", "title": "Song", "length_seconds": 300, "arrangement_id": 999}
    response = api.post(f"/services/{service['id']}/items", json=body)
    assert response.status_code == 404
    assert response.json() == {"detail": "arrangement 999 not found"}


def test_an_item_of_a_missing_service_is_404(api: TestClient) -> None:
    body = {"kind": "reading", "title": "Reading", "length_seconds": 300}
    assert api.post("/services/999/items", json=body).status_code == 404


def test_changing_a_length_moves_the_items_after_it(api: TestClient) -> None:
    service = new_service(api)
    first = add_item(api, service["id"], length_seconds=300)
    add_item(api, service["id"], length_seconds=300)
    changed = api.patch(
        f"/services/{service['id']}/items/{first['id']}",
        json={"length_seconds": 600, "title": "Long reading", "off_stream": True},
    )
    assert changed.status_code == 200
    assert (changed.json()["title"], changed.json()["off_stream"]) == ("Long reading", True)
    items = api.get(f"/services/{service['id']}").json()["items"]
    assert [i["starts_at"] for i in items] == [SUNDAY, "2026-11-15T10:10:00+01:00"]


def test_a_song_can_become_a_reading_when_its_arrangement_goes(api: TestClient) -> None:
    service = new_service(api)
    arrangement = new_arrangement(api)
    song = add_item(api, service["id"], kind="song", title="Song", arrangement_id=arrangement["id"])
    path = f"/services/{service['id']}/items/{song['id']}"
    assert api.patch(path, json={"kind": "reading"}).status_code == 422
    changed = api.patch(path, json={"kind": "reading", "arrangement_id": None})
    assert changed.status_code == 200
    assert (changed.json()["kind"], changed.json()["arrangement"]) == ("reading", None)


@pytest.mark.parametrize(
    "field", ["kind", "title", "length_seconds", "off_stream", "notes"], ids=str
)
def test_an_item_field_that_is_not_optional_cannot_be_null(api: TestClient, field: str) -> None:
    service = new_service(api)
    item = add_item(api, service["id"])
    response = api.patch(f"/services/{service['id']}/items/{item['id']}", json={field: None})
    assert response.status_code == 422


def test_an_item_of_another_service_is_404(api: TestClient) -> None:
    one, other = new_service(api), new_service(api)
    item = add_item(api, one["id"])
    path = f"/services/{other['id']}/items/{item['id']}"
    assert api.patch(path, json={"title": "Moved"}).status_code == 404
    assert api.delete(path).status_code == 404


def test_deleting_an_item_closes_up_the_positions(api: TestClient) -> None:
    service = new_service(api)
    items = [
        add_item(api, service["id"], title=f"Reading {n}", length_seconds=60) for n in range(4)
    ]
    response = api.delete(f"/services/{service['id']}/items/{items[1]['id']}")
    assert response.status_code == 204
    assert response.content == b""
    left = api.get(f"/services/{service['id']}").json()["items"]
    assert [(i["title"], i["position"]) for i in left] == [
        ("Reading 0", 0),
        ("Reading 2", 1),
        ("Reading 3", 2),
    ]
    assert left[1]["starts_at"] == "2026-11-15T10:01:00+01:00"
    assert add_item(api, service["id"])["position"] == 3


def test_deleting_a_missing_item_is_404(api: TestClient) -> None:
    service = new_service(api)
    assert api.delete(f"/services/{service['id']}/items/999").status_code == 404


def test_reordering_puts_the_items_in_the_order_given(api: TestClient) -> None:
    service = new_service(api)
    a, b, c = (add_item(api, service["id"], title=t, length_seconds=60) for t in "abc")
    response = api.put(
        f"/services/{service['id']}/items/order", json={"item_ids": [c["id"], a["id"], b["id"]]}
    )
    assert response.status_code == 200
    assert [(i["title"], i["position"], i["starts_at"]) for i in response.json()] == [
        ("c", 0, SUNDAY),
        ("a", 1, "2026-11-15T10:01:00+01:00"),
        ("b", 2, "2026-11-15T10:02:00+01:00"),
    ]
    assert api.get(f"/services/{service['id']}").json()["items"] == response.json()


@pytest.mark.parametrize(
    "order",
    [[0, 1], [0, 1, 1], [0, 1, 2, 2], [0, 1, 2, -1]],
    ids=["missing", "repeated-instead", "repeated", "another-services"],
)
def test_an_order_that_does_not_name_every_item_once_is_422(
    api: TestClient, order: list[int]
) -> None:
    service = new_service(api)
    other = new_service(api)
    stranger = add_item(api, other["id"])
    ids = [add_item(api, service["id"])["id"] for _ in range(3)]
    item_ids = [stranger["id"] if n == -1 else ids[n] for n in order]
    response = api.put(f"/services/{service['id']}/items/order", json={"item_ids": item_ids})
    assert response.status_code == 422
    assert "item_ids" in response.json()["detail"]


def test_the_services_are_listed_by_start_from_a_date(api: TestClient) -> None:
    later = new_service(api, starts_at="2026-11-22T10:00:00+01:00", title="Later")
    # 00:30 on 15 November in Amsterdam, though still the 14th in UTC.
    midnight = new_service(api, starts_at="2026-11-14T23:30:00Z", title="Midnight")
    new_service(api, starts_at="2026-11-08T10:00:00+01:00", title="Earlier")
    add_item(api, later["id"], length_seconds=600)
    add_item(api, later["id"], length_seconds=300)
    everything = api.get("/services").json()
    assert [s["title"] for s in everything] == ["Earlier", "Midnight", "Later"]
    listed = api.get("/services", params={"from": "2026-11-15"}).json()
    assert listed == [
        {
            "id": midnight["id"],
            "title": "Midnight",
            "service_type": "Sunday morning",
            "starts_at": "2026-11-15T00:30:00+01:00",
            "ends_at": "2026-11-15T00:30:00+01:00",
            "item_count": 0,
        },
        {
            "id": later["id"],
            "title": "Later",
            "service_type": "Sunday morning",
            "starts_at": "2026-11-22T10:00:00+01:00",
            "ends_at": "2026-11-22T10:15:00+01:00",
            "item_count": 2,
        },
    ]


def test_a_bad_from_date_is_422(api: TestClient) -> None:
    assert api.get("/services", params={"from": "15-11-2026"}).status_code == 422


def test_a_copy_has_the_items_and_no_link_back(api: TestClient) -> None:
    original = new_service(api)
    arrangement = new_arrangement(api)
    add_item(api, original["id"], kind="song", title="Song", arrangement_id=arrangement["id"])
    reading = add_item(api, original["id"])
    response = api.post(
        f"/services/{original['id']}/copy", json={"starts_at": "2026-11-22T10:00:00+01:00"}
    )
    assert response.status_code == 201
    copy = response.json()
    assert copy["id"] != original["id"]
    assert copy["title"] == "Sunday morning"
    assert copy["requests"] == []
    assert [(i["kind"], i["title"], i["position"]) for i in copy["items"]] == [
        ("song", "Song", 0),
        ("reading", "Reading", 1),
    ]
    assert copy["items"][1]["starts_at"] == "2026-11-22T10:05:00+01:00"
    api.patch(f"/services/{copy['id']}/items/{copy['items'][1]['id']}", json={"title": "Psalm"})
    assert api.get(f"/services/{original['id']}").json()["items"][1] == reading


def test_a_copy_may_have_its_own_title(api: TestClient) -> None:
    original = new_service(api)
    body = {"starts_at": "2026-12-24T22:00:00+01:00", "title": "Christmas Eve"}
    assert (
        api.post(f"/services/{original['id']}/copy", json=body).json()["title"] == "Christmas Eve"
    )


def test_copying_a_missing_service_is_404(api: TestClient) -> None:
    assert api.post("/services/999/copy", json={"starts_at": SUNDAY}).status_code == 404


def test_changing_the_start_moves_every_item(api: TestClient) -> None:
    service = new_service(api)
    add_item(api, service["id"], length_seconds=60)
    response = api.patch(
        f"/services/{service['id']}",
        json={"starts_at": "2026-11-15T11:00:00+01:00", "auto_switch": True, "streamed": False},
    )
    assert response.status_code == 200
    changed = response.json()
    assert (changed["starts_at"], changed["ends_at"]) == (
        "2026-11-15T11:00:00+01:00",
        "2026-11-15T11:01:00+01:00",
    )
    assert (changed["auto_switch"], changed["streamed"], changed["title"]) == (
        True,
        False,
        "Sunday morning",
    )


@pytest.mark.parametrize("field", ["title", "starts_at", "streamed", "auto_switch"], ids=str)
def test_a_service_field_cannot_be_null(api: TestClient, field: str) -> None:
    service = new_service(api)
    assert api.patch(f"/services/{service['id']}", json={field: None}).status_code == 422


def test_a_missing_service_is_404(api: TestClient) -> None:
    assert api.get("/services/999").status_code == 404
    assert api.patch("/services/999", json={"title": "x"}).status_code == 404
    assert api.put("/services/999/items/order", json={"item_ids": []}).status_code == 404
