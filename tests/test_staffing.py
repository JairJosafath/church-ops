from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import FakeClock

Json = dict[str, Any]

# Sunday 15 November 2026, 10:00 in Amsterdam; the fake clock starts on 2 November.
SUNDAY = "2026-11-15T10:00:00+01:00"


@dataclass
class Band:
    """A service, a drums position in the worship band, and three people."""

    service: Json
    team: Json
    drums: Json
    anna: Json
    bram: Json
    cees: Json


def new_service(api: TestClient, starts_at: str = SUNDAY, title: str = "Sunday morning") -> Json:
    response = api.post(
        "/services", json={"title": title, "service_type": "Sunday", "starts_at": starts_at}
    )
    assert response.status_code == 201, response.json()
    service: Json = response.json()
    return service


def make_band(api: TestClient) -> Band:
    team = api.post("/teams", json={"name": "Worship band"}).json()
    drums = api.post(f"/teams/{team['id']}/positions", json={"name": "Drums"}).json()
    people = [api.post("/people", json={"name": n}).json() for n in ("Anna", "Bram", "Cees")]
    return Band(new_service(api), team, drums, *people)


def join(api: TestClient, position: Json, person: Json) -> Json:
    response = api.post(f"/positions/{position['id']}/members", json={"person_id": person["id"]})
    assert response.status_code == 201, response.json()
    body: Json = response.json()
    return body


def ask(api: TestClient, service: Json, position: Json, person: Json) -> Json:
    response = api.post(
        f"/services/{service['id']}/requests",
        json={"position_id": position["id"], "person_id": person["id"]},
    )
    assert response.status_code == 201, response.json()
    request: Json = response.json()
    return request


def answer(api: TestClient, request: Json, *, accept: bool) -> None:
    response = api.post(f"/requests/{request['id']}/answer", json={"accept": accept})
    assert response.status_code == 200, response.json()


def set_needed(api: TestClient, service: Json, needed: list[Json]) -> Json:
    response = api.put(f"/services/{service['id']}/needed", json={"needed": needed})
    assert response.status_code == 200, response.json()
    body: Json = response.json()
    return body


def candidates(api: TestClient, band: Band) -> list[Json]:
    response = api.get(
        f"/services/{band.service['id']}/candidates", params={"position_id": band.drums["id"]}
    )
    assert response.status_code == 200, response.json()
    found: list[Json] = response.json()
    return found


# Who can play what


def test_a_new_position_has_no_members(api: TestClient) -> None:
    band = make_band(api)
    assert band.drums["member_ids"] == []


def test_a_member_is_added_to_a_position_and_listed_with_the_team(api: TestClient) -> None:
    band = make_band(api)
    assert join(api, band.drums, band.bram) == {**band.drums, "member_ids": [band.bram["id"]]}
    assert join(api, band.drums, band.anna)["member_ids"] == [band.anna["id"], band.bram["id"]]
    [team] = api.get("/teams").json()
    assert team["positions"][0]["member_ids"] == [band.anna["id"], band.bram["id"]]


def test_adding_a_member_twice_is_409(api: TestClient) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    again = api.post(f"/positions/{band.drums['id']}/members", json={"person_id": band.anna["id"]})
    assert again.status_code == 409
    assert again.json()["detail"] == (
        f"person {band.anna['id']} is a member of position {band.drums['id']} already"
    )


@pytest.mark.parametrize("missing", ["position", "person"], ids=str)
def test_a_member_of_a_missing_record_is_404(api: TestClient, missing: str) -> None:
    band = make_band(api)
    position_id = 999 if missing == "position" else band.drums["id"]
    person_id = 999 if missing == "person" else band.anna["id"]
    response = api.post(f"/positions/{position_id}/members", json={"person_id": person_id})
    assert response.status_code == 404
    assert response.json() == {"detail": f"{missing} 999 not found"}


def test_a_member_is_removed_from_a_position(api: TestClient) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    join(api, band.drums, band.bram)
    path = f"/positions/{band.drums['id']}/members/{band.anna['id']}"
    assert api.delete(path).status_code == 204
    [team] = api.get("/teams").json()
    assert team["positions"][0]["member_ids"] == [band.bram["id"]]
    again = api.delete(path)
    assert again.status_code == 404
    assert again.json()["detail"] == (
        f"person {band.anna['id']} is not a member of position {band.drums['id']}"
    )
    assert api.delete(f"/positions/999/members/{band.anna['id']}").status_code == 404


# Needed positions


def test_a_new_service_needs_nothing(api: TestClient) -> None:
    assert new_service(api)["needed"] == []


def test_a_need_counts_the_requests_for_the_position(
    api: TestClient, fake_clock: FakeClock
) -> None:
    band = make_band(api)
    service = set_needed(api, band.service, [{"position_id": band.drums["id"], "count": 2}])
    assert service["needed"] == [
        {
            "position": band.drums,
            "team_name": "Worship band",
            "count": 2,
            "accepted": 0,
            "pending": 0,
            "declined": 0,
            "open": 2,
        }
    ]
    answer(api, ask(api, band.service, band.drums, band.anna), accept=True)
    fake_clock.advance(timedelta(minutes=1))
    ask(api, band.service, band.drums, band.bram)
    answer(api, ask(api, band.service, band.drums, band.cees), accept=False)
    [need] = api.get(f"/services/{band.service['id']}").json()["needed"]
    assert (need["accepted"], need["pending"], need["declined"], need["open"]) == (1, 1, 1, 0)


def test_open_is_never_below_zero_and_cancelled_requests_do_not_count(api: TestClient) -> None:
    band = make_band(api)
    set_needed(api, band.service, [{"position_id": band.drums["id"], "count": 1}])
    ask(api, band.service, band.drums, band.anna)
    ask(api, band.service, band.drums, band.bram)
    cancelled = ask(api, band.service, band.drums, band.cees)
    api.post(f"/requests/{cancelled['id']}/cancel")
    [need] = api.get(f"/services/{band.service['id']}").json()["needed"]
    assert (need["pending"], need["declined"], need["open"]) == (2, 0, 0)


def test_needs_are_set_one_by_one_and_count_zero_removes_one(api: TestClient) -> None:
    band = make_band(api)
    keys = api.post(f"/teams/{band.team['id']}/positions", json={"name": "Keys"}).json()
    sound = api.post("/teams", json={"name": "Sound"}).json()
    desk = api.post(f"/teams/{sound['id']}/positions", json={"name": "Front of house"}).json()
    set_needed(
        api,
        band.service,
        [{"position_id": desk["id"], "count": 1}, {"position_id": keys["id"], "count": 1}],
    )
    service = set_needed(api, band.service, [{"position_id": band.drums["id"], "count": 1}])
    assert [(n["team_name"], n["position"]["name"]) for n in service["needed"]] == [
        ("Sound", "Front of house"),
        ("Worship band", "Drums"),
        ("Worship band", "Keys"),
    ]
    service = set_needed(
        api,
        band.service,
        [{"position_id": keys["id"], "count": 0}, {"position_id": band.drums["id"], "count": 3}],
    )
    assert [(n["position"]["name"], n["count"]) for n in service["needed"]] == [
        ("Front of house", 1),
        ("Drums", 3),
    ]


@pytest.mark.parametrize(
    "needed",
    [
        [{"position_id": 1, "count": -1}],
        [{"position_id": 1, "count": 101}],
        [{"position_id": 1}],
        [{"position_id": 1, "count": 1}, {"position_id": 1, "count": 2}],
    ],
    ids=["negative", "too-many", "no-count", "twice"],
)
def test_a_bad_need_is_422(api: TestClient, needed: list[Json]) -> None:
    band = make_band(api)
    needed = [{**n, "position_id": band.drums["id"]} for n in needed]
    response = api.put(f"/services/{band.service['id']}/needed", json={"needed": needed})
    assert response.status_code == 422


def test_a_need_of_a_missing_record_is_404(api: TestClient) -> None:
    band = make_band(api)
    body = {"needed": [{"position_id": 999, "count": 1}]}
    response = api.put(f"/services/{band.service['id']}/needed", json=body)
    assert response.status_code == 404
    assert response.json() == {"detail": "position 999 not found"}
    assert api.put("/services/999/needed", json={"needed": []}).status_code == 404


# Candidates


def test_the_candidates_are_the_positions_members(api: TestClient) -> None:
    band = make_band(api)
    assert candidates(api, band) == []
    join(api, band.drums, band.anna)
    [anna] = candidates(api, band)
    assert anna == {
        "person": band.anna,
        "blocked": False,
        "also_asked": [],
        "conflicts": [],
        "declined_here": False,
        "last_served_on": None,
        "times_served_90_days": 0,
    }


def test_a_blocked_out_candidate_is_unavailable_and_the_reason_stays_theirs(
    api: TestClient,
) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    api.post(
        f"/people/{band.anna['id']}/blockouts",
        json={"starts_on": "2026-11-14", "ends_on": "2026-11-16", "reason": "Hospital visit"},
    )
    response = api.get(
        f"/services/{band.service['id']}/candidates", params={"position_id": band.drums["id"]}
    )
    [anna] = response.json()
    assert anna["blocked"] is True
    assert "Hospital visit" not in response.text


def test_a_candidate_names_requests_elsewhere_on_the_same_day(api: TestClient) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    evening = new_service(api, "2026-11-15T19:00:00+01:00", "Sunday evening")
    next_week = new_service(api, "2026-11-22T10:00:00+01:00", "Next Sunday")
    stream = api.post("/teams", json={"name": "Stream"}).json()
    camera = api.post(f"/teams/{stream['id']}/positions", json={"name": "Camera 2"}).json()
    answer(api, ask(api, evening, camera, band.anna), accept=True)
    ask(api, next_week, band.drums, band.anna)
    [anna] = candidates(api, band)
    assert anna["conflicts"] == [
        {
            "service_id": evening["id"],
            "service_title": "Sunday evening",
            "starts_at": "2026-11-15T19:00:00+01:00",
            "team_name": "Stream",
            "position_name": "Camera 2",
            "status": "accepted",
        }
    ]


def test_a_closed_request_on_the_same_day_is_no_conflict(api: TestClient) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    evening = new_service(api, "2026-11-15T19:00:00+01:00", "Sunday evening")
    answer(api, ask(api, evening, band.drums, band.anna), accept=False)
    assert candidates(api, band)[0]["conflicts"] == []


def test_a_candidate_who_declined_here_or_is_asked_here_says_so(api: TestClient) -> None:
    band = make_band(api)
    keys = api.post(f"/teams/{band.team['id']}/positions", json={"name": "Keys"}).json()
    join(api, band.drums, band.anna)
    join(api, band.drums, band.bram)
    answer(api, ask(api, band.service, keys, band.anna), accept=False)
    ask(api, band.service, keys, band.bram)
    by_name = {c["person"]["name"]: c for c in candidates(api, band)}
    assert (by_name["Anna"]["declined_here"], by_name["Anna"]["also_asked"]) == (True, [])
    assert by_name["Bram"]["declined_here"] is False
    assert by_name["Bram"]["also_asked"] == [
        {"position": keys, "team_name": "Worship band", "status": "pending"}
    ]


def test_a_candidate_says_when_they_last_served_and_how_often(api: TestClient) -> None:
    band = make_band(api)
    join(api, band.drums, band.anna)
    # Accepted at three earlier services, two of them within 90 days, and one later.
    for starts_at, accept in [
        ("2026-07-26T10:00:00+02:00", True),
        ("2026-09-06T10:00:00+02:00", True),
        ("2026-11-08T10:00:00+01:00", True),
        ("2026-11-01T10:00:00+01:00", False),
        ("2026-11-22T10:00:00+01:00", True),
    ]:
        other = new_service(api, starts_at)
        answer(api, ask(api, other, band.drums, band.anna), accept=accept)
    [anna] = candidates(api, band)
    assert (anna["last_served_on"], anna["times_served_90_days"]) == ("2026-11-08", 2)


def test_candidates_without_a_warning_come_first_then_the_least_served(api: TestClient) -> None:
    band = make_band(api)
    dirk = api.post("/people", json={"name": "Dirk"}).json()
    for person in (band.anna, band.bram, band.cees, dirk):
        join(api, band.drums, person)
    # Anna served twice lately, Bram once, Cees never but is blocked out, Dirk never.
    for starts_at, people in [
        ("2026-11-01T10:00:00+01:00", [band.anna, band.bram]),
        ("2026-11-08T10:00:00+01:00", [band.anna]),
    ]:
        other = new_service(api, starts_at)
        for person in people:
            answer(api, ask(api, other, band.drums, person), accept=True)
    api.post(
        f"/people/{band.cees['id']}/blockouts",
        json={"starts_on": "2026-11-15", "ends_on": "2026-11-15"},
    )
    assert [c["person"]["name"] for c in candidates(api, band)] == ["Dirk", "Bram", "Anna", "Cees"]


def test_the_candidates_of_a_missing_record_are_404_and_need_a_position(api: TestClient) -> None:
    band = make_band(api)
    path = f"/services/{band.service['id']}/candidates"
    assert api.get(path).status_code == 422
    assert api.get(path, params={"position_id": 999}).status_code == 404
    response = api.get("/services/999/candidates", params={"position_id": band.drums["id"]})
    assert response.status_code == 404
