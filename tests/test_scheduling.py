from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import FakeClock

Json = dict[str, Any]

# Sunday 15 November 2026, 10:00 in Amsterdam; the fake clock starts on 2 November.
SUNDAY = "2026-11-15T10:00:00+01:00"


@dataclass
class Plan:
    """A service, a position in a team, and a person to ask."""

    service: Json
    position: Json
    person: Json


def make_plan(api: TestClient, starts_at: str = SUNDAY) -> Plan:
    service = api.post(
        "/services",
        json={"title": "Sunday morning", "service_type": "Sunday morning", "starts_at": starts_at},
    ).json()
    team = api.post("/teams", json={"name": "Worship band"}).json()
    position = api.post(f"/teams/{team['id']}/positions", json={"name": "Drums"}).json()
    person = api.post("/people", json={"name": "Anna", "email": "anna@example.nl"}).json()
    return Plan(service=service, position=position, person=person)


def ask(api: TestClient, plan: Plan) -> Json:
    response = api.post(
        f"/services/{plan.service['id']}/requests",
        json={"position_id": plan.position["id"], "person_id": plan.person["id"]},
    )
    assert response.status_code == 201, response.json()
    request: Json = response.json()
    return request


def due(api: TestClient) -> list[Json]:
    response = api.get("/notifications/due")
    assert response.status_code == 200
    notifications: list[Json] = response.json()
    return notifications


def test_a_request_is_201_pending_and_names_what_it_asks(api: TestClient) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    assert request == {
        "id": request["id"],
        "service_id": plan.service["id"],
        "service_title": "Sunday morning",
        "service_starts_at": SUNDAY,
        "position": plan.position,
        "team_name": "Worship band",
        "person": plan.person,
        "status": "pending",
        "blocked": False,
        "created_at": "2026-11-02T13:00:00+01:00",
        "answered_at": None,
    }
    assert api.get(f"/services/{plan.service['id']}").json()["requests"] == [request]


def test_a_request_queues_its_notification_due_now(api: TestClient) -> None:
    plan = make_plan(api)
    ask(api, plan)
    [notification] = due(api)
    assert notification == {
        "id": notification["id"],
        "person": plan.person,
        "kind": "request",
        "text": "You are asked to serve as Drums (Worship band) at Sunday morning"
        " on 2026-11-15 10:00. Please accept or decline.",
        "due_at": "2026-11-02T13:00:00+01:00",
        "sent_at": None,
    }


@pytest.mark.parametrize(
    ("starts_on", "ends_on", "blocked"),
    [
        ("2026-11-14", "2026-11-16", True),
        ("2026-11-15", "2026-11-15", True),
        ("2026-11-08", "2026-11-14", False),
        ("2026-11-16", "2026-11-22", False),
    ],
    ids=["around", "that-day", "the-week-before", "the-week-after"],
)
def test_a_request_on_a_blocked_out_date_is_sent_blocked(
    api: TestClient, starts_on: str, ends_on: str, *, blocked: bool
) -> None:
    plan = make_plan(api)
    api.post(
        f"/people/{plan.person['id']}/blockouts",
        json={"starts_on": starts_on, "ends_on": ends_on, "reason": "hospital appointment"},
    )
    assert ask(api, plan)["blocked"] is blocked
    assert "hospital" not in due(api)[0]["text"]


def test_a_services_date_is_its_date_in_amsterdam(api: TestClient) -> None:
    # 00:30 on Sunday 15 November in Amsterdam is still Saturday the 14th in UTC.
    plan = make_plan(api, starts_at="2026-11-14T23:30:00Z")
    blockout = {"starts_on": "2026-11-15", "ends_on": "2026-11-15"}
    api.post(f"/people/{plan.person['id']}/blockouts", json=blockout)
    assert ask(api, plan)["blocked"] is True


def test_a_second_open_request_for_the_same_position_is_409(api: TestClient) -> None:
    plan = make_plan(api)
    first = ask(api, plan)
    body = {"position_id": plan.position["id"], "person_id": plan.person["id"]}
    path = f"/services/{plan.service['id']}/requests"
    assert api.post(path, json=body).status_code == 409
    api.post(f"/requests/{first['id']}/answer", json={"accept": True})
    response = api.post(path, json=body)
    assert response.status_code == 409
    assert response.json()["detail"] == (
        f"person {plan.person['id']} already has a accepted request ({first['id']})"
        f" for position {plan.position['id']} at service {plan.service['id']}"
    )


@pytest.mark.parametrize("ending", ["decline", "cancel"], ids=str)
def test_a_person_may_be_asked_again_once_a_request_is_closed(api: TestClient, ending: str) -> None:
    plan = make_plan(api)
    first = ask(api, plan)
    if ending == "decline":
        api.post(f"/requests/{first['id']}/answer", json={"accept": False})
    else:
        api.post(f"/requests/{first['id']}/cancel")
    assert ask(api, plan)["status"] == "pending"


@pytest.mark.parametrize("missing", ["service", "position", "person"], ids=str)
def test_a_request_naming_a_missing_record_is_404(api: TestClient, missing: str) -> None:
    plan = make_plan(api)
    service_id = 999 if missing == "service" else plan.service["id"]
    body = {
        "position_id": 999 if missing == "position" else plan.position["id"],
        "person_id": 999 if missing == "person" else plan.person["id"],
    }
    response = api.post(f"/services/{service_id}/requests", json=body)
    assert response.status_code == 404
    assert response.json() == {"detail": f"{missing} 999 not found"}


def test_requests_are_listed_newest_first_and_filtered(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    keys = api.post(f"/teams/{plan.position['team_id']}/positions", json={"name": "Keys"}).json()
    bram = api.post("/people", json={"name": "Bram"}).json()
    first = ask(api, plan)
    fake_clock.advance(timedelta(minutes=1))
    second = ask(api, Plan(service=plan.service, position=keys, person=bram))
    api.post(f"/requests/{second['id']}/answer", json={"accept": True})
    everyone = api.get("/requests").json()
    assert [r["id"] for r in everyone] == [second["id"], first["id"]]
    assert [r["id"] for r in api.get("/requests", params={"person_id": bram["id"]}).json()] == [
        second["id"]
    ]
    pending = api.get(
        "/requests", params={"service_id": plan.service["id"], "status": "pending"}
    ).json()
    assert [r["id"] for r in pending] == [first["id"]]
    assert api.get("/requests", params={"service_id": 999}).json() == []
    assert api.get("/requests", params={"status": "maybe"}).status_code == 422


def test_accepting_queues_reminders_a_week_and_a_day_before(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    response = api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    assert response.status_code == 200
    assert (response.json()["status"], response.json()["answered_at"]) == (
        "accepted",
        "2026-11-02T13:00:00+01:00",
    )
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    reminders = [n for n in due(api) if n["kind"] == "reminder"]
    assert [n["due_at"] for n in reminders] == [
        "2026-11-08T10:00:00+01:00",
        "2026-11-14T10:00:00+01:00",
    ]
    assert reminders[0]["text"] == (
        "Reminder: you serve as Drums (Worship band) at Sunday morning on 2026-11-15 10:00."
    )


def test_a_reminder_is_not_due_before_its_time(api: TestClient, fake_clock: FakeClock) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    fake_clock.now = datetime(2026, 11, 8, 8, 59, tzinfo=UTC)
    assert [n["kind"] for n in due(api)] == ["request"]
    fake_clock.advance(timedelta(minutes=1))
    assert [n["kind"] for n in due(api)] == ["request", "reminder"]


@pytest.mark.parametrize(
    ("accepted_at", "reminders"),
    [
        (datetime(2026, 11, 10, tzinfo=UTC), ["2026-11-14T10:00:00+01:00"]),
        (datetime(2026, 11, 14, 12, tzinfo=UTC), []),
    ],
    ids=["inside-the-week", "inside-the-day"],
)
def test_only_reminders_still_to_come_are_queued(
    api: TestClient, fake_clock: FakeClock, accepted_at: datetime, reminders: list[str]
) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    fake_clock.now = accepted_at
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    assert [n["due_at"] for n in due(api) if n["kind"] == "reminder"] == reminders


def test_a_reminder_keeps_the_clock_time_across_the_clock_change(
    api: TestClient, fake_clock: FakeClock
) -> None:
    # Summer time ends on 25 October 2026; the reminders before it are in summer time.
    fake_clock.now = datetime(2026, 10, 1, tzinfo=UTC)
    plan = make_plan(api, starts_at="2026-10-25T10:00:00+01:00")
    request = ask(api, plan)
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    fake_clock.now = datetime(2026, 10, 25, tzinfo=UTC)
    assert [n["due_at"] for n in due(api) if n["kind"] == "reminder"] == [
        "2026-10-18T10:00:00+02:00",
        "2026-10-24T10:00:00+02:00",
    ]


def test_declining_queues_no_reminders(api: TestClient, fake_clock: FakeClock) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    response = api.post(f"/requests/{request['id']}/answer", json={"accept": False})
    assert response.json()["status"] == "declined"
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    assert [n["kind"] for n in due(api)] == ["request"]


@pytest.mark.parametrize("before", ["accept", "decline", "cancel"], ids=str)
def test_answering_a_request_that_is_not_pending_is_409(api: TestClient, before: str) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    if before == "cancel":
        api.post(f"/requests/{request['id']}/cancel")
    else:
        api.post(f"/requests/{request['id']}/answer", json={"accept": before == "accept"})
    response = api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    assert response.status_code == 409
    assert "not pending" in response.json()["detail"]


def test_answering_a_missing_request_is_404(api: TestClient) -> None:
    assert api.post("/requests/999/answer", json={"accept": True}).status_code == 404
    assert api.post("/requests/999/cancel").status_code == 404


def test_cancelling_queues_a_cancellation_and_drops_the_reminders(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    fake_clock.advance(timedelta(hours=1))
    response = api.post(f"/requests/{request['id']}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    notifications = due(api)
    assert [(n["kind"], n["due_at"]) for n in notifications] == [
        ("request", "2026-11-02T13:00:00+01:00"),
        ("cancellation", "2026-11-02T14:00:00+01:00"),
    ]
    assert notifications[1]["text"] == (
        "Cancelled: you are no longer asked to serve as Drums (Worship band)"
        " at Sunday morning on 2026-11-15 10:00."
    )


def test_cancelling_keeps_the_reminders_already_sent(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    fake_clock.now = datetime(2026, 11, 10, tzinfo=UTC)
    for notification in due(api):
        api.post(f"/notifications/{notification['id']}/sent")
    api.post(f"/requests/{request['id']}/cancel")
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    assert [n["kind"] for n in due(api)] == ["cancellation"]


@pytest.mark.parametrize("before", ["decline", "cancel"], ids=str)
def test_cancelling_a_closed_request_is_409(api: TestClient, before: str) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    if before == "cancel":
        api.post(f"/requests/{request['id']}/cancel")
    else:
        api.post(f"/requests/{request['id']}/answer", json={"accept": False})
    assert api.post(f"/requests/{request['id']}/cancel").status_code == 409


def test_moving_a_service_moves_the_reminders_and_tells_who_is_scheduled(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    request = ask(api, plan)
    api.post(f"/requests/{request['id']}/answer", json={"accept": True})
    api.patch(f"/services/{plan.service['id']}", json={"starts_at": "2026-11-15T11:00:00+01:00"})
    fake_clock.now = datetime(2026, 11, 15, tzinfo=UTC)
    assert [(n["kind"], n["due_at"]) for n in due(api)] == [
        ("request", "2026-11-02T13:00:00+01:00"),
        ("change", "2026-11-02T13:00:00+01:00"),
        ("reminder", "2026-11-08T11:00:00+01:00"),
        ("reminder", "2026-11-14T11:00:00+01:00"),
    ]


def test_a_sent_notification_is_no_longer_due(api: TestClient, fake_clock: FakeClock) -> None:
    plan = make_plan(api)
    ask(api, plan)
    [notification] = due(api)
    fake_clock.advance(timedelta(seconds=5))
    response = api.post(f"/notifications/{notification['id']}/sent")
    assert response.status_code == 200
    assert response.json() == {**notification, "sent_at": "2026-11-02T13:00:05+01:00"}
    assert due(api) == []
    again = api.post(f"/notifications/{notification['id']}/sent")
    assert again.status_code == 409
    assert "sent already" in again.json()["detail"]


def test_marking_a_missing_notification_sent_is_404(api: TestClient) -> None:
    assert api.post("/notifications/999/sent").status_code == 404


def test_due_notifications_come_oldest_first_up_to_the_limit(
    api: TestClient, fake_clock: FakeClock
) -> None:
    plan = make_plan(api)
    keys = api.post(f"/teams/{plan.position['team_id']}/positions", json={"name": "Keys"}).json()
    ask(api, plan)
    fake_clock.advance(timedelta(minutes=1))
    ask(api, Plan(service=plan.service, position=keys, person=plan.person))
    [oldest] = api.get("/notifications/due", params={"limit": 1}).json()
    assert oldest["text"].startswith("You are asked to serve as Drums")
    assert api.get("/notifications/due", params={"limit": 0}).status_code == 422


def test_blockouts_are_the_persons_own_and_listed_by_start(api: TestClient) -> None:
    person = api.post("/people", json={"name": "Anna"}).json()
    path = f"/people/{person['id']}/blockouts"
    later = api.post(path, json={"starts_on": "2026-12-20", "ends_on": "2027-01-03"})
    assert later.status_code == 201
    assert later.json() == {
        "id": later.json()["id"],
        "person_id": person["id"],
        "starts_on": "2026-12-20",
        "ends_on": "2027-01-03",
        "reason": "",
    }
    earlier = api.post(
        path, json={"starts_on": "2026-11-15", "ends_on": "2026-11-15", "reason": "Away"}
    ).json()
    assert [b["id"] for b in api.get(path).json()] == [earlier["id"], later.json()["id"]]
    assert api.delete(f"/blockouts/{earlier['id']}").status_code == 204
    assert [b["id"] for b in api.get(path).json()] == [later.json()["id"]]
    assert api.delete(f"/blockouts/{earlier['id']}").status_code == 404


def test_a_blockout_that_ends_before_it_starts_is_422(api: TestClient) -> None:
    person = api.post("/people", json={"name": "Anna"}).json()
    response = api.post(
        f"/people/{person['id']}/blockouts",
        json={"starts_on": "2026-11-15", "ends_on": "2026-11-14"},
    )
    assert response.status_code == 422


def test_the_blockouts_of_a_missing_person_are_404(api: TestClient) -> None:
    assert api.get("/people/999/blockouts").status_code == 404
    body = {"starts_on": "2026-11-15", "ends_on": "2026-11-15"}
    assert api.post("/people/999/blockouts", json=body).status_code == 404
