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

    def add_member(self, membership: records.Membership) -> None:
        """Record that a person can fill a position; they must not be a member already."""
        ...

    def delete_member(self, membership: records.Membership) -> bool:
        """Forget that a person can fill a position; False when they could not."""
        ...

    def members(self, position_id: int | None) -> list[records.Membership]:
        """Return who can fill one position, or every position when None, by person id."""
        ...

    def add_song(
        self, title: str, authors: str, ccli: str | None, tags: tuple[str, ...]
    ) -> records.Song:
        """Keep a new song."""
        ...

    def update_song(self, song: records.Song) -> None:
        """Replace a song's title, authors, ccli and tags."""
        ...

    def song_uses(self, query: records.SongUseQuery) -> list[records.SongUse]:
        """Return the song items the query matches, by their service's start, then item id."""
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

    def update_arrangement(self, arrangement: records.Arrangement) -> None:
        """Replace an arrangement's fields."""
        ...

    def arrangements(self, song_id: int | None) -> list[records.Arrangement]:
        """Return the arrangements of one song, or of every song when None, by id."""
        ...

    def add_service_type(self, fields: records.ServiceTypeFields) -> records.ServiceType:
        """Keep a new service type, with an empty template."""
        ...

    def service_type(self, service_type_id: int) -> records.ServiceType | None:
        """Return the service type with this id."""
        ...

    def service_types(self) -> list[records.ServiceType]:
        """Return every service type, by name, then id."""
        ...

    def update_service_type(self, service_type: records.ServiceType) -> None:
        """Replace a service type's fields."""
        ...

    def template(self, service_type_id: int) -> records.Template:
        """Return a service type's template; empty when none was set."""
        ...

    def replace_template(self, service_type_id: int, template: records.Template) -> None:
        """Replace a service type's template with this one."""
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

    def needed(self, service_id: int) -> list[records.Need]:
        """Return the positions a service needs people in, by position id."""
        ...

    def set_need(self, service_id: int, need: records.Need) -> None:
        """Set how many people a service needs in a position; a count of 0 forgets the need."""
        ...

    def add_time(self, service_id: int, fields: records.PlanTimeFields) -> records.PlanTime:
        """Keep a new time of a service."""
        ...

    def times(self, service_id: int) -> list[records.PlanTime]:
        """Return the times kept for a service, by start, then id."""
        ...

    def delete_time(self, service_id: int, time_id: int) -> bool:
        """Forget a time of a service; False when the service has none with this id."""
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
        """Replace a request's status, answered_at and decline_reason."""
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
        """End a service's live mode, forgetting its item starts; False when it was not live."""
        ...

    def add_item_start(self, service_id: int, start: records.ItemStart) -> None:
        """Record that an item of a live service became the current one."""
        ...

    def item_starts(self, service_id: int) -> list[records.ItemStart]:
        """Return the item starts recorded in a service's live mode, in the order recorded."""
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
