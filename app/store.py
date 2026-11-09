"""The store: what the logic needs to keep and find records, and how routes reach it.

Two backends keep the same records: app.memory_store for tests and for running
without a database, app.postgres_store for everything else. Every call happens in
a transaction, read() or write(): writes are serialised, so a check and the change
it guards (no duplicate request, only the controller advances) cannot interleave
with another writer's, and a write that raises leaves the store as it was.
"""

from collections.abc import Mapping, Sequence
from contextlib import AbstractContextManager
from datetime import datetime
from typing import Annotated, Protocol

from fastapi import Depends, Request

from app import records


class Records(Protocol):
    """The records of one transaction.

    A lookup by id returns None when there is no such record. Lists are in the order
    each method names. Writes assume what they name exists: the logic checks first.
    """

    def add_person(self, name: str, email: str | None) -> records.Person:
        """Keep a new person."""
        ...

    def person(self, person_id: int) -> records.Person | None:
        """Return the person with this id."""
        ...

    def people(self) -> list[records.Person]:
        """Return everyone, by name, then id."""
        ...

    def add_team(self, name: str) -> records.Team:
        """Keep a new team."""
        ...

    def team(self, team_id: int) -> records.Team | None:
        """Return the team with this id."""
        ...

    def teams(self) -> list[records.Team]:
        """Return every team, by name, then id."""
        ...

    def add_position(self, team_id: int, name: str) -> records.Position:
        """Keep a new position in a team."""
        ...

    def position(self, position_id: int) -> records.Position | None:
        """Return the position with this id."""
        ...

    def positions(self) -> list[records.Position]:
        """Return the positions of every team, by id."""
        ...

    def add_song(self, title: str, authors: str, ccli: str | None) -> records.Song:
        """Keep a new song."""
        ...

    def song(self, song_id: int) -> records.Song | None:
        """Return the song with this id."""
        ...

    def songs(self) -> list[records.Song]:
        """Return every song, by title, then id."""
        ...

    def add_arrangement(
        self, song_id: int, fields: records.ArrangementFields
    ) -> records.Arrangement:
        """Keep a new arrangement of a song."""
        ...

    def arrangement(self, arrangement_id: int) -> records.Arrangement | None:
        """Return the arrangement with this id."""
        ...

    def arrangements(self, song_id: int | None) -> list[records.Arrangement]:
        """Return the arrangements of one song, or of every song when None, by id."""
        ...

    def add_service(self, fields: records.ServiceFields) -> records.Service:
        """Keep a new service, with no items."""
        ...

    def service(self, service_id: int) -> records.Service | None:
        """Return the service with this id."""
        ...

    def services(self, starting: datetime | None) -> list[records.Service]:
        """Return the services starting at or after starting (all when None), by start, id."""
        ...

    def update_service(self, service: records.Service) -> None:
        """Replace a service's fields."""
        ...

    def add_item(self, service_id: int, position: int, fields: records.ItemFields) -> records.Item:
        """Keep a new item of a service at a position."""
        ...

    def item(self, item_id: int) -> records.Item | None:
        """Return the item with this id."""
        ...

    def items(self, service_id: int) -> list[records.Item]:
        """Return the items of a service, by position."""
        ...

    def item_totals(self, service_ids: Sequence[int]) -> Mapping[int, records.ItemTotals]:
        """Return the totals of the services named that have items; others are left out."""
        ...

    def update_item(self, item: records.Item) -> None:
        """Replace an item's position and fields."""
        ...

    def delete_item(self, item_id: int) -> None:
        """Forget an item; the positions of the others are the caller's to close up."""
        ...

    def add_request(self, draft: records.RequestDraft) -> records.Request:
        """Keep a new scheduling request, pending."""
        ...

    def request(self, request_id: int) -> records.Request | None:
        """Return the request with this id."""
        ...

    def requests(self, query: records.RequestQuery) -> list[records.Request]:
        """Return the requests the query matches, newest first."""
        ...

    def update_request(self, request: records.Request) -> None:
        """Replace a request's status and answered_at."""
        ...

    def add_blockout(self, draft: records.BlockoutDraft) -> records.Blockout:
        """Keep a new blockout."""
        ...

    def blockouts(self, person_id: int) -> list[records.Blockout]:
        """Return a person's blockouts, by start date, then id."""
        ...

    def delete_blockout(self, blockout_id: int) -> bool:
        """Forget a blockout; False when there was none with this id."""
        ...

    def add_notification(self, draft: records.NotificationDraft) -> records.Notification:
        """Put a new notification in the outbox."""
        ...

    def notification(self, notification_id: int) -> records.Notification | None:
        """Return the notification with this id."""
        ...

    def due_notifications(self, now: datetime, limit: int) -> list[records.Notification]:
        """Return at most limit unsent notifications due at or before now, oldest first."""
        ...

    def mark_sent(self, notification_id: int, sent_at: datetime) -> None:
        """Record that a notification was sent."""
        ...

    def delete_unsent(self, request_id: int, kind: records.NotificationKind) -> None:
        """Drop a request's notifications of one kind that have not been sent."""
        ...

    def add_live(self, live: records.Live) -> None:
        """Keep a service's live state; the service must not be live already."""
        ...

    def live(self, service_id: int) -> records.Live | None:
        """Return a service's live state; None when it is not live."""
        ...

    def lives(self) -> list[records.Live]:
        """Return the live state of every live service, by service id."""
        ...

    def update_live(self, live: records.Live) -> None:
        """Replace a live service's state."""
        ...

    def delete_live(self, service_id: int) -> bool:
        """End a service's live mode; False when it was not live."""
        ...


class Store(Protocol):
    """Hands out transactions over the records.

    Both commit when the block ends and roll back when it raises.
    """

    def read(self) -> AbstractContextManager[Records]:
        """Open a transaction that only reads, and sees one consistent state."""
        ...

    def write(self) -> AbstractContextManager[Records]:
        """Open a transaction that may write, serialised with every other write."""
        ...


def get_store(request: Request) -> Store:
    """Return the store the app's lifespan opened."""
    store: Store = request.app.state.store
    return store


# A path operation's parameter for the store, which tests override through get_store.
Injected = Annotated[Store, Depends(get_store)]
