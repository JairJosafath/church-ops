import json

import pytest

from app.records import (
    Arrangement,
    Devices,
    DeviceState,
    Item,
    ItemKind,
    LiveState,
    Notification,
    RecordError,
    parse_live_states,
    parse_notifications,
)
from tests.builders import PERSON, item_json, live_json


def test_a_live_state_is_parsed_from_the_contracts_json() -> None:
    # Through json, as the api client gets it.
    [state] = parse_live_states(json.loads(json.dumps([live_json()])))
    assert state == LiveState(
        service_id=1,
        service_title="Zondagochtend",
        auto_switch=True,
        streamed=True,
        version=1,
        current=Item(
            id=11,
            kind=ItemKind.SONG,
            title="Groot is uw trouw",
            arrangement=Arrangement(song_title="Groot is uw trouw", key="Bb", tempo_bpm=72),
            scene="Band",
            lower_third="Groot is uw trouw · CCLI 12345",
            off_stream=False,
        ),
        next=Item(
            id=12,
            kind=ItemKind.SERMON,
            title="Preek",
            arrangement=None,
            scene="Pulpit",
            lower_third=None,
            off_stream=False,
        ),
        devices=Devices(obs=DeviceState.UNKNOWN, ableton=DeviceState.UNKNOWN),
    )


def test_no_current_or_next_item_is_none() -> None:
    [state] = parse_live_states([live_json(current=None, next=None)])
    assert state.current is None
    assert state.next is None


def test_no_live_service_is_an_empty_list() -> None:
    assert parse_live_states([]) == []


@pytest.mark.parametrize(
    ("value", "message"),
    [
        ({"live": []}, "live: expected an array, got an object"),
        (["x"], r"live\[0\]: expected an object, got a string"),
        ([live_json(version="2")], r"live\[0\]: version must be an integer, got a string"),
        ([live_json(version=True)], r"live\[0\]: version must be an integer, got a boolean"),
        ([live_json(streamed=None)], r"live\[0\]: streamed must be true or false, got null"),
        (
            [{k: v for k, v in live_json().items() if k != "service_id"}],
            r"live\[0\]: service_id is missing",
        ),
        (
            [live_json(current=item_json(kind="dance"))],
            r"live\[0\].current: kind must be one of song, .*, got 'dance'",
        ),
        (
            [live_json(current=item_json(scene=3))],
            r"live\[0\].current: scene must be a string or null, got a number",
        ),
        (
            [live_json(current=item_json(arrangement={"song_title": "x", "key": "G"}))],
            r"live\[0\].current.arrangement: tempo_bpm is missing",
        ),
        (
            [live_json(devices={"obs": "fine", "ableton": "ok"})],
            r"live\[0\].devices: obs must be one of ok, unreachable, unconfigured, unknown",
        ),
    ],
    ids=[
        "not-a-list",
        "entry-not-an-object",
        "string-version",
        "boolean-version",
        "null-flag",
        "missing-field",
        "unknown-kind",
        "number-scene",
        "arrangement-without-tempo",
        "unknown-device-state",
    ],
)
def test_a_malformed_live_state_is_an_error_saying_where(value: object, message: str) -> None:
    with pytest.raises(RecordError, match=message):
        parse_live_states(value)


def test_notifications_are_parsed_with_the_persons_name() -> None:
    value = [
        {
            "id": 7,
            "person": PERSON,
            "kind": "reminder",
            "text": "Je speelt zondag 10:00 drums in Zondagochtend",
            "due_at": "2026-11-14T10:00:00+00:00",
            "sent_at": None,
        }
    ]
    assert parse_notifications(value) == [
        Notification(
            id=7, person_name="Anna de Vries", text="Je speelt zondag 10:00 drums in Zondagochtend"
        )
    ]


def test_a_notification_without_a_person_is_an_error() -> None:
    with pytest.raises(RecordError, match=r"notifications\[0\]: person is missing"):
        parse_notifications([{"id": 7, "text": "x"}])
