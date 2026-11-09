"""Delivering the due notifications through the chat adapter, and marking them sent."""

import logging
from collections.abc import Callable
from typing import Protocol

from app import chat
from app.api import AlreadySentError
from app.records import Notification

BUDGET_SECONDS = 10.0
"""The longest one round spends delivering; what is left waits for the next poll.

It keeps a round well inside the pod's 30-second grace period when the
homeserver is slow or down."""

logger = logging.getLogger(__name__)


class NotificationsApi(Protocol):
    """What delivering needs of the api."""

    def due_notifications(self) -> list[Notification]:
        """The notifications due and not yet sent, oldest first."""
        ...

    def mark_sent(self, notification_id: int) -> None:
        """Record that a notification was delivered.

        Raises:
            AlreadySentError: When it was already marked sent.
        """
        ...


def deliver_due(api: NotificationsApi, adapter: chat.Adapter, clock: Callable[[], float]) -> None:
    """Deliver each due notification, then mark it sent, until the budget is spent.

    A delivery that fails is logged and left unmarked, so the next poll tries
    it again; the others still go. A notification is marked sent right after
    it is delivered, never before.

    Args:
        api: Gives the due notifications and records them sent.
        adapter: Delivers them.
        clock: A monotonic clock, in seconds, such as `time.monotonic`.

    Raises:
        ApiError: When the api cannot give the due notifications or record one
            sent; the round fails and the next one starts over.
    """
    due = api.due_notifications()
    start = clock()
    for index, notification in enumerate(due):
        if clock() - start >= BUDGET_SECONDS:
            left = len(due) - index
            logger.info(
                "%d due notification%s left for the next poll", left, "" if left == 1 else "s"
            )
            return
        try:
            adapter.send(notification)
        except chat.ChatError as err:
            logger.warning(
                "notification %d not delivered, tried again on the next poll: %s",
                notification.id,
                err,
            )
            continue
        try:
            api.mark_sent(notification.id)
        except AlreadySentError:
            logger.info("notification %d was already marked sent", notification.id)
