"""Chat adapters that deliver notifications: the log (the default) and a Matrix room.

Each adapter sends `"<person name>: <text>"`, the text the api wrote, and
nothing else: no pastoral data, no contact details.
"""

import json
import logging
from http import HTTPStatus
from typing import Protocol
from urllib.parse import quote

from app import http_client
from app.config import MatrixSettings
from app.records import Notification

_MAX_ERROR_CHARS = 200

logger = logging.getLogger(__name__)


class ChatError(Exception):
    """A notification could not be delivered; it is tried again on the next poll."""


class Adapter(Protocol):
    """Delivers a notification through one channel."""

    def send(self, notification: Notification) -> None:
        """Deliver `notification`.

        Raises:
            ChatError: When it was not delivered.
        """
        ...


def message(notification: Notification) -> str:
    """The text a chat shows for a notification: who it is for, and what it says.

    Args:
        notification: The notification.

    Returns:
        `"<person name>: <text>"`.
    """
    return f"{notification.person_name}: {notification.text}"


class Log:
    """The default adapter: it logs each notification instead of sending it."""

    def send(self, notification: Notification) -> None:
        """Log `notification` at INFO, one line.

        Args:
            notification: The notification.
        """
        logger.info("notification %d: %s", notification.id, message(notification))


class Matrix:
    """Posts notifications to one Matrix room as the church's bot."""

    def __init__(self, settings: MatrixSettings, http: http_client.Client) -> None:
        """Post to `settings.room_id` on `settings.homeserver` through `http`.

        Args:
            settings: The homeserver, the bot's access token and the room.
            http: Sends the requests.
        """
        self._settings = settings
        self._http = http

    def send(self, notification: Notification) -> None:
        """Post `notification` to the room as an `m.room.message`.

        The notification's id is the transaction id, so the homeserver posts a
        retried notification once, even when marking it sent failed after it
        was delivered.

        Args:
            notification: The notification.

        Raises:
            ChatError: When the homeserver cannot be reached or refuses it.
        """
        room = quote(self._settings.room_id, safe="")
        transaction = f"church-ops-notification-{notification.id}"
        url = (
            f"{self._settings.homeserver}/_matrix/client/v3/rooms/{room}"
            f"/send/m.room.message/{transaction}"
        )
        body = json.dumps({"msgtype": "m.text", "body": message(notification)}).encode()
        headers = {
            "Authorization": f"Bearer {self._settings.access_token}",
            "Content-Type": "application/json",
        }
        try:
            response = self._http.request("PUT", url, body=body, headers=headers)
        except http_client.TransportError as err:
            msg = f"could not reach Matrix for notification {notification.id}: {err}"
            raise ChatError(msg) from err
        if not HTTPStatus.OK <= response.status < HTTPStatus.MULTIPLE_CHOICES:
            msg = f"Matrix refused notification {notification.id}: {response.status}"
            msg = f"{msg} {_matrix_error(response.body)}".rstrip()
            raise ChatError(msg)


def _matrix_error(body: bytes) -> str:
    try:
        value = json.loads(body)
    except ValueError:
        return ""
    match value:
        case {"errcode": str(code), **rest}:
            error = rest.get("error")
            detail = f"{code} {error}" if isinstance(error, str) else code
            return detail[:_MAX_ERROR_CHARS]
        case _:
            return ""
