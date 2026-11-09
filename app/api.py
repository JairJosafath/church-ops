"""The church-ops api, as the worker calls it: live states, device reports, notifications."""

import json
from collections.abc import Callable

from app import http_client
from app.records import (
    Devices,
    LiveState,
    Notification,
    parse_live_states,
    parse_notifications,
)

DUE_LIMIT = 50
"""The most due notifications asked for in one poll."""

_HTTP_OK = 200
_HTTP_NOT_FOUND = 404
_HTTP_CONFLICT = 409
_MAX_DETAIL_CHARS = 200


class ApiError(Exception):
    """The api could not be reached, or answered other than the contract says."""


class NotLiveError(ApiError):
    """The service is not in live mode (any more): the api answered 404."""


class AlreadySentError(ApiError):
    """The notification was already marked sent: the api answered 409."""


class Client:
    """Calls the api at its base URL, as JSON over HTTP."""

    def __init__(self, base_url: str, http: http_client.Client) -> None:
        """Call the api at `base_url` through `http`.

        Args:
            base_url: The api's base URL, without a trailing slash (`API_URL`).
            http: Sends the requests.
        """
        self._base_url = base_url
        self._http = http

    def live(self) -> list[LiveState]:
        """Read every service in live mode (`GET /live`).

        Returns:
            Their live states; empty when no service is live.

        Raises:
            ApiError: When the api cannot be reached or its answer is malformed.
        """
        return self._parsed("/live", parse_live_states)

    def report_devices(self, service_id: int, devices: Devices) -> None:
        """Report OBS's and Ableton's state for a live service (`PUT .../live/devices`).

        Args:
            service_id: The service.
            devices: The states to record.

        Raises:
            NotLiveError: When the service left live mode meanwhile.
            ApiError: When the api cannot be reached or refuses the report.
        """
        path = f"/services/{service_id}/live/devices"
        body = {"obs": devices.obs.value, "ableton": devices.ableton.value}
        response = self._call("PUT", path, body)
        if response.status == _HTTP_NOT_FOUND:
            raise NotLiveError(_refusal("PUT", path, response))
        _check("PUT", path, response)

    def due_notifications(self) -> list[Notification]:
        """Read the notifications due and not yet sent, oldest first, at most `DUE_LIMIT`.

        Returns:
            The due notifications; empty when none is due.

        Raises:
            ApiError: When the api cannot be reached or its answer is malformed.
        """
        return self._parsed(f"/notifications/due?limit={DUE_LIMIT}", parse_notifications)

    def mark_sent(self, notification_id: int) -> None:
        """Record that a notification was delivered (`POST /notifications/{id}/sent`).

        Args:
            notification_id: The notification.

        Raises:
            AlreadySentError: When it was already marked sent.
            ApiError: When the api cannot be reached or refuses it.
        """
        path = f"/notifications/{notification_id}/sent"
        response = self._call("POST", path)
        if response.status == _HTTP_CONFLICT:
            raise AlreadySentError(_refusal("POST", path, response))
        _check("POST", path, response)

    def _parsed[T](self, path: str, parse: Callable[[object], T]) -> T:
        response = self._call("GET", path)
        _check("GET", path, response)
        try:
            return parse(json.loads(response.body))
        except ValueError as err:
            # RecordError is a ValueError, as are JSON's errors.
            msg = f"GET {path}: the api's answer is not what the contract says: {err}"
            raise ApiError(msg) from err

    def _call(self, method: str, path: str, payload: object = None) -> http_client.Response:
        headers = {"Accept": "application/json"}
        body = None
        if payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        try:
            return self._http.request(method, self._base_url + path, body=body, headers=headers)
        except http_client.TransportError as err:
            msg = f"the api is unreachable: {err}"
            raise ApiError(msg) from err


def _check(method: str, path: str, response: http_client.Response) -> None:
    if response.status != _HTTP_OK:
        raise ApiError(_refusal(method, path, response))


def _refusal(method: str, path: str, response: http_client.Response) -> str:
    return f"{method} {path}: the api answered {response.status} {_detail(response.body)}".rstrip()


def _detail(body: bytes) -> str:
    try:
        value = json.loads(body)
    except ValueError:
        return ""
    match value:
        case {"detail": str(detail)}:
            return detail[:_MAX_DETAIL_CHARS]
        case _:
            return ""
