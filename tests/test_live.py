from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx2
import pytest
from fastapi.testclient import TestClient

from tests.conftest import FakeClock

Json = dict[str, Any]


@dataclass
class Service:
    """A service with three items, and two people who could run it."""

    id: int
    items: list[Json]
    producer: Json
    leader: Json


def make_service(api: TestClient) -> Service:
    service = api.post(
        "/services",
        json={
            "title": "Sunday morning",
            "service_type": "Sunday morning",
            "starts_at": "2026-11-15T10:00:00+01:00",
        },
    ).json()
    song = api.post("/songs", json={"title": "Amazing Grace"}).json()
    arrangement = api.post(
        f"/songs/{song['id']}/arrangements",
        json={"name": "Hymn", "key": "G", "tempo_bpm": 72, "length_seconds": 240},
    ).json()
    bodies: list[Json] = [
        {"kind": "announcement", "title": "Welcome", "length_seconds": 120, "scene": "Wide"},
        {
            "kind": "song",
            "title": "Amazing Grace",
            "length_seconds": 240,
            "arrangement_id": arrangement["id"],
            "scene": "Band",
        },
        {"kind": "prayer", "title": "Prayer", "length_seconds": 300, "off_stream": True},
    ]
    items = [api.post(f"/services/{service['id']}/items", json=b).json() for b in bodies]
    producer = api.post("/people", json={"name": "Anna"}).json()
    leader = api.post("/people", json={"name": "Bram"}).json()
    return Service(id=service["id"], items=items, producer=producer, leader=leader)


def go_live(api: TestClient, service: Service) -> Json:
    response = api.post(
        f"/services/{service.id}/live", json={"controller_id": service.producer["id"]}
    )
    assert response.status_code == 201, response.json()
    state: Json = response.json()
    return state


def advance(api: TestClient, service: Service, person: Json, to_index: int) -> httpx2.Response:
    return api.post(
        f"/services/{service.id}/live/advance",
        json={"person_id": person["id"], "to_index": to_index},
    )


def test_live_mode_starts_at_the_first_item_at_version_1(api: TestClient) -> None:
    service = make_service(api)
    state = go_live(api, service)
    assert state == {
        "service_id": service.id,
        "service_title": "Sunday morning",
        "auto_switch": False,
        "streamed": True,
        "current_index": 0,
        "version": 1,
        "controller": service.producer,
        "current": service.items[0],
        "next": service.items[1],
        "devices": {"obs": "unknown", "ableton": "unknown", "updated_at": None},
        "item_started_at": "2026-11-02T13:00:00+01:00",
        "recorded": [
            {"item_id": service.items[0]["id"], "started_at": "2026-11-02T13:00:00+01:00"}
        ],
    }
    assert api.get(f"/services/{service.id}/live").json() == state
    assert api.get("/live").json() == [state]


def test_going_live_twice_is_409(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = api.post(
        f"/services/{service.id}/live", json={"controller_id": service.leader["id"]}
    )
    assert response.status_code == 409
    assert response.json() == {"detail": f"service {service.id} is live already"}


def test_a_service_without_items_cannot_go_live(api: TestClient) -> None:
    service = api.post(
        "/services",
        json={"title": "Empty", "service_type": "Prayer", "starts_at": "2026-11-15T19:00:00Z"},
    ).json()
    person = api.post("/people", json={"name": "Anna"}).json()
    response = api.post(f"/services/{service['id']}/live", json={"controller_id": person["id"]})
    assert response.status_code == 409
    assert "no items" in response.json()["detail"]


def test_going_live_needs_a_service_and_a_controller(api: TestClient) -> None:
    service = make_service(api)
    person = service.producer["id"]
    assert api.post("/services/999/live", json={"controller_id": person}).status_code == 404
    response = api.post(f"/services/{service.id}/live", json={"controller_id": 999})
    assert response.status_code == 404
    assert response.json() == {"detail": "person 999 not found"}


def test_a_service_that_is_not_live_is_404(api: TestClient) -> None:
    service = make_service(api)
    response = api.get(f"/services/{service.id}/live")
    assert response.status_code == 404
    assert response.json() == {"detail": f"service {service.id} is not live"}
    assert advance(api, service, service.producer, 1).status_code == 404
    assert api.delete(f"/services/{service.id}/live").status_code == 404
    assert api.get("/live").json() == []


def test_the_controller_advances_and_the_version_goes_up(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = advance(api, service, service.producer, 2)
    assert response.status_code == 200
    state = response.json()
    assert (state["current_index"], state["version"]) == (2, 2)
    assert state["current"] == service.items[2]
    assert state["next"] is None
    back = advance(api, service, service.producer, 1).json()
    assert (back["current_index"], back["version"]) == (1, 3)


def test_advancing_to_the_current_item_keeps_the_version(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    state = advance(api, service, service.producer, 0).json()
    assert (state["current_index"], state["version"]) == (0, 1)


def test_only_the_controller_advances_and_the_answer_names_them(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = advance(api, service, service.leader, 1)
    assert response.status_code == 409
    assert response.json() == {
        "detail": f"Anna (person {service.producer['id']}) holds live control of service"
        f" {service.id}; person {service.leader['id']} does not"
    }
    state = api.get(f"/services/{service.id}/live").json()
    assert (state["current_index"], state["version"]) == (0, 1)


@pytest.mark.parametrize("to_index", [3, -1, 10**30], ids=["past-the-end", "negative", "huge"])
def test_advancing_out_of_range_is_422(api: TestClient, to_index: int) -> None:
    service = make_service(api)
    go_live(api, service)
    assert advance(api, service, service.producer, to_index).status_code == 422


def test_a_handover_passes_control_and_keeps_the_version(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    advance(api, service, service.producer, 1)
    response = api.post(
        f"/services/{service.id}/live/handover",
        json={"from_person_id": service.producer["id"], "to_person_id": service.leader["id"]},
    )
    assert response.status_code == 200
    state = response.json()
    assert (state["controller"], state["version"], state["current_index"]) == (
        service.leader,
        2,
        1,
    )
    assert advance(api, service, service.producer, 2).status_code == 409
    assert advance(api, service, service.leader, 2).json()["version"] == 3


def test_a_handover_from_someone_without_control_is_409(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = api.post(
        f"/services/{service.id}/live/handover",
        json={"from_person_id": service.leader["id"], "to_person_id": service.leader["id"]},
    )
    assert response.status_code == 409
    assert "Anna" in response.json()["detail"]


def test_a_handover_to_a_missing_person_is_404(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = api.post(
        f"/services/{service.id}/live/handover",
        json={"from_person_id": service.producer["id"], "to_person_id": 999},
    )
    assert response.status_code == 404


def test_the_worker_reports_its_devices_without_moving_the_version(
    api: TestClient, fake_clock: FakeClock
) -> None:
    service = make_service(api)
    go_live(api, service)
    fake_clock.advance(timedelta(minutes=5))
    response = api.put(
        f"/services/{service.id}/live/devices", json={"obs": "ok", "ableton": "unconfigured"}
    )
    assert response.status_code == 200
    assert response.json()["devices"] == {
        "obs": "ok",
        "ableton": "unconfigured",
        "updated_at": "2026-11-02T13:05:00+01:00",
    }
    assert response.json()["version"] == 1


def test_a_device_state_it_does_not_know_is_422(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    response = api.put(
        f"/services/{service.id}/live/devices", json={"obs": "on fire", "ableton": "ok"}
    )
    assert response.status_code == 422


def test_ending_live_mode_takes_the_service_off_the_live_list(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    assert api.delete(f"/services/{service.id}/live").status_code == 204
    assert api.get("/live").json() == []
    assert go_live(api, service)["version"] == 1


def test_the_live_state_follows_the_plan(api: TestClient) -> None:
    service = make_service(api)
    go_live(api, service)
    api.patch(f"/services/{service.id}", json={"auto_switch": True})
    api.delete(f"/services/{service.id}/items/{service.items[0]['id']}")
    state = api.get(f"/services/{service.id}/live").json()
    assert state["auto_switch"] is True
    assert state["current"]["title"] == "Amazing Grace"
    assert state["current"]["arrangement"]["tempo_bpm"] == 72
    assert state["next"]["off_stream"] is True
    assert state["version"] == 1


def test_each_advance_records_when_the_new_item_started(
    api: TestClient, fake_clock: FakeClock
) -> None:
    service = make_service(api)
    go_live(api, service)
    fake_clock.advance(timedelta(minutes=2, seconds=5))
    state = advance(api, service, service.producer, 1).json()
    assert state["item_started_at"] == "2026-11-02T13:02:05+01:00"
    fake_clock.advance(timedelta(minutes=4))
    advance(api, service, service.producer, 2)
    # Going back is recorded too: the item became current again.
    fake_clock.advance(timedelta(seconds=30))
    state = advance(api, service, service.producer, 1).json()
    ids = [i["id"] for i in service.items]
    assert state["item_started_at"] == "2026-11-02T13:06:35+01:00"
    assert state["recorded"] == [
        {"item_id": ids[0], "started_at": "2026-11-02T13:00:00+01:00"},
        {"item_id": ids[1], "started_at": "2026-11-02T13:02:05+01:00"},
        {"item_id": ids[2], "started_at": "2026-11-02T13:06:05+01:00"},
        {"item_id": ids[1], "started_at": "2026-11-02T13:06:35+01:00"},
    ]
    assert api.get("/live").json()[0]["recorded"] == state["recorded"]


def test_staying_on_the_item_handing_over_or_a_device_report_records_nothing(
    api: TestClient, fake_clock: FakeClock
) -> None:
    service = make_service(api)
    started = go_live(api, service)
    fake_clock.advance(timedelta(minutes=1))
    advance(api, service, service.producer, 0)
    api.post(
        f"/services/{service.id}/live/handover",
        json={"from_person_id": service.producer["id"], "to_person_id": service.leader["id"]},
    )
    state = api.put(
        f"/services/{service.id}/live/devices", json={"obs": "ok", "ableton": "ok"}
    ).json()
    assert (state["item_started_at"], state["recorded"]) == (
        started["item_started_at"],
        started["recorded"],
    )


def test_live_mode_started_again_records_afresh(api: TestClient, fake_clock: FakeClock) -> None:
    service = make_service(api)
    go_live(api, service)
    advance(api, service, service.producer, 1)
    api.delete(f"/services/{service.id}/live")
    fake_clock.advance(timedelta(minutes=10))
    state = go_live(api, service)
    assert state["recorded"] == [
        {"item_id": service.items[0]["id"], "started_at": "2026-11-02T13:10:00+01:00"}
    ]
