"""HTTP requests with the standard library, for the api and the Matrix homeserver."""

import http.client
import urllib.error
import urllib.request
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

TIMEOUT_SECONDS = 5.0
"""The longest a request waits to connect, or for the next bytes of an answer."""

MAX_BODY_BYTES = 4 * 1024 * 1024
"""The largest answer read; a larger one is an error, not a memory exhaustion."""


@dataclass(frozen=True, slots=True)
class Response:
    """A server's answer, whatever its status.

    Attributes:
        status: The HTTP status, such as 200 or 409.
        body: The body's bytes; empty when there is none.
    """

    status: int
    body: bytes


class TransportError(Exception):
    """The server could not be reached, or its answer could not be read."""


class Client(Protocol):
    """Sends one HTTP request; what the api client and the Matrix adapter need."""

    def request(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Response:
        """Send a request and read the answer.

        Raises:
            TransportError: When the server cannot be reached or its answer read.
        """
        ...


class Urllib:
    """A `Client` on `urllib.request`; it follows no redirect of a PUT or POST."""

    def request(
        self,
        method: str,
        url: str,
        *,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Response:
        """Send a request, waiting at most `TIMEOUT_SECONDS` at each step.

        Args:
            method: The HTTP method, such as `GET`.
            url: An http or https URL (the configuration allows no other).
            body: The request body; `None` for none.
            headers: The request headers; `None` for none.

        Returns:
            The answer, with any status: a 404 or a 409 is an answer too.

        Raises:
            TransportError: When the server cannot be reached, does not answer
                in time, or answers with more than `MAX_BODY_BYTES`.
        """
        request = urllib.request.Request(  # noqa: S310  config allows only http and https URLs
            url, data=body, headers=dict(headers or {}), method=method
        )
        try:
            response = urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)  # noqa: S310  as above
        except urllib.error.HTTPError as err:
            with err:
                return Response(status=err.code, body=_read(err, method, url))
        except urllib.error.URLError as err:
            msg = f"{method} {url}: {err.reason}"
            raise TransportError(msg) from err
        except (OSError, http.client.HTTPException) as err:
            msg = f"{method} {url}: {err}"
            raise TransportError(msg) from err
        with response:
            status: int = response.status
            return Response(status=status, body=_read(response, method, url))


class _Readable(Protocol):
    def read(self, size: int = -1, /) -> bytes: ...


def _read(stream: _Readable, method: str, url: str) -> bytes:
    try:
        body = stream.read(MAX_BODY_BYTES + 1)
    except (OSError, http.client.HTTPException) as err:
        msg = f"{method} {url}: {err}"
        raise TransportError(msg) from err
    if len(body) > MAX_BODY_BYTES:
        msg = f"{method} {url}: the answer is over {MAX_BODY_BYTES} bytes"
        raise TransportError(msg)
    return body
