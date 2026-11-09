"""What the logic raises when a request can't be done; app.main maps each to a status.

The message says what was wrong, with the ids involved, for the caller to act on.
"""

import enum


class NotFoundError(LookupError):
    """A record the request names does not exist (404)."""


class ConflictError(Exception):
    """The request conflicts with the records as they are (409)."""


class InvalidError(ValueError):
    """The request is well-formed but asks for something that cannot be (422)."""


class Kind(enum.StrEnum):
    """The kinds of record a request can name, as its messages call them."""

    PERSON = "person"
    TEAM = "team"
    POSITION = "position"
    SONG = "song"
    ARRANGEMENT = "arrangement"
    SERVICE = "service"
    SERVICE_TYPE = "service type"
    ITEM = "item"
    REQUEST = "request"
    BLOCKOUT = "blockout"
    NOTIFICATION = "notification"


def not_found(kind: Kind, record_id: int) -> NotFoundError:
    """Return the error for a missing record, such as "service 3 not found"."""
    return NotFoundError(f"{kind} {record_id} not found")
