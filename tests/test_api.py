import pytest

from app.api import DUE_LIMIT, AlreadySentError, ApiError, Client, NotLiveError
from app.http_client import Response, TransportError
from app.records import Devices, DeviceState, Notification
from tests.builders import live_json
from tests.fakes import NOT_FOUND, FakeHttp, Sent, ok

API = "http://api:8000"
DUE = f"{API}/notifications/due?limit={DUE_LIMIT}"
JSON_HEADERS = {"Accept": "application/json", "Content-Type": "application/json"}


def test_live_reads_every_live_service() -> None:
    http = FakeHttp({("GET", f"{API}/live"): ok([live_json(), live_json(service_id=2)])})
    states = Client(API, http).live()
    assert [state.service_id for state in states] == [1, 2]
    assert http.sent == [Sent("GET", f"{API}/live", None, {"Accept": "application/json"})]


def test_devices_are_reported_as_the_contract_says() -> None:
    url = f"{API}/services/1/live/devices"
    http = FakeHttp({("PUT", url): ok(live_json())})
    Client(API, http).report_devices(
        1, Devices(obs=DeviceState.UNREACHABLE, ableton=DeviceState.UNCONFIGURED)
    )
    assert http.sent == [
        Sent("PUT", url, {"obs": "unreachable", "ableton": "unconfigured"}, JSON_HEADERS)
    ]


def test_reporting_for_a_service_no_longer_live_is_not_live_error() -> None:
    with pytest.raises(
        NotLiveError, match="PUT /services/1/live/devices: the api answered 404 Not Found"
    ):
        Client(API, FakeHttp()).report_devices(
            1, Devices(obs=DeviceState.OK, ableton=DeviceState.OK)
        )


def test_due_notifications_are_read_with_the_limit() -> None:
    http = FakeHttp(
        {("GET", DUE): ok([{"id": 7, "person": {"id": 3, "name": "Anna"}, "text": "Zondag drums"}])}
    )
    assert Client(API, http).due_notifications() == [
        Notification(id=7, person_name="Anna", text="Zondag drums")
    ]


def test_marking_sent_posts_to_the_notification() -> None:
    url = f"{API}/notifications/7/sent"
    http = FakeHttp({("POST", url): ok({})})
    Client(API, http).mark_sent(7)
    assert [(sent.method, sent.url) for sent in http.sent] == [("POST", url)]


def test_marking_sent_twice_is_already_sent_error() -> None:
    url = f"{API}/notifications/7/sent"
    http = FakeHttp({("POST", url): Response(status=409, body=b'{"detail": "already sent"}')})
    with pytest.raises(AlreadySentError, match="already sent"):
        Client(API, http).mark_sent(7)


@pytest.mark.parametrize(
    ("answer", "message"),
    [
        (
            TransportError("GET http://api:8000/live: [Errno 111] Connection refused"),
            r"the api is unreachable: GET http://api:8000/live: \[Errno 111\] Connection refused",
        ),
        (Response(status=500, body=b"Internal Server Error"), "GET /live: the api answered 500$"),
        (NOT_FOUND, "GET /live: the api answered 404 Not Found"),
        (
            Response(status=200, body=b"<html>"),
            "GET /live: the api's answer is not what the contract says",
        ),
        (ok({"live": []}), "GET /live: .* live: expected an array, got an object"),
    ],
    ids=["unreachable", "server-error", "wrong-url", "not-json", "not-the-contract"],
)
def test_a_failed_read_is_an_api_error_saying_why(
    answer: Response | TransportError, message: str
) -> None:
    http = FakeHttp({("GET", f"{API}/live"): answer})
    with pytest.raises(ApiError, match=message) as caught:
        Client(API, http).live()
    # A 404 on GET /live is a wrong API_URL, not a service that left live mode.
    assert not isinstance(caught.value, NotLiveError)
