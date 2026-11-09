from typing import Any

import pytest
from fastapi.testclient import TestClient

Json = dict[str, Any]


def new_type(api: TestClient, **fields: object) -> Json:
    response = api.post("/service-types", json={"name": "Sunday morning", **fields})
    assert response.status_code == 201, response.json()
    body: Json = response.json()
    return body


def new_arrangement(api: TestClient) -> Json:
    song = api.post("/songs", json={"title": "Amazing Grace"}).json()
    arrangement: Json = api.post(
        f"/songs/{song['id']}/arrangements",
        json={"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240},
    ).json()
    return arrangement


def drums(api: TestClient) -> Json:
    team = api.post("/teams", json={"name": "Worship band"}).json()
    position: Json = api.post(f"/teams/{team['id']}/positions", json={"name": "Drums"}).json()
    return position


def new_service(api: TestClient, **fields: object) -> Json:
    response = api.post("/services", json=fields)
    assert response.status_code == 201, response.json()
    body: Json = response.json()
    return body


WELCOME = {"kind": "announcement", "title": "Welcome", "length_seconds": 120}


def template_items(arrangement: Json) -> list[Json]:
    return [
        WELCOME,
        {
            "kind": "song",
            "title": "Opening song",
            "length_seconds": 240,
            "arrangement_id": arrangement["id"],
            "scene": "Band",
        },
        {"kind": "prayer", "title": "Prayer", "length_seconds": 300},
    ]


def set_template(api: TestClient, service_type: Json, template: Json) -> Json:
    response = api.put(f"/service-types/{service_type['id']}/template", json=template)
    assert response.status_code == 200, response.json()
    body: Json = response.json()
    return body


# Service types


def test_a_new_service_type_starts_at_ten_with_no_rehearsal_and_an_empty_template(
    api: TestClient,
) -> None:
    service_type = new_type(api)
    assert service_type == {
        "id": service_type["id"],
        "name": "Sunday morning",
        "start_time": "10:00",
        "rehearsal_offset_minutes": None,
        "template": {"items": [], "needed": []},
    }
    assert api.get("/service-types").json() == [service_type]


def test_service_types_are_listed_by_name(api: TestClient) -> None:
    for name in ["Youth evening", "Midweek prayer", "Sunday morning"]:
        new_type(api, name=name)
    names = [t["name"] for t in api.get("/service-types").json()]
    assert names == ["Midweek prayer", "Sunday morning", "Youth evening"]


def test_a_service_type_is_changed_by_the_fields_given(api: TestClient) -> None:
    service_type = new_type(api, start_time="09:30", rehearsal_offset_minutes=90)
    path = f"/service-types/{service_type['id']}"
    changed = api.patch(path, json={"name": "Sunday early"})
    assert changed.status_code == 200
    assert changed.json() == {**service_type, "name": "Sunday early"}
    cleared = api.patch(path, json={"start_time": "18:00", "rehearsal_offset_minutes": None})
    assert (cleared.json()["start_time"], cleared.json()["rehearsal_offset_minutes"]) == (
        "18:00",
        None,
    )
    assert api.patch("/service-types/999", json={"name": "x"}).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"name": ""},
        {"name": "Sunday", "start_time": "25:00"},
        {"name": "Sunday", "start_time": "9:30"},
        {"name": "Sunday", "start_time": "09:30:00"},
        {"name": "Sunday", "rehearsal_offset_minutes": 0},
        {"name": "Sunday", "rehearsal_offset_minutes": 20_161},
    ],
    ids=["no-name", "empty-name", "hour-25", "one-digit", "seconds", "zero", "too-long"],
)
def test_a_bad_service_type_is_422(api: TestClient, body: Json) -> None:
    assert api.post("/service-types", json=body).status_code == 422


def test_a_name_or_start_time_may_not_be_cleared(api: TestClient) -> None:
    service_type = new_type(api)
    path = f"/service-types/{service_type['id']}"
    assert api.patch(path, json={"name": None}).status_code == 422
    assert api.patch(path, json={"start_time": None}).status_code == 422


# Templates


def test_a_template_is_set_with_items_and_needed_positions(api: TestClient) -> None:
    service_type = new_type(api)
    arrangement = new_arrangement(api)
    position = drums(api)
    body = {
        "items": template_items(arrangement),
        "needed": [{"position_id": position["id"], "count": 1}],
    }
    changed = set_template(api, service_type, body)
    items = changed["template"]["items"]
    assert items[0] == {
        "kind": "announcement",
        "title": "Welcome",
        "length_seconds": 120,
        "arrangement_id": None,
        "key": None,
        "scene": None,
        "lower_third": None,
        "off_stream": False,
        "notes": "",
        "song_leader": None,
        "team_notes": [],
    }
    assert (items[1]["arrangement_id"], items[1]["scene"]) == (arrangement["id"], "Band")
    assert items[2]["off_stream"] is True
    assert changed["template"]["needed"] == [{"position_id": position["id"], "count": 1}]
    assert api.get("/service-types").json() == [changed]
    replaced = set_template(api, service_type, {"items": [WELCOME], "needed": []})
    assert replaced["template"] == {"items": [{**items[0]}], "needed": []}


@pytest.mark.parametrize(
    ("item", "status"),
    [
        ({"kind": "song", "title": "Song", "length_seconds": 240}, 422),
        ({"kind": "header", "title": "Worship", "length_seconds": 60}, 422),
        ({"kind": "song", "title": "Song", "length_seconds": 240, "arrangement_id": 999}, 404),
    ],
    ids=["song-without-arrangement", "header-with-length", "missing-arrangement"],
)
def test_a_template_item_follows_the_rules_of_an_item(
    api: TestClient, item: Json, status: int
) -> None:
    service_type = new_type(api)
    path = f"/service-types/{service_type['id']}/template"
    assert api.put(path, json={"items": [item], "needed": []}).status_code == status


def test_a_template_needing_a_missing_position_is_404(api: TestClient) -> None:
    service_type = new_type(api)
    body = {"items": [], "needed": [{"position_id": 999, "count": 1}]}
    response = api.put(f"/service-types/{service_type['id']}/template", json=body)
    assert response.status_code == 404
    assert response.json() == {"detail": "position 999 not found"}
    assert api.put("/service-types/999/template", json={"items": [], "needed": []}).status_code == (
        404
    )


def test_a_template_needs_a_position_once_and_drops_a_zero_count(api: TestClient) -> None:
    service_type = new_type(api)
    position = drums(api)
    path = f"/service-types/{service_type['id']}/template"
    twice = [{"position_id": position["id"], "count": 1}] * 2
    assert api.put(path, json={"items": [], "needed": twice}).status_code == 422
    zero = [{"position_id": position["id"], "count": 0}]
    assert set_template(api, service_type, {"items": [], "needed": zero})["template"] == {
        "items": [],
        "needed": [],
    }


def test_a_template_is_taken_from_a_service(api: TestClient) -> None:
    service_type = new_type(api)
    position = drums(api)
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-15T10:00:00+01:00"
    )
    api.post(f"/services/{service['id']}/items", json=WELCOME)
    api.post(
        f"/services/{service['id']}/items",
        json={"kind": "sermon", "title": "Sermon", "length_seconds": 1800, "notes": "Psalm 23"},
    )
    api.put(
        f"/services/{service['id']}/needed",
        json={"needed": [{"position_id": position["id"], "count": 2}]},
    )
    response = api.post(
        f"/service-types/{service_type['id']}/template/from-service",
        json={"service_id": service["id"]},
    )
    assert response.status_code == 200
    template = response.json()["template"]
    assert [(i["kind"], i["title"], i["notes"]) for i in template["items"]] == [
        ("announcement", "Welcome", ""),
        ("sermon", "Sermon", "Psalm 23"),
    ]
    assert template["needed"] == [{"position_id": position["id"], "count": 2}]
    path = f"/service-types/{service_type['id']}/template/from-service"
    assert api.post(path, json={"service_id": 999}).status_code == 404
    other = "/service-types/999/template/from-service"
    assert api.post(other, json={"service_id": service["id"]}).status_code == 404


# Plans from a type


def test_a_service_from_a_type_is_a_copy_of_its_template(api: TestClient) -> None:
    service_type = new_type(api)
    arrangement = new_arrangement(api)
    position = drums(api)
    set_template(
        api,
        service_type,
        {
            "items": template_items(arrangement),
            "needed": [{"position_id": position["id"], "count": 2}],
        },
    )
    service = new_service(
        api,
        title="Advent 1",
        service_type_id=service_type["id"],
        starts_at="2026-11-29T10:00:00+01:00",
        series="Advent",
    )
    assert (service["service_type_id"], service["service_type"], service["series"]) == (
        service_type["id"],
        "Sunday morning",
        "Advent",
    )
    assert [(i["position"], i["title"], i["starts_at"]) for i in service["items"]] == [
        (0, "Welcome", "2026-11-29T10:00:00+01:00"),
        (1, "Opening song", "2026-11-29T10:02:00+01:00"),
        (2, "Prayer", "2026-11-29T10:06:00+01:00"),
    ]
    assert service["items"][1]["arrangement"]["id"] == arrangement["id"]
    assert [(n["position"]["id"], n["count"], n["open"]) for n in service["needed"]] == [
        (position["id"], 2, 2)
    ]
    # A change to the template later does not change the service planned from it.
    set_template(api, service_type, {"items": [], "needed": []})
    again = api.get(f"/services/{service['id']}").json()
    assert (len(again["items"]), len(again["needed"])) == (3, 1)
    # Nor does a change to the service change the template.
    api.delete(f"/services/{service['id']}/items/{service['items'][0]['id']}")
    assert api.get("/service-types").json()[0]["template"]["items"] == []


def test_a_service_from_a_type_may_give_a_date_and_start_at_the_types_time(
    api: TestClient,
) -> None:
    service_type = new_type(api, start_time="09:30")
    service = new_service(api, service_type_id=service_type["id"], date="2026-11-29")
    assert (service["title"], service["starts_at"], service["series"]) == (
        "Sunday morning",
        "2026-11-29T09:30:00+01:00",
        "",
    )
    # In summer time the same clock time is another UTC time.
    summer = new_service(api, service_type_id=service_type["id"], date="2027-06-06")
    assert summer["starts_at"] == "2027-06-06T09:30:00+02:00"


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Sunday", "service_type": "Sunday", "date": "2026-11-29"},
        {"title": "Sunday", "starts_at": "2026-11-29T10:00:00+01:00"},
        {"service_type": "Sunday", "starts_at": "2026-11-29T10:00:00+01:00"},
        {"service_type_id": 0, "date": "2026-11-29", "starts_at": "2026-11-29T10:00:00+01:00"},
        {"service_type_id": 0},
        {"service_type_id": 0, "date": "29-11-2026"},
    ],
    ids=["date-without-type", "no-type", "no-title", "date-and-start", "no-time", "bad-date"],
)
def test_a_service_without_what_it_needs_is_422(api: TestClient, body: Json) -> None:
    service_type = new_type(api)
    if "service_type_id" in body:
        body = {**body, "service_type_id": service_type["id"]}
    assert api.post("/services", json=body).status_code == 422


def test_a_service_of_a_missing_type_is_404(api: TestClient) -> None:
    response = api.post("/services", json={"service_type_id": 999, "date": "2026-11-29"})
    assert response.status_code == 404
    assert response.json() == {"detail": "service type 999 not found"}


def test_a_service_without_a_type_has_none_and_no_series(api: TestClient) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    assert (service["service_type_id"], service["series"]) == (None, "")
    [summary] = api.get("/services").json()
    assert (summary["service_type_id"], summary["series"]) == (None, "")


def test_a_services_series_can_be_changed(api: TestClient) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    changed = api.patch(f"/services/{service['id']}", json={"series": "Advent"})
    assert changed.json()["series"] == "Advent"
    assert api.get("/services").json()[0]["series"] == "Advent"


# Times


def service_time(service: Json) -> Json:
    return {
        "id": 0,
        "kind": "service",
        "name": service["title"],
        "starts_at": service["starts_at"],
        "ends_at": service["ends_at"],
    }


def test_a_service_has_its_own_time(api: TestClient) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    assert service["times"] == [service_time(service)]
    api.post(f"/services/{service['id']}/items", json=WELCOME)
    again = api.get(f"/services/{service['id']}").json()
    assert again["times"] == [
        {**service_time(service), "ends_at": "2026-11-29T10:02:00+01:00"},
    ]


def test_a_rehearsal_is_added_listed_by_start_and_deleted(api: TestClient) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    path = f"/services/{service['id']}/times"
    thursday = {
        "kind": "rehearsal",
        "name": "Band rehearsal",
        "starts_at": "2026-11-26T19:30:00+01:00",
        "ends_at": "2026-11-26T21:30:00+01:00",
    }
    created = api.post(path, json=thursday)
    assert created.status_code == 201
    assert created.json() == {"id": created.json()["id"], **thursday}
    warm_up = api.post(
        path,
        json={
            **thursday,
            "name": "Sound check",
            "starts_at": "2026-11-29T08:30:00+01:00",
            "ends_at": "2026-11-29T09:30:00+01:00",
        },
    ).json()
    times = api.get(f"/services/{service['id']}").json()["times"]
    assert [t["name"] for t in times] == ["Band rehearsal", "Sound check", "Sunday"]
    assert api.delete(f"{path}/{warm_up['id']}").status_code == 204
    assert [t["name"] for t in api.get(f"/services/{service['id']}").json()["times"]] == [
        "Band rehearsal",
        "Sunday",
    ]
    assert api.delete(f"{path}/{warm_up['id']}").status_code == 404


def test_the_services_own_time_cannot_be_deleted(api: TestClient) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    response = api.delete(f"/services/{service['id']}/times/0")
    assert response.status_code == 409
    assert "read-only" in response.json()["detail"]


def test_a_rehearsal_of_another_service_is_not_deleted_through_this_one(api: TestClient) -> None:
    first, second = (
        new_service(api, title=t, service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00")
        for t in ("First", "Second")
    )
    rehearsal = api.post(
        f"/services/{first['id']}/times",
        json={
            "kind": "rehearsal",
            "name": "Rehearsal",
            "starts_at": "2026-11-29T08:30:00+01:00",
            "ends_at": "2026-11-29T09:30:00+01:00",
        },
    ).json()
    assert api.delete(f"/services/{second['id']}/times/{rehearsal['id']}").status_code == 404
    assert len(api.get(f"/services/{first['id']}").json()["times"]) == 2


@pytest.mark.parametrize(
    "changes",
    [
        {"kind": "service"},
        {"ends_at": "2026-11-29T08:30:00+01:00"},
        {"ends_at": "2026-11-29T08:00:00+01:00"},
        {"starts_at": "2026-11-29T08:30:00"},
        {"name": ""},
    ],
    ids=["kind-service", "no-length", "ends-before", "no-offset", "no-name"],
)
def test_a_bad_rehearsal_is_422(api: TestClient, changes: Json) -> None:
    service = new_service(
        api, title="Sunday", service_type="Sunday", starts_at="2026-11-29T10:00:00+01:00"
    )
    body = {
        "kind": "rehearsal",
        "name": "Rehearsal",
        "starts_at": "2026-11-29T08:30:00+01:00",
        "ends_at": "2026-11-29T09:30:00+01:00",
        **changes,
    }
    assert api.post(f"/services/{service['id']}/times", json=body).status_code == 422


def test_a_rehearsal_of_a_missing_service_is_404(api: TestClient) -> None:
    body = {
        "kind": "rehearsal",
        "name": "Rehearsal",
        "starts_at": "2026-11-29T08:30:00+01:00",
        "ends_at": "2026-11-29T09:30:00+01:00",
    }
    assert api.post("/services/999/times", json=body).status_code == 404
    assert api.delete("/services/999/times/1").status_code == 404


@pytest.mark.parametrize(
    ("offset", "rehearsal"),
    [
        (90, ("2026-11-29T08:30:00+01:00", "2026-11-29T10:00:00+01:00")),
        (3750, ("2026-11-26T19:30:00+01:00", "2026-11-26T21:30:00+01:00")),
    ],
    ids=["that-morning", "on-thursday"],
)
def test_a_types_rehearsal_offset_adds_a_rehearsal(
    api: TestClient, offset: int, rehearsal: tuple[str, str]
) -> None:
    service_type = new_type(api, rehearsal_offset_minutes=offset)
    service = new_service(api, service_type_id=service_type["id"], date="2026-11-29")
    first, own = service["times"]
    assert (first["kind"], first["name"], first["starts_at"], first["ends_at"]) == (
        "rehearsal",
        "Rehearsal",
        *rehearsal,
    )
    assert own == service_time(service)


def test_a_copy_keeps_the_needs_and_moves_the_rehearsals_with_it(api: TestClient) -> None:
    position = drums(api)
    service_type = new_type(api, rehearsal_offset_minutes=90)
    service = new_service(api, service_type_id=service_type["id"], date="2026-11-29")
    api.put(
        f"/services/{service['id']}/needed",
        json={"needed": [{"position_id": position["id"], "count": 2}]},
    )
    copy = api.post(
        f"/services/{service['id']}/copy", json={"starts_at": "2026-12-06T11:00:00+01:00"}
    ).json()
    assert (copy["service_type_id"], copy["series"]) == (service_type["id"], "")
    assert [(n["position"]["id"], n["count"]) for n in copy["needed"]] == [(position["id"], 2)]
    assert [(t["kind"], t["starts_at"]) for t in copy["times"]] == [
        ("rehearsal", "2026-12-06T09:30:00+01:00"),
        ("service", "2026-12-06T11:00:00+01:00"),
    ]
