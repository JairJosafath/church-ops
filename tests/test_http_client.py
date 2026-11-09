import io
import urllib.error
import urllib.request
from email.message import Message
from types import TracebackType
from typing import Self

import pytest

from app.http_client import MAX_BODY_BYTES, Response, TransportError, Urllib


class FakeResponse:
    """What urlopen returns for a 2xx answer."""

    def __init__(self, status: int, body: bytes) -> None:
        self.status = status
        self._body = io.BytesIO(body)

    def read(self, size: int = -1) -> bytes:
        return self._body.read(size)

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        pass


def urlopen_answering(
    answer: FakeResponse | Exception, sent: list[urllib.request.Request]
) -> object:
    def urlopen(request: urllib.request.Request, timeout: float) -> FakeResponse:
        assert timeout > 0
        sent.append(request)
        if isinstance(answer, Exception):
            raise answer
        return answer

    return urlopen


def test_a_2xx_answer_is_its_status_and_body(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[urllib.request.Request] = []
    monkeypatch.setattr(
        urllib.request, "urlopen", urlopen_answering(FakeResponse(200, b"[]"), sent)
    )
    response = Urllib().request(
        "PUT", "http://api/x", body=b"{}", headers={"Content-Type": "application/json"}
    )
    assert response == Response(status=200, body=b"[]")
    [request] = sent
    assert (request.get_method(), request.full_url, request.data) == ("PUT", "http://api/x", b"{}")
    assert request.get_header("Content-type") == "application/json"


def test_an_error_status_is_an_answer_not_an_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    error = urllib.error.HTTPError(
        "http://api/x", 409, "Conflict", Message(), io.BytesIO(b'{"detail": "already sent"}')
    )
    monkeypatch.setattr(urllib.request, "urlopen", urlopen_answering(error, []))
    assert Urllib().request("POST", "http://api/x") == Response(
        status=409, body=b'{"detail": "already sent"}'
    )


def test_an_unreachable_server_is_a_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    error = urllib.error.URLError(ConnectionRefusedError(111, "Connection refused"))
    monkeypatch.setattr(urllib.request, "urlopen", urlopen_answering(error, []))
    with pytest.raises(
        TransportError, match=r"GET http://api:8000/live: \[Errno 111\] Connection refused"
    ):
        Urllib().request("GET", "http://api:8000/live")


def test_a_timeout_is_a_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(urllib.request, "urlopen", urlopen_answering(TimeoutError("timed out"), []))
    with pytest.raises(TransportError, match="GET http://api/live: timed out"):
        Urllib().request("GET", "http://api/live")


def test_a_huge_body_is_a_transport_error(monkeypatch: pytest.MonkeyPatch) -> None:
    huge = FakeResponse(200, b" " * (MAX_BODY_BYTES + 1))
    monkeypatch.setattr(urllib.request, "urlopen", urlopen_answering(huge, []))
    with pytest.raises(TransportError, match="GET http://api/live: the answer is over"):
        Urllib().request("GET", "http://api/live")
