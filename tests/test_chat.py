import logging

import pytest

from app.chat import ChatError, Log, Matrix, message
from app.config import MatrixSettings
from app.http_client import Response, TransportError
from app.records import Notification
from tests.fakes import FakeHttp, ok

SETTINGS = MatrixSettings(
    homeserver="https://matrix.example.org",
    access_token="syt_bot_token_value",  # noqa: S106  a fake token for the test
    room_id="!crew:example.org",
)
NOTIFICATION = Notification(id=7, person_name="Anna de Vries", text="Zondag 10:00: drums")
SEND_URL = (
    "https://matrix.example.org/_matrix/client/v3/rooms/%21crew%3Aexample.org"
    "/send/m.room.message/church-ops-notification-7"
)


def test_the_message_is_the_persons_name_and_the_text() -> None:
    assert message(NOTIFICATION) == "Anna de Vries: Zondag 10:00: drums"


def test_the_log_adapter_logs_the_message(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    Log().send(NOTIFICATION)
    assert "notification 7: Anna de Vries: Zondag 10:00: drums" in caplog.text


def test_matrix_sends_an_m_room_message_with_the_notification_as_its_transaction() -> None:
    http = FakeHttp({("PUT", SEND_URL): ok({"event_id": "$abc"})})
    Matrix(SETTINGS, http).send(NOTIFICATION)
    [sent] = http.sent
    assert (sent.method, sent.url) == ("PUT", SEND_URL)
    assert sent.body == {"msgtype": "m.text", "body": "Anna de Vries: Zondag 10:00: drums"}
    assert sent.headers["Authorization"] == f"Bearer {SETTINGS.access_token}"


@pytest.mark.parametrize(
    ("answer", "error"),
    [
        (
            Response(status=403, body=b'{"errcode": "M_FORBIDDEN", "error": "not in room"}'),
            "Matrix refused notification 7: 403 M_FORBIDDEN not in room",
        ),
        (Response(status=502, body=b"Bad Gateway"), "Matrix refused notification 7: 502$"),
        (
            TransportError("PUT https://matrix.example.org/...: timed out"),
            "could not reach Matrix for notification 7: .*timed out",
        ),
    ],
    ids=["refused", "server-error", "unreachable"],
)
def test_a_failed_delivery_is_a_chat_error_without_the_token(
    answer: Response | TransportError, error: str
) -> None:
    http = FakeHttp({("PUT", SEND_URL): answer})
    with pytest.raises(ChatError, match=error) as caught:
        Matrix(SETTINGS, http).send(NOTIFICATION)
    assert SETTINGS.access_token not in str(caught.value)
