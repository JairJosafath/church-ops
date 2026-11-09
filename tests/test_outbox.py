import logging
from dataclasses import dataclass, field

import pytest

from app.api import AlreadySentError, ApiError
from app.chat import ChatError
from app.outbox import BUDGET_SECONDS, deliver_due
from app.records import Notification

FIRST = Notification(id=1, person_name="Anna", text="Verzoek: drums zondag")
SECOND = Notification(id=2, person_name="Bram", text="Herinnering: zondag 10:00")
THIRD = Notification(id=3, person_name="Cor", text="Afgelast: repetitie")


@dataclass
class FakeApi:
    due: list[Notification]
    marked: list[int] = field(default_factory=list)
    already_sent: set[int] = field(default_factory=set)
    unreachable: bool = False

    def due_notifications(self) -> list[Notification]:
        return [n for n in self.due if n.id not in self.marked]

    def mark_sent(self, notification_id: int) -> None:
        if self.unreachable:
            msg = "the api is unreachable"
            raise ApiError(msg)
        if notification_id in self.already_sent:
            msg = f"POST /notifications/{notification_id}/sent: the api answered 409"
            raise AlreadySentError(msg)
        self.marked.append(notification_id)


@dataclass
class FakeChat:
    failing: set[int] = field(default_factory=set)
    delivered: list[int] = field(default_factory=list)

    def send(self, notification: Notification) -> None:
        if notification.id in self.failing:
            msg = f"Matrix refused notification {notification.id}: 502"
            raise ChatError(msg)
        self.delivered.append(notification.id)


class FakeClock:
    """A monotonic clock that moves on by `step` seconds each time it is read."""

    def __init__(self, step: float = 0.0) -> None:
        self.now = 0.0
        self.step = step

    def __call__(self) -> float:
        self.now += self.step
        return self.now


def test_each_due_notification_is_delivered_and_marked_sent() -> None:
    api, chat = FakeApi([FIRST, SECOND]), FakeChat()
    deliver_due(api, chat, FakeClock())
    assert chat.delivered == [1, 2]
    assert api.marked == [1, 2]


def test_a_failed_delivery_is_not_marked_and_is_retried_on_the_next_poll(
    caplog: pytest.LogCaptureFixture,
) -> None:
    api, chat = FakeApi([FIRST, SECOND, THIRD]), FakeChat(failing={2})
    deliver_due(api, chat, FakeClock())
    assert api.marked == [1, 3]
    assert "notification 2 not delivered, tried again on the next poll" in caplog.text
    chat.failing.clear()
    deliver_due(api, chat, FakeClock())
    assert api.marked == [1, 3, 2]
    assert chat.delivered == [1, 3, 2]


def test_one_already_marked_sent_is_no_failure(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    api, chat = FakeApi([FIRST, SECOND], already_sent={1}), FakeChat()
    deliver_due(api, chat, FakeClock())
    assert api.marked == [2]
    assert "notification 1 was already marked sent" in caplog.text


def test_the_api_failing_to_mark_one_sent_fails_the_round() -> None:
    api, chat = FakeApi([FIRST, SECOND], unreachable=True), FakeChat()
    with pytest.raises(ApiError, match="unreachable"):
        deliver_due(api, chat, FakeClock())
    # The Matrix transaction id makes the retry of 1 post it once.
    assert chat.delivered == [1]


def test_a_round_stops_delivering_when_its_time_is_up(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    # Each read of the clock is 4 s on: the third notification would start at 12 s.
    api, chat = FakeApi([FIRST, SECOND, THIRD]), FakeChat()
    deliver_due(api, chat, FakeClock(step=BUDGET_SECONDS * 0.4))
    assert chat.delivered == [1, 2]
    assert "1 due notification left for the next poll" in caplog.text


def test_nothing_due_sends_nothing() -> None:
    chat = FakeChat()
    deliver_due(FakeApi([]), chat, FakeClock())
    assert chat.delivered == []
