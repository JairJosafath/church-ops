"""Fakes of what the worker talks to over the network."""

import json
from collections.abc import Mapping
from dataclasses import dataclass, field

from app.http_client import Response, TransportError

NOT_FOUND = Response(status=404, body=b'{"detail": "Not Found"}')


def ok(value: object) -> Response:
    """A 200 answer with `value` as its JSON body."""
    return Response(status=200, body=json.dumps(value).encode())


@dataclass(frozen=True, slots=True)
class Sent:
    """One request the worker sent."""

    method: str
    url: str
    body: object
    headers: Mapping[str, str]


@dataclass
class FakeHttp:
    """An HTTP client that answers from a table by method and URL, 404 for the rest."""

    answers: dict[tuple[str, str], Response | TransportError] = field(default_factory=dict)
    sent: list[Sent] = field(default_factory=list)

    def request(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Response:
        decoded = None if body is None else json.loads(body)
        self.sent.append(Sent(method, url, decoded, dict(headers or {})))
        answer = self.answers.get((method, url), NOT_FOUND)
        if isinstance(answer, TransportError):
            raise answer
        return answer
