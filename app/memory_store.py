"""A store that keeps its records in memory, for tests and for running without a database.

Everything is lost when the process ends. One lock serialises every transaction; a
write works on a copy of the records and replaces them only when it ends without
raising, so a failed write changes nothing.
"""

import dataclasses
import threading
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime

from app import records


@dataclasses.dataclass(slots=True)
class _Tables:
    """Every record by id, and the last id handed out."""

    last_id: int = 0
    people: dict[int, records.Person] = dataclasses.field(default_factory=dict)
    teams: dict[int, records.Team] = dataclasses.field(default_factory=dict)
    positions: dict[int, records.Position] = dataclasses.field(default_factory=dict)
    members: set[records.Membership] = dataclasses.field(default_factory=set)
    songs: dict[int, records.Song] = dataclasses.field(default_factory=dict)
    arrangements: dict[int, records.Arrangement] = dataclasses.field(default_factory=dict)
    services: dict[int, records.Service] = dataclasses.field(default_factory=dict)
    service_types: dict[int, records.ServiceType] = dataclasses.field(default_factory=dict)
    templates: dict[int, records.Template] = dataclasses.field(default_factory=dict)
    times: dict[int, records.PlanTime] = dataclasses.field(default_factory=dict)
    # The needs of each service, by service id, then position id.
    needs: dict[int, dict[int, records.Need]] = dataclasses.field(default_factory=dict)
    items: dict[int, records.Item] = dataclasses.field(default_factory=dict)
    requests: dict[int, records.Request] = dataclasses.field(default_factory=dict)
    blockouts: dict[int, records.Blockout] = dataclasses.field(default_factory=dict)
    notifications: dict[int, records.Notification] = dataclasses.field(default_factory=dict)
    lives: dict[int, records.Live] = dataclasses.field(default_factory=dict)
    item_starts: dict[int, tuple[records.ItemStart, ...]] = dataclasses.field(default_factory=dict)

    def copy(self) -> "_Tables":
        """Return a copy whose tables can change without changing these; records are shared."""
        return _Tables(
            last_id=self.last_id,
            people=dict(self.people),
            teams=dict(self.teams),
            positions=dict(self.positions),
            members=set(self.members),
            songs=dict(self.songs),
            arrangements=dict(self.arrangements),
            services=dict(self.services),
            service_types=dict(self.service_types),
            templates=dict(self.templates),
            times=dict(self.times),
            needs={service_id: dict(needs) for service_id, needs in self.needs.items()},
            items=dict(self.items),
            requests=dict(self.requests),
            blockouts=dict(self.blockouts),
            notifications=dict(self.notifications),
            lives=dict(self.lives),
            item_starts=dict(self.item_starts),
        )

    def new_id(self) -> int:
        """Hand out the next id."""
        self.last_id += 1
        return self.last_id


class MemoryRecords:
    """The records of one transaction on a MemoryStore; see store.Records."""

    def __init__(self, tables: _Tables) -> None:
        """Work on these tables."""
        self._tables = tables

    def add_person(self, name: str, email: str | None) -> records.Person:
        """Keep a new person."""
        person = records.Person(id=self._tables.new_id(), name=name, email=email)
        self._tables.people[person.id] = person
        return person

    def person(self, person_id: int) -> records.Person | None:
        """Return the person with this id."""
        return self._tables.people.get(person_id)

    def people(self) -> list[records.Person]:
        """Return everyone, by name, then id."""
        return sorted(self._tables.people.values(), key=lambda p: (p.name.casefold(), p.id))

    def add_team(self, name: str) -> records.Team:
        """Keep a new team."""
        team = records.Team(id=self._tables.new_id(), name=name)
        self._tables.teams[team.id] = team
        return team

    def team(self, team_id: int) -> records.Team | None:
        """Return the team with this id."""
        return self._tables.teams.get(team_id)

    def teams(self) -> list[records.Team]:
        """Return every team, by name, then id."""
        return sorted(self._tables.teams.values(), key=lambda t: (t.name.casefold(), t.id))

    def add_position(self, team_id: int, name: str) -> records.Position:
        """Keep a new position in a team."""
        position = records.Position(id=self._tables.new_id(), team_id=team_id, name=name)
        self._tables.positions[position.id] = position
        return position

    def position(self, position_id: int) -> records.Position | None:
        """Return the position with this id."""
        return self._tables.positions.get(position_id)

    def positions(self) -> list[records.Position]:
        """Return the positions of every team, by id."""
        return sorted(self._tables.positions.values(), key=lambda p: p.id)

    def add_member(self, membership: records.Membership) -> None:
        """Record that a person can fill a position; they must not be a member already."""
        self._tables.members.add(membership)

    def delete_member(self, membership: records.Membership) -> bool:
        """Forget that a person can fill a position; False when they could not."""
        if membership not in self._tables.members:
            return False
        self._tables.members.remove(membership)
        return True

    def members(self, position_id: int | None) -> list[records.Membership]:
        """Return who can fill one position, or every position when None, by person id."""
        return sorted(
            (m for m in self._tables.members if position_id in {None, m.position_id}),
            key=lambda m: (m.person_id, m.position_id),
        )

    def add_song(
        self, title: str, authors: str, ccli: str | None, tags: tuple[str, ...]
    ) -> records.Song:
        """Keep a new song."""
        song = records.Song(
            id=self._tables.new_id(), title=title, authors=authors, ccli=ccli, tags=tags
        )
        self._tables.songs[song.id] = song
        return song

    def update_song(self, song: records.Song) -> None:
        """Replace a song's title, authors, ccli and tags."""
        self._tables.songs[song.id] = song

    def song_uses(self, query: records.SongUseQuery) -> list[records.SongUse]:
        """Return the song items the query matches, by their service's start, then item id."""
        uses: list[records.SongUse] = []
        for item in self._tables.items.values():
            arrangement_id = item.fields.arrangement_id
            if item.fields.kind is not records.ItemKind.SONG or arrangement_id is None:
                continue
            song_id = self._tables.arrangements[arrangement_id].song_id
            starts_at = self._tables.services[item.service_id].fields.starts_at
            if (
                query.song_id in {None, song_id}
                and (query.starting is None or starts_at >= query.starting)
                and (query.before is None or starts_at < query.before)
            ):
                uses.append(records.SongUse(song_id, item.id, item.service_id, starts_at))
        return sorted(uses, key=lambda u: (u.starts_at, u.item_id))

    def song(self, song_id: int) -> records.Song | None:
        """Return the song with this id."""
        return self._tables.songs.get(song_id)

    def songs(self) -> list[records.Song]:
        """Return every song, by title, then id."""
        return sorted(self._tables.songs.values(), key=lambda s: (s.title.casefold(), s.id))

    def add_arrangement(
        self, song_id: int, fields: records.ArrangementFields
    ) -> records.Arrangement:
        """Keep a new arrangement of a song."""
        arrangement = records.Arrangement(id=self._tables.new_id(), song_id=song_id, fields=fields)
        self._tables.arrangements[arrangement.id] = arrangement
        return arrangement

    def arrangement(self, arrangement_id: int) -> records.Arrangement | None:
        """Return the arrangement with this id."""
        return self._tables.arrangements.get(arrangement_id)

    def update_arrangement(self, arrangement: records.Arrangement) -> None:
        """Replace an arrangement's fields."""
        self._tables.arrangements[arrangement.id] = arrangement

    def arrangements(self, song_id: int | None) -> list[records.Arrangement]:
        """Return the arrangements of one song, or of every song when None, by id."""
        return sorted(
            (a for a in self._tables.arrangements.values() if song_id in {None, a.song_id}),
            key=lambda a: a.id,
        )

    def add_service_type(self, fields: records.ServiceTypeFields) -> records.ServiceType:
        """Keep a new service type, with an empty template."""
        service_type = records.ServiceType(id=self._tables.new_id(), fields=fields)
        self._tables.service_types[service_type.id] = service_type
        return service_type

    def service_type(self, service_type_id: int) -> records.ServiceType | None:
        """Return the service type with this id."""
        return self._tables.service_types.get(service_type_id)

    def service_types(self) -> list[records.ServiceType]:
        """Return every service type, by name, then id."""
        return sorted(
            self._tables.service_types.values(), key=lambda t: (t.fields.name.casefold(), t.id)
        )

    def update_service_type(self, service_type: records.ServiceType) -> None:
        """Replace a service type's fields."""
        self._tables.service_types[service_type.id] = service_type

    def template(self, service_type_id: int) -> records.Template:
        """Return a service type's template; empty when none was set."""
        return self._tables.templates.get(service_type_id, records.Template(items=(), needed=()))

    def replace_template(self, service_type_id: int, template: records.Template) -> None:
        """Replace a service type's template with this one."""
        needed = tuple(sorted((n for n in template.needed if n.count), key=lambda n: n.position_id))
        self._tables.templates[service_type_id] = records.Template(template.items, needed)

    def add_service(self, fields: records.ServiceFields) -> records.Service:
        """Keep a new service, with no items."""
        service = records.Service(id=self._tables.new_id(), fields=fields)
        self._tables.services[service.id] = service
        return service

    def service(self, service_id: int) -> records.Service | None:
        """Return the service with this id."""
        return self._tables.services.get(service_id)

    def services(self, starting: datetime | None) -> list[records.Service]:
        """Return the services starting at or after starting (all when None), by start, id."""
        return sorted(
            (
                s
                for s in self._tables.services.values()
                if starting is None or s.fields.starts_at >= starting
            ),
            key=lambda s: (s.fields.starts_at, s.id),
        )

    def update_service(self, service: records.Service) -> None:
        """Replace a service's fields."""
        self._tables.services[service.id] = service

    def needed(self, service_id: int) -> list[records.Need]:
        """Return the positions a service needs people in, by position id."""
        needs = self._tables.needs.get(service_id, {})
        return [needs[position_id] for position_id in sorted(needs)]

    def set_need(self, service_id: int, need: records.Need) -> None:
        """Set how many people a service needs in a position; a count of 0 forgets the need."""
        needs = self._tables.needs.setdefault(service_id, {})
        if need.count:
            needs[need.position_id] = need
        else:
            needs.pop(need.position_id, None)

    def add_time(self, service_id: int, fields: records.PlanTimeFields) -> records.PlanTime:
        """Keep a new time of a service."""
        kept = records.PlanTime(id=self._tables.new_id(), service_id=service_id, fields=fields)
        self._tables.times[kept.id] = kept
        return kept

    def times(self, service_id: int) -> list[records.PlanTime]:
        """Return the times kept for a service, by start, then id."""
        return sorted(
            (t for t in self._tables.times.values() if t.service_id == service_id),
            key=lambda t: (t.fields.starts_at, t.id),
        )

    def delete_time(self, service_id: int, time_id: int) -> bool:
        """Forget a time of a service; False when the service has none with this id."""
        kept = self._tables.times.get(time_id)
        if kept is None or kept.service_id != service_id:
            return False
        del self._tables.times[time_id]
        return True

    def add_item(self, service_id: int, position: int, fields: records.ItemFields) -> records.Item:
        """Keep a new item of a service at a position."""
        item = records.Item(
            id=self._tables.new_id(), service_id=service_id, position=position, fields=fields
        )
        self._tables.items[item.id] = item
        return item

    def item(self, item_id: int) -> records.Item | None:
        """Return the item with this id."""
        return self._tables.items.get(item_id)

    def items(self, service_id: int) -> list[records.Item]:
        """Return the items of a service, by position."""
        return sorted(
            (i for i in self._tables.items.values() if i.service_id == service_id),
            key=lambda i: (i.position, i.id),
        )

    def item_totals(self, service_ids: Sequence[int]) -> Mapping[int, records.ItemTotals]:
        """Return the totals of the services named that have items; others are left out."""
        totals: dict[int, records.ItemTotals] = {}
        wanted = set(service_ids)
        for item in self._tables.items.values():
            if item.service_id in wanted:
                total = totals.get(item.service_id, records.ItemTotals(0, 0))
                totals[item.service_id] = records.ItemTotals(
                    count=total.count + 1,
                    length_seconds=total.length_seconds + item.fields.length_seconds,
                )
        return totals

    def update_item(self, item: records.Item) -> None:
        """Replace an item's position and fields."""
        self._tables.items[item.id] = item

    def delete_item(self, item_id: int) -> None:
        """Forget an item; the positions of the others are the caller's to close up."""
        self._tables.items.pop(item_id, None)

    def add_request(self, draft: records.RequestDraft) -> records.Request:
        """Keep a new scheduling request, pending."""
        request = records.Request(
            id=self._tables.new_id(),
            service_id=draft.service_id,
            position_id=draft.position_id,
            person_id=draft.person_id,
            status=records.RequestStatus.PENDING,
            blocked=draft.blocked,
            created_at=draft.created_at,
            answered_at=None,
            decline_reason="",
            scheduler_id=draft.scheduler_id,
        )
        self._tables.requests[request.id] = request
        return request

    def request(self, request_id: int) -> records.Request | None:
        """Return the request with this id."""
        return self._tables.requests.get(request_id)

    def requests(self, query: records.RequestQuery) -> list[records.Request]:
        """Return the requests the query matches, newest first."""
        return sorted(
            (r for r in self._tables.requests.values() if _matches(query, r)),
            key=lambda r: (r.created_at, r.id),
            reverse=True,
        )

    def update_request(self, request: records.Request) -> None:
        """Replace a request's status, answered_at and decline_reason."""
        self._tables.requests[request.id] = request

    def add_blockout(self, draft: records.BlockoutDraft) -> records.Blockout:
        """Keep a new blockout."""
        blockout = records.Blockout(
            id=self._tables.new_id(),
            person_id=draft.person_id,
            starts_on=draft.starts_on,
            ends_on=draft.ends_on,
            reason=draft.reason,
        )
        self._tables.blockouts[blockout.id] = blockout
        return blockout

    def blockouts(self, person_id: int) -> list[records.Blockout]:
        """Return a person's blockouts, by start date, then id."""
        return sorted(
            (b for b in self._tables.blockouts.values() if b.person_id == person_id),
            key=lambda b: (b.starts_on, b.id),
        )

    def delete_blockout(self, blockout_id: int) -> bool:
        """Forget a blockout; False when there was none with this id."""
        return self._tables.blockouts.pop(blockout_id, None) is not None

    def add_notification(self, draft: records.NotificationDraft) -> records.Notification:
        """Put a new notification in the outbox."""
        notification = records.Notification(
            id=self._tables.new_id(),
            person_id=draft.person_id,
            request_id=draft.request_id,
            kind=draft.kind,
            text=draft.text,
            due_at=draft.due_at,
            sent_at=None,
        )
        self._tables.notifications[notification.id] = notification
        return notification

    def notification(self, notification_id: int) -> records.Notification | None:
        """Return the notification with this id."""
        return self._tables.notifications.get(notification_id)

    def due_notifications(self, now: datetime, limit: int) -> list[records.Notification]:
        """Return at most limit unsent notifications due at or before now, oldest first."""
        due = sorted(
            (
                n
                for n in self._tables.notifications.values()
                if n.sent_at is None and n.due_at <= now
            ),
            key=lambda n: (n.due_at, n.id),
        )
        return due[:limit]

    def mark_sent(self, notification_id: int, sent_at: datetime) -> None:
        """Record that a notification was sent."""
        notification = self._tables.notifications[notification_id]
        self._tables.notifications[notification_id] = dataclasses.replace(
            notification, sent_at=sent_at
        )

    def delete_unsent(self, request_id: int, kind: records.NotificationKind) -> None:
        """Drop a request's notifications of one kind that have not been sent."""
        for notification in list(self._tables.notifications.values()):
            if (
                notification.request_id == request_id
                and notification.kind == kind
                and notification.sent_at is None
            ):
                del self._tables.notifications[notification.id]

    def add_live(self, live: records.Live) -> None:
        """Keep a service's live state; the service must not be live already."""
        self._tables.lives[live.service_id] = live

    def live(self, service_id: int) -> records.Live | None:
        """Return a service's live state; None when it is not live."""
        return self._tables.lives.get(service_id)

    def lives(self) -> list[records.Live]:
        """Return the live state of every live service, by service id."""
        return sorted(self._tables.lives.values(), key=lambda live: live.service_id)

    def update_live(self, live: records.Live) -> None:
        """Replace a live service's state."""
        self._tables.lives[live.service_id] = live

    def delete_live(self, service_id: int) -> bool:
        """End a service's live mode, forgetting its item starts; False when it was not live."""
        self._tables.item_starts.pop(service_id, None)
        return self._tables.lives.pop(service_id, None) is not None

    def add_item_start(self, service_id: int, start: records.ItemStart) -> None:
        """Record that an item of a live service became the current one."""
        self._tables.item_starts[service_id] = (
            *self._tables.item_starts.get(service_id, ()),
            start,
        )

    def item_starts(self, service_id: int) -> list[records.ItemStart]:
        """Return the item starts recorded in a service's live mode, in the order recorded."""
        return list(self._tables.item_starts.get(service_id, ()))


def _matches(query: records.RequestQuery, request: records.Request) -> bool:
    return (
        query.person_id in {None, request.person_id}
        and query.service_id in {None, request.service_id}
        and query.status in {None, request.status}
    )


class MemoryStore:
    """A store.Store that keeps its records in this process's memory."""

    def __init__(self) -> None:
        """Start with no records."""
        self._tables = _Tables()
        self._lock = threading.Lock()

    @contextmanager
    def read(self) -> Iterator[MemoryRecords]:
        """Read the records while no write runs."""
        with self._lock:
            yield MemoryRecords(self._tables)

    @contextmanager
    def write(self) -> Iterator[MemoryRecords]:
        """Change a copy of the records, and keep it only when the block ends without raising."""
        with self._lock:
            working = self._tables.copy()
            yield MemoryRecords(working)
            self._tables = working
