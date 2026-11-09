"""A store that keeps its records in Postgres, through the app's connection pool.

create_schema() makes the tables and columns that are missing and leaves the ones
there alone, so every start-up runs it, and a database made by an earlier version
is brought up to this one with its records kept. A column added since v0.1 has a
default that gives the old rows what v0.1 meant. Each transaction borrows one pooled
connection; a write first takes a transaction-scoped advisory lock, so writes run
one at a time, and a read runs at REPEATABLE READ, so it sees one state throughout.
"""

from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from datetime import datetime
from typing import LiteralString

import psycopg
from psycopg.rows import DictRow, TupleRow, dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app import records

# The advisory lock keys this module takes: one for the schema, one for writes.
_SCHEMA_LOCK = 7_126_301
_WRITE_LOCK = 7_126_302

_SCHEMA: tuple[LiteralString, ...] = (
    """CREATE TABLE IF NOT EXISTS people (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name text NOT NULL,
        email text
    )""",
    """CREATE TABLE IF NOT EXISTS teams (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name text NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS positions (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        team_id bigint NOT NULL REFERENCES teams (id),
        name text NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS songs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        title text NOT NULL,
        authors text NOT NULL,
        ccli text
    )""",
    """CREATE TABLE IF NOT EXISTS arrangements (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        song_id bigint NOT NULL REFERENCES songs (id),
        name text NOT NULL,
        key text NOT NULL,
        tempo_bpm integer NOT NULL,
        meter text NOT NULL,
        length_seconds integer NOT NULL,
        sequence text NOT NULL,
        chart text NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS services (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        title text NOT NULL,
        service_type text NOT NULL,
        starts_at timestamptz NOT NULL,
        streamed boolean NOT NULL,
        auto_switch boolean NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS items (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id bigint NOT NULL REFERENCES services (id),
        position integer NOT NULL,
        kind text NOT NULL,
        title text NOT NULL,
        length_seconds integer NOT NULL,
        arrangement_id bigint REFERENCES arrangements (id),
        key text,
        scene text,
        lower_third text,
        off_stream boolean NOT NULL,
        notes text NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS items_by_service ON items (service_id, position)",
    """CREATE TABLE IF NOT EXISTS requests (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id bigint NOT NULL REFERENCES services (id),
        position_id bigint NOT NULL REFERENCES positions (id),
        person_id bigint NOT NULL REFERENCES people (id),
        status text NOT NULL,
        blocked boolean NOT NULL,
        created_at timestamptz NOT NULL,
        answered_at timestamptz
    )""",
    # At most one open request per person, service and position.
    """CREATE UNIQUE INDEX IF NOT EXISTS requests_open
        ON requests (service_id, position_id, person_id)
        WHERE status IN ('pending', 'accepted')""",
    """CREATE TABLE IF NOT EXISTS blockouts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        person_id bigint NOT NULL REFERENCES people (id),
        starts_on date NOT NULL,
        ends_on date NOT NULL,
        reason text NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS notifications (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        person_id bigint NOT NULL REFERENCES people (id),
        request_id bigint REFERENCES requests (id),
        kind text NOT NULL,
        text text NOT NULL,
        due_at timestamptz NOT NULL,
        sent_at timestamptz
    )""",
    """CREATE INDEX IF NOT EXISTS notifications_due ON notifications (due_at, id)
        WHERE sent_at IS NULL""",
    """CREATE TABLE IF NOT EXISTS live (
        service_id bigint PRIMARY KEY REFERENCES services (id),
        controller_id bigint NOT NULL REFERENCES people (id),
        current_index integer NOT NULL,
        version integer NOT NULL,
        obs text NOT NULL,
        ableton text NOT NULL,
        devices_updated_at timestamptz
    )""",
    # v0.2: who can play what, and what a service needs.
    """CREATE TABLE IF NOT EXISTS position_members (
        position_id bigint NOT NULL REFERENCES positions (id),
        person_id bigint NOT NULL REFERENCES people (id),
        PRIMARY KEY (position_id, person_id)
    )""",
    """CREATE TABLE IF NOT EXISTS service_needs (
        service_id bigint NOT NULL REFERENCES services (id),
        position_id bigint NOT NULL REFERENCES positions (id),
        count integer NOT NULL CHECK (count > 0),
        PRIMARY KEY (service_id, position_id)
    )""",
    "ALTER TABLE requests ADD COLUMN IF NOT EXISTS decline_reason text NOT NULL DEFAULT ''",
    "ALTER TABLE requests ADD COLUMN IF NOT EXISTS scheduler_id bigint REFERENCES people (id)",
    # v0.2: service types, their templates, and a service's times.
    """CREATE TABLE IF NOT EXISTS service_types (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name text NOT NULL,
        start_time time NOT NULL,
        rehearsal_offset_minutes integer
    )""",
    """CREATE TABLE IF NOT EXISTS template_items (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_type_id bigint NOT NULL REFERENCES service_types (id),
        position integer NOT NULL,
        kind text NOT NULL,
        title text NOT NULL,
        length_seconds integer NOT NULL,
        arrangement_id bigint REFERENCES arrangements (id),
        key text,
        scene text,
        lower_third text,
        off_stream boolean NOT NULL,
        notes text NOT NULL,
        song_leader_id bigint REFERENCES people (id),
        team_notes jsonb NOT NULL DEFAULT '[]'
    )""",
    """CREATE TABLE IF NOT EXISTS template_needs (
        service_type_id bigint NOT NULL REFERENCES service_types (id),
        position_id bigint NOT NULL REFERENCES positions (id),
        count integer NOT NULL CHECK (count > 0),
        PRIMARY KEY (service_type_id, position_id)
    )""",
    """ALTER TABLE services
        ADD COLUMN IF NOT EXISTS service_type_id bigint REFERENCES service_types (id)""",
    "ALTER TABLE services ADD COLUMN IF NOT EXISTS series text NOT NULL DEFAULT ''",
    """CREATE TABLE IF NOT EXISTS plan_times (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id bigint NOT NULL REFERENCES services (id),
        kind text NOT NULL,
        name text NOT NULL,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL
    )""",
    # v0.2: songs as musicians use them, and items for the team.
    "ALTER TABLE songs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE arrangements ADD COLUMN IF NOT EXISTS keys text[] NOT NULL DEFAULT '{}'",
    "ALTER TABLE arrangements ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT ''",
    "ALTER TABLE arrangements ADD COLUMN IF NOT EXISTS audio_url text",
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS song_leader_id bigint REFERENCES people (id)",
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS team_notes jsonb NOT NULL DEFAULT '[]'",
    # v0.2: live timers. An item start keeps its item's id, even once the item is deleted.
    "ALTER TABLE live ADD COLUMN IF NOT EXISTS item_started_at timestamptz",
    """CREATE TABLE IF NOT EXISTS live_item_starts (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        service_id bigint NOT NULL REFERENCES services (id),
        item_id bigint NOT NULL,
        started_at timestamptz NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS live_item_starts_by_service ON live_item_starts (service_id, id)",
)


# How long start-up waits for a connection to create the schema on.
SCHEMA_TIMEOUT_SECONDS = 30.0


def _arrangement(row: DictRow) -> records.Arrangement:
    return records.Arrangement(
        id=row["id"],
        song_id=row["song_id"],
        fields=records.ArrangementFields(
            name=row["name"],
            key=row["key"],
            tempo_bpm=row["tempo_bpm"],
            meter=row["meter"],
            length_seconds=row["length_seconds"],
            sequence=row["sequence"],
            chart=row["chart"],
            keys=tuple(row["keys"]),
            notes=row["notes"],
            audio_url=row["audio_url"],
        ),
    )


def _service(row: DictRow) -> records.Service:
    return records.Service(
        id=row["id"],
        fields=records.ServiceFields(
            title=row["title"],
            service_type=row["service_type"],
            starts_at=row["starts_at"],
            streamed=row["streamed"],
            auto_switch=row["auto_switch"],
            service_type_id=row["service_type_id"],
            series=row["series"],
        ),
    )


def _team_notes(value: object) -> tuple[records.TeamNote, ...]:
    """Parse a team_notes column, the JSON array _item_values writes.

    Raises:
        psycopg.DataError: when it holds anything else.
    """
    if not isinstance(value, list):
        msg = f"team_notes holds {value!r}, not a JSON array"
        raise psycopg.DataError(msg)
    notes: list[records.TeamNote] = []
    for entry in value:
        match entry:
            case {"team_id": int() as team_id, "note": str() as note}:
                notes.append(records.TeamNote(team_id=team_id, note=note))
            case _:
                msg = f"team_notes holds {entry!r}, not a team_id and a note"
                raise psycopg.DataError(msg)
    return tuple(notes)


def _item_fields(row: DictRow) -> records.ItemFields:
    return records.ItemFields(
        kind=records.ItemKind(row["kind"]),
        title=row["title"],
        length_seconds=row["length_seconds"],
        arrangement_id=row["arrangement_id"],
        key=row["key"],
        scene=row["scene"],
        lower_third=row["lower_third"],
        off_stream=row["off_stream"],
        notes=row["notes"],
        song_leader_id=row["song_leader_id"],
        team_notes=_team_notes(row["team_notes"]),
    )


def _item(row: DictRow) -> records.Item:
    return records.Item(
        id=row["id"],
        service_id=row["service_id"],
        position=row["position"],
        fields=_item_fields(row),
    )


def _service_type(row: DictRow) -> records.ServiceType:
    return records.ServiceType(
        id=row["id"],
        fields=records.ServiceTypeFields(
            name=row["name"],
            start_time=row["start_time"],
            rehearsal_offset_minutes=row["rehearsal_offset_minutes"],
        ),
    )


def _plan_time(row: DictRow) -> records.PlanTime:
    return records.PlanTime(
        id=row["id"],
        service_id=row["service_id"],
        fields=records.PlanTimeFields(
            kind=records.TimeKind(row["kind"]),
            name=row["name"],
            starts_at=row["starts_at"],
            ends_at=row["ends_at"],
        ),
    )


def _request(row: DictRow) -> records.Request:
    return records.Request(
        id=row["id"],
        service_id=row["service_id"],
        position_id=row["position_id"],
        person_id=row["person_id"],
        status=records.RequestStatus(row["status"]),
        blocked=row["blocked"],
        created_at=row["created_at"],
        answered_at=row["answered_at"],
        decline_reason=row["decline_reason"],
        scheduler_id=row["scheduler_id"],
    )


def _notification(row: DictRow) -> records.Notification:
    return records.Notification(
        id=row["id"],
        person_id=row["person_id"],
        request_id=row["request_id"],
        kind=records.NotificationKind(row["kind"]),
        text=row["text"],
        due_at=row["due_at"],
        sent_at=row["sent_at"],
    )


def _live(row: DictRow) -> records.Live:
    return records.Live(
        service_id=row["service_id"],
        controller_id=row["controller_id"],
        current_index=row["current_index"],
        version=row["version"],
        obs=records.DeviceState(row["obs"]),
        ableton=records.DeviceState(row["ableton"]),
        devices_updated_at=row["devices_updated_at"],
        item_started_at=row["item_started_at"],
    )


def _person(row: DictRow) -> records.Person:
    return records.Person(id=row["id"], name=row["name"], email=row["email"])


def _team(row: DictRow) -> records.Team:
    return records.Team(id=row["id"], name=row["name"])


def _position(row: DictRow) -> records.Position:
    return records.Position(id=row["id"], team_id=row["team_id"], name=row["name"])


def _song(row: DictRow) -> records.Song:
    return records.Song(
        id=row["id"],
        title=row["title"],
        authors=row["authors"],
        ccli=row["ccli"],
        tags=tuple(row["tags"]),
    )


def _blockout(row: DictRow) -> records.Blockout:
    return records.Blockout(
        id=row["id"],
        person_id=row["person_id"],
        starts_on=row["starts_on"],
        ends_on=row["ends_on"],
        reason=row["reason"],
    )


class PostgresRecords:
    """The records of one transaction on a PostgresStore; see store.Records."""

    def __init__(self, conn: psycopg.Connection[TupleRow]) -> None:
        """Work in the transaction open on conn."""
        self._conn = conn

    def _one(
        self, query: LiteralString, params: Sequence[object] | Mapping[str, object]
    ) -> DictRow | None:
        with self._conn.cursor(row_factory=dict_row) as cursor:
            return cursor.execute(query, params).fetchone()

    def _created(self, query: LiteralString, params: Sequence[object]) -> DictRow:
        row = self._one(query, params)
        if row is None:
            msg = f"{query.split(maxsplit=3)[2]}: INSERT ... RETURNING returned no row"
            raise psycopg.DataError(msg)
        return row

    def _all(
        self, query: LiteralString, params: Sequence[object] | Mapping[str, object] = ()
    ) -> list[DictRow]:
        with self._conn.cursor(row_factory=dict_row) as cursor:
            return cursor.execute(query, params).fetchall()

    def _count(self, query: LiteralString, params: Sequence[object]) -> int:
        with self._conn.cursor() as cursor:
            return cursor.execute(query, params).rowcount

    def add_person(self, name: str, email: str | None) -> records.Person:
        """Keep a new person."""
        return _person(
            self._created(
                "INSERT INTO people (name, email) VALUES (%s, %s) RETURNING id, name, email",
                (name, email),
            )
        )

    def person(self, person_id: int) -> records.Person | None:
        """Return the person with this id."""
        row = self._one("SELECT id, name, email FROM people WHERE id = %s", (person_id,))
        return None if row is None else _person(row)

    def people(self) -> list[records.Person]:
        """Return everyone, by name, then id."""
        return [
            _person(r) for r in self._all("SELECT id, name, email FROM people ORDER BY name, id")
        ]

    def add_team(self, name: str) -> records.Team:
        """Keep a new team."""
        return _team(
            self._created("INSERT INTO teams (name) VALUES (%s) RETURNING id, name", (name,))
        )

    def team(self, team_id: int) -> records.Team | None:
        """Return the team with this id."""
        row = self._one("SELECT id, name FROM teams WHERE id = %s", (team_id,))
        return None if row is None else _team(row)

    def teams(self) -> list[records.Team]:
        """Return every team, by name, then id."""
        return [_team(r) for r in self._all("SELECT id, name FROM teams ORDER BY name, id")]

    def add_position(self, team_id: int, name: str) -> records.Position:
        """Keep a new position in a team."""
        return _position(
            self._created(
                "INSERT INTO positions (team_id, name) VALUES (%s, %s) RETURNING id, team_id, name",
                (team_id, name),
            )
        )

    def position(self, position_id: int) -> records.Position | None:
        """Return the position with this id."""
        row = self._one("SELECT id, team_id, name FROM positions WHERE id = %s", (position_id,))
        return None if row is None else _position(row)

    def positions(self) -> list[records.Position]:
        """Return the positions of every team, by id."""
        return [
            _position(r) for r in self._all("SELECT id, team_id, name FROM positions ORDER BY id")
        ]

    def add_member(self, membership: records.Membership) -> None:
        """Record that a person can fill a position; they must not be a member already."""
        self._conn.execute(
            "INSERT INTO position_members (position_id, person_id) VALUES (%s, %s)",
            (membership.position_id, membership.person_id),
        )

    def delete_member(self, membership: records.Membership) -> bool:
        """Forget that a person can fill a position; False when they could not."""
        return (
            self._count(
                "DELETE FROM position_members WHERE position_id = %s AND person_id = %s",
                (membership.position_id, membership.person_id),
            )
            > 0
        )

    def members(self, position_id: int | None) -> list[records.Membership]:
        """Return who can fill one position, or every position when None, by person id."""
        rows = self._all(
            "SELECT position_id, person_id FROM position_members"
            " WHERE %(position)s::bigint IS NULL OR position_id = %(position)s"
            " ORDER BY person_id, position_id",
            {"position": position_id},
        )
        return [records.Membership(r["position_id"], r["person_id"]) for r in rows]

    def add_song(
        self, title: str, authors: str, ccli: str | None, tags: tuple[str, ...]
    ) -> records.Song:
        """Keep a new song."""
        return _song(
            self._created(
                "INSERT INTO songs (title, authors, ccli, tags) VALUES (%s, %s, %s, %s)"
                " RETURNING id, title, authors, ccli, tags",
                (title, authors, ccli, list(tags)),
            )
        )

    def update_song(self, song: records.Song) -> None:
        """Replace a song's title, authors, ccli and tags."""
        self._conn.execute(
            "UPDATE songs SET title = %s, authors = %s, ccli = %s, tags = %s WHERE id = %s",
            (song.title, song.authors, song.ccli, list(song.tags), song.id),
        )

    def song(self, song_id: int) -> records.Song | None:
        """Return the song with this id."""
        row = self._one(
            "SELECT id, title, authors, ccli, tags FROM songs WHERE id = %s", (song_id,)
        )
        return None if row is None else _song(row)

    def songs(self) -> list[records.Song]:
        """Return every song, by title, then id."""
        return [
            _song(r)
            for r in self._all(
                "SELECT id, title, authors, ccli, tags FROM songs ORDER BY title, id"
            )
        ]

    def song_uses(self, query: records.SongUseQuery) -> list[records.SongUse]:
        """Return the song items the query matches, by their service's start, then item id."""
        rows = self._all(
            "SELECT a.song_id, i.id AS item_id, s.id AS service_id, s.starts_at"
            " FROM items i JOIN arrangements a ON a.id = i.arrangement_id"
            " JOIN services s ON s.id = i.service_id"
            " WHERE i.kind = 'song'"
            " AND (%(song)s::bigint IS NULL OR a.song_id = %(song)s)"
            " AND (%(starting)s::timestamptz IS NULL OR s.starts_at >= %(starting)s)"
            " AND (%(before)s::timestamptz IS NULL OR s.starts_at < %(before)s)"
            " ORDER BY s.starts_at, i.id",
            {"song": query.song_id, "starting": query.starting, "before": query.before},
        )
        return [
            records.SongUse(r["song_id"], r["item_id"], r["service_id"], r["starts_at"])
            for r in rows
        ]

    def add_arrangement(
        self, song_id: int, fields: records.ArrangementFields
    ) -> records.Arrangement:
        """Keep a new arrangement of a song."""
        return _arrangement(
            self._created(
                "INSERT INTO arrangements (song_id, name, key, tempo_bpm, meter, length_seconds,"
                " sequence, chart, keys, notes, audio_url)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id, song_id, name, key, tempo_bpm, meter, length_seconds, sequence,"
                " chart, keys, notes, audio_url",
                (song_id, *_arrangement_values(fields)),
            )
        )

    def arrangement(self, arrangement_id: int) -> records.Arrangement | None:
        """Return the arrangement with this id."""
        row = self._one(
            "SELECT id, song_id, name, key, tempo_bpm, meter, length_seconds, sequence, chart,"
            " keys, notes, audio_url FROM arrangements WHERE id = %s",
            (arrangement_id,),
        )
        return None if row is None else _arrangement(row)

    def update_arrangement(self, arrangement: records.Arrangement) -> None:
        """Replace an arrangement's fields."""
        self._conn.execute(
            "UPDATE arrangements SET name = %s, key = %s, tempo_bpm = %s, meter = %s,"
            " length_seconds = %s, sequence = %s, chart = %s, keys = %s, notes = %s,"
            " audio_url = %s WHERE id = %s",
            (*_arrangement_values(arrangement.fields), arrangement.id),
        )

    def arrangements(self, song_id: int | None) -> list[records.Arrangement]:
        """Return the arrangements of one song, or of every song when None, by id."""
        rows = self._all(
            "SELECT id, song_id, name, key, tempo_bpm, meter, length_seconds, sequence, chart,"
            " keys, notes, audio_url FROM arrangements"
            " WHERE %(song)s::bigint IS NULL OR song_id = %(song)s ORDER BY id",
            {"song": song_id},
        )
        return [_arrangement(r) for r in rows]

    def add_service_type(self, fields: records.ServiceTypeFields) -> records.ServiceType:
        """Keep a new service type, with an empty template."""
        return _service_type(
            self._created(
                "INSERT INTO service_types (name, start_time, rehearsal_offset_minutes)"
                " VALUES (%s, %s, %s) RETURNING id, name, start_time, rehearsal_offset_minutes",
                (fields.name, fields.start_time, fields.rehearsal_offset_minutes),
            )
        )

    def service_type(self, service_type_id: int) -> records.ServiceType | None:
        """Return the service type with this id."""
        row = self._one(
            "SELECT id, name, start_time, rehearsal_offset_minutes FROM service_types"
            " WHERE id = %s",
            (service_type_id,),
        )
        return None if row is None else _service_type(row)

    def service_types(self) -> list[records.ServiceType]:
        """Return every service type, by name, then id."""
        rows = self._all(
            "SELECT id, name, start_time, rehearsal_offset_minutes FROM service_types"
            " ORDER BY lower(name), id"
        )
        return [_service_type(r) for r in rows]

    def update_service_type(self, service_type: records.ServiceType) -> None:
        """Replace a service type's fields."""
        fields = service_type.fields
        self._conn.execute(
            "UPDATE service_types SET name = %s, start_time = %s, rehearsal_offset_minutes = %s"
            " WHERE id = %s",
            (fields.name, fields.start_time, fields.rehearsal_offset_minutes, service_type.id),
        )

    def template(self, service_type_id: int) -> records.Template:
        """Return a service type's template; empty when none was set."""
        items = self._all(
            "SELECT kind, title, length_seconds, arrangement_id, key, scene, lower_third,"
            " off_stream, notes, song_leader_id, team_notes FROM template_items"
            " WHERE service_type_id = %s"
            " ORDER BY position, id",
            (service_type_id,),
        )
        needs = self._all(
            "SELECT position_id, count FROM template_needs WHERE service_type_id = %s"
            " ORDER BY position_id",
            (service_type_id,),
        )
        return records.Template(
            items=tuple(_item_fields(r) for r in items),
            needed=tuple(records.Need(r["position_id"], r["count"]) for r in needs),
        )

    def replace_template(self, service_type_id: int, template: records.Template) -> None:
        """Replace a service type's template with this one."""
        self._conn.execute(
            "DELETE FROM template_items WHERE service_type_id = %s", (service_type_id,)
        )
        self._conn.execute(
            "DELETE FROM template_needs WHERE service_type_id = %s", (service_type_id,)
        )
        for position, fields in enumerate(template.items):
            self._conn.execute(
                "INSERT INTO template_items (service_type_id, position, kind, title,"
                " length_seconds, arrangement_id, key, scene, lower_third, off_stream, notes,"
                " song_leader_id, team_notes)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (service_type_id, position, *_item_values(fields)),
            )
        for need in template.needed:
            if need.count:
                self._conn.execute(
                    "INSERT INTO template_needs (service_type_id, position_id, count)"
                    " VALUES (%s, %s, %s)",
                    (service_type_id, need.position_id, need.count),
                )

    def add_service(self, fields: records.ServiceFields) -> records.Service:
        """Keep a new service, with no items."""
        return _service(
            self._created(
                "INSERT INTO services (title, service_type, starts_at, streamed, auto_switch,"
                " service_type_id, series) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id, title, service_type, starts_at, streamed, auto_switch,"
                " service_type_id, series",
                (
                    fields.title,
                    fields.service_type,
                    fields.starts_at,
                    fields.streamed,
                    fields.auto_switch,
                    fields.service_type_id,
                    fields.series,
                ),
            )
        )

    def service(self, service_id: int) -> records.Service | None:
        """Return the service with this id."""
        row = self._one(
            "SELECT id, title, service_type, starts_at, streamed, auto_switch, service_type_id,"
            " series FROM services WHERE id = %s",
            (service_id,),
        )
        return None if row is None else _service(row)

    def services(self, starting: datetime | None) -> list[records.Service]:
        """Return the services starting at or after starting (all when None), by start, id."""
        rows = self._all(
            "SELECT id, title, service_type, starts_at, streamed, auto_switch, service_type_id,"
            " series FROM services"
            " WHERE %(starting)s::timestamptz IS NULL OR starts_at >= %(starting)s"
            " ORDER BY starts_at, id",
            {"starting": starting},
        )
        return [_service(r) for r in rows]

    def update_service(self, service: records.Service) -> None:
        """Replace a service's fields."""
        fields = service.fields
        self._conn.execute(
            "UPDATE services SET title = %s, service_type = %s, starts_at = %s, streamed = %s,"
            " auto_switch = %s, service_type_id = %s, series = %s WHERE id = %s",
            (
                fields.title,
                fields.service_type,
                fields.starts_at,
                fields.streamed,
                fields.auto_switch,
                fields.service_type_id,
                fields.series,
                service.id,
            ),
        )

    def needed(self, service_id: int) -> list[records.Need]:
        """Return the positions a service needs people in, by position id."""
        rows = self._all(
            "SELECT position_id, count FROM service_needs WHERE service_id = %s"
            " ORDER BY position_id",
            (service_id,),
        )
        return [records.Need(r["position_id"], r["count"]) for r in rows]

    def set_need(self, service_id: int, need: records.Need) -> None:
        """Set how many people a service needs in a position; a count of 0 forgets the need."""
        if need.count:
            self._conn.execute(
                "INSERT INTO service_needs (service_id, position_id, count) VALUES (%s, %s, %s)"
                " ON CONFLICT (service_id, position_id) DO UPDATE SET count = EXCLUDED.count",
                (service_id, need.position_id, need.count),
            )
        else:
            self._conn.execute(
                "DELETE FROM service_needs WHERE service_id = %s AND position_id = %s",
                (service_id, need.position_id),
            )

    def add_time(self, service_id: int, fields: records.PlanTimeFields) -> records.PlanTime:
        """Keep a new time of a service."""
        return _plan_time(
            self._created(
                "INSERT INTO plan_times (service_id, kind, name, starts_at, ends_at)"
                " VALUES (%s, %s, %s, %s, %s)"
                " RETURNING id, service_id, kind, name, starts_at, ends_at",
                (service_id, fields.kind.value, fields.name, fields.starts_at, fields.ends_at),
            )
        )

    def times(self, service_id: int) -> list[records.PlanTime]:
        """Return the times kept for a service, by start, then id."""
        rows = self._all(
            "SELECT id, service_id, kind, name, starts_at, ends_at FROM plan_times"
            " WHERE service_id = %s ORDER BY starts_at, id",
            (service_id,),
        )
        return [_plan_time(r) for r in rows]

    def delete_time(self, service_id: int, time_id: int) -> bool:
        """Forget a time of a service; False when the service has none with this id."""
        return (
            self._count(
                "DELETE FROM plan_times WHERE id = %s AND service_id = %s", (time_id, service_id)
            )
            > 0
        )

    def add_item(self, service_id: int, position: int, fields: records.ItemFields) -> records.Item:
        """Keep a new item of a service at a position."""
        return _item(
            self._created(
                "INSERT INTO items (service_id, position, kind, title, length_seconds,"
                " arrangement_id, key, scene, lower_third, off_stream, notes, song_leader_id,"
                " team_notes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id, service_id, position, kind, title, length_seconds, arrangement_id,"
                " key, scene, lower_third, off_stream, notes, song_leader_id, team_notes",
                (service_id, position, *_item_values(fields)),
            )
        )

    def item(self, item_id: int) -> records.Item | None:
        """Return the item with this id."""
        row = self._one(
            "SELECT id, service_id, position, kind, title, length_seconds, arrangement_id, key,"
            " scene, lower_third, off_stream, notes, song_leader_id, team_notes FROM items"
            " WHERE id = %s",
            (item_id,),
        )
        return None if row is None else _item(row)

    def items(self, service_id: int) -> list[records.Item]:
        """Return the items of a service, by position."""
        rows = self._all(
            "SELECT id, service_id, position, kind, title, length_seconds, arrangement_id, key,"
            " scene, lower_third, off_stream, notes, song_leader_id, team_notes FROM items"
            " WHERE service_id = %s ORDER BY position, id",
            (service_id,),
        )
        return [_item(r) for r in rows]

    def item_totals(self, service_ids: Sequence[int]) -> Mapping[int, records.ItemTotals]:
        """Return the totals of the services named that have items; others are left out."""
        rows = self._all(
            "SELECT service_id, count(*) AS count, sum(length_seconds) AS length_seconds"
            " FROM items WHERE service_id = ANY(%s::bigint[]) GROUP BY service_id",
            (list(service_ids),),
        )
        return {
            r["service_id"]: records.ItemTotals(
                count=r["count"], length_seconds=int(r["length_seconds"])
            )
            for r in rows
        }

    def update_item(self, item: records.Item) -> None:
        """Replace an item's position and fields."""
        self._conn.execute(
            "UPDATE items SET position = %s, kind = %s, title = %s, length_seconds = %s,"
            " arrangement_id = %s, key = %s, scene = %s, lower_third = %s, off_stream = %s,"
            " notes = %s, song_leader_id = %s, team_notes = %s WHERE id = %s",
            (item.position, *_item_values(item.fields), item.id),
        )

    def delete_item(self, item_id: int) -> None:
        """Forget an item; the positions of the others are the caller's to close up."""
        self._conn.execute("DELETE FROM items WHERE id = %s", (item_id,))

    def add_request(self, draft: records.RequestDraft) -> records.Request:
        """Keep a new scheduling request, pending."""
        return _request(
            self._created(
                "INSERT INTO requests (service_id, position_id, person_id, status, blocked,"
                " created_at, scheduler_id) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                " RETURNING id, service_id, position_id, person_id, status, blocked, created_at,"
                " answered_at, decline_reason, scheduler_id",
                (
                    draft.service_id,
                    draft.position_id,
                    draft.person_id,
                    records.RequestStatus.PENDING.value,
                    draft.blocked,
                    draft.created_at,
                    draft.scheduler_id,
                ),
            )
        )

    def request(self, request_id: int) -> records.Request | None:
        """Return the request with this id."""
        row = self._one(
            "SELECT id, service_id, position_id, person_id, status, blocked, created_at,"
            " answered_at, decline_reason, scheduler_id FROM requests WHERE id = %s",
            (request_id,),
        )
        return None if row is None else _request(row)

    def requests(self, query: records.RequestQuery) -> list[records.Request]:
        """Return the requests the query matches, newest first."""
        rows = self._all(
            "SELECT id, service_id, position_id, person_id, status, blocked, created_at,"
            " answered_at, decline_reason, scheduler_id FROM requests"
            " WHERE (%(person)s::bigint IS NULL OR person_id = %(person)s)"
            " AND (%(service)s::bigint IS NULL OR service_id = %(service)s)"
            " AND (%(status)s::text IS NULL OR status = %(status)s)"
            " ORDER BY created_at DESC, id DESC",
            {
                "person": query.person_id,
                "service": query.service_id,
                "status": None if query.status is None else query.status.value,
            },
        )
        return [_request(r) for r in rows]

    def update_request(self, request: records.Request) -> None:
        """Replace a request's status, answered_at and decline_reason."""
        self._conn.execute(
            "UPDATE requests SET status = %s, answered_at = %s, decline_reason = %s WHERE id = %s",
            (request.status.value, request.answered_at, request.decline_reason, request.id),
        )

    def add_blockout(self, draft: records.BlockoutDraft) -> records.Blockout:
        """Keep a new blockout."""
        return _blockout(
            self._created(
                "INSERT INTO blockouts (person_id, starts_on, ends_on, reason)"
                " VALUES (%s, %s, %s, %s) RETURNING id, person_id, starts_on, ends_on, reason",
                (draft.person_id, draft.starts_on, draft.ends_on, draft.reason),
            )
        )

    def blockouts(self, person_id: int) -> list[records.Blockout]:
        """Return a person's blockouts, by start date, then id."""
        rows = self._all(
            "SELECT id, person_id, starts_on, ends_on, reason FROM blockouts"
            " WHERE person_id = %s ORDER BY starts_on, id",
            (person_id,),
        )
        return [_blockout(r) for r in rows]

    def delete_blockout(self, blockout_id: int) -> bool:
        """Forget a blockout; False when there was none with this id."""
        return self._count("DELETE FROM blockouts WHERE id = %s", (blockout_id,)) > 0

    def add_notification(self, draft: records.NotificationDraft) -> records.Notification:
        """Put a new notification in the outbox."""
        return _notification(
            self._created(
                "INSERT INTO notifications (person_id, request_id, kind, text, due_at)"
                " VALUES (%s, %s, %s, %s, %s) RETURNING id, person_id, request_id, kind, text, "
                "due_at, sent_at",
                (draft.person_id, draft.request_id, draft.kind.value, draft.text, draft.due_at),
            )
        )

    def notification(self, notification_id: int) -> records.Notification | None:
        """Return the notification with this id."""
        row = self._one(
            "SELECT id, person_id, request_id, kind, text, due_at, sent_at FROM notifications "
            "WHERE id = %s",
            (notification_id,),
        )
        return None if row is None else _notification(row)

    def due_notifications(self, now: datetime, limit: int) -> list[records.Notification]:
        """Return at most limit unsent notifications due at or before now, oldest first."""
        rows = self._all(
            "SELECT id, person_id, request_id, kind, text, due_at, sent_at FROM notifications"
            " WHERE sent_at IS NULL AND due_at <= %s ORDER BY due_at, id LIMIT %s",
            (now, limit),
        )
        return [_notification(r) for r in rows]

    def mark_sent(self, notification_id: int, sent_at: datetime) -> None:
        """Record that a notification was sent."""
        self._conn.execute(
            "UPDATE notifications SET sent_at = %s WHERE id = %s", (sent_at, notification_id)
        )

    def delete_unsent(self, request_id: int, kind: records.NotificationKind) -> None:
        """Drop a request's notifications of one kind that have not been sent."""
        self._conn.execute(
            "DELETE FROM notifications WHERE request_id = %s AND kind = %s AND sent_at IS NULL",
            (request_id, kind.value),
        )

    def add_live(self, live: records.Live) -> None:
        """Keep a service's live state; the service must not be live already."""
        self._conn.execute(
            "INSERT INTO live (service_id, controller_id, current_index, version, obs, ableton,"
            " devices_updated_at, item_started_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            _live_values(live),
        )

    def live(self, service_id: int) -> records.Live | None:
        """Return a service's live state; None when it is not live."""
        row = self._one(
            "SELECT service_id, controller_id, current_index, version, obs, ableton,"
            " devices_updated_at, item_started_at FROM live WHERE service_id = %s",
            (service_id,),
        )
        return None if row is None else _live(row)

    def lives(self) -> list[records.Live]:
        """Return the live state of every live service, by service id."""
        return [
            _live(r)
            for r in self._all(
                "SELECT service_id, controller_id, current_index, version, obs, ableton,"
                " devices_updated_at, item_started_at FROM live ORDER BY service_id"
            )
        ]

    def update_live(self, live: records.Live) -> None:
        """Replace a live service's state."""
        self._conn.execute(
            "UPDATE live SET controller_id = %s, current_index = %s, version = %s, obs = %s,"
            " ableton = %s, devices_updated_at = %s, item_started_at = %s WHERE service_id = %s",
            (*_live_values(live)[1:], live.service_id),
        )

    def delete_live(self, service_id: int) -> bool:
        """End a service's live mode, forgetting its item starts; False when it was not live."""
        self._conn.execute("DELETE FROM live_item_starts WHERE service_id = %s", (service_id,))
        return self._count("DELETE FROM live WHERE service_id = %s", (service_id,)) > 0

    def add_item_start(self, service_id: int, start: records.ItemStart) -> None:
        """Record that an item of a live service became the current one."""
        self._conn.execute(
            "INSERT INTO live_item_starts (service_id, item_id, started_at) VALUES (%s, %s, %s)",
            (service_id, start.item_id, start.started_at),
        )

    def item_starts(self, service_id: int) -> list[records.ItemStart]:
        """Return the item starts recorded in a service's live mode, in the order recorded."""
        rows = self._all(
            "SELECT item_id, started_at FROM live_item_starts WHERE service_id = %s ORDER BY id",
            (service_id,),
        )
        return [records.ItemStart(r["item_id"], r["started_at"]) for r in rows]


def _item_values(fields: records.ItemFields) -> tuple[object, ...]:
    return (
        fields.kind.value,
        fields.title,
        fields.length_seconds,
        fields.arrangement_id,
        fields.key,
        fields.scene,
        fields.lower_third,
        fields.off_stream,
        fields.notes,
        fields.song_leader_id,
        Jsonb([{"team_id": n.team_id, "note": n.note} for n in fields.team_notes]),
    )


def _arrangement_values(fields: records.ArrangementFields) -> tuple[object, ...]:
    return (
        fields.name,
        fields.key,
        fields.tempo_bpm,
        fields.meter,
        fields.length_seconds,
        fields.sequence,
        fields.chart,
        list(fields.keys),
        fields.notes,
        fields.audio_url,
    )


def _live_values(live: records.Live) -> tuple[object, ...]:
    return (
        live.service_id,
        live.controller_id,
        live.current_index,
        live.version,
        live.obs.value,
        live.ableton.value,
        live.devices_updated_at,
        live.item_started_at,
    )


class PostgresStore:
    """A store.Store on a Postgres connection pool, which the caller opens and closes."""

    def __init__(self, pool: ConnectionPool) -> None:
        """Borrow connections from pool."""
        self._pool = pool

    def create_schema(self) -> None:
        """Create the tables and indexes that are missing; those that exist stay as they are.

        Two instances starting at once take turns, under an advisory lock.

        Raises:
            psycopg_pool.PoolTimeout: when no connection comes within SCHEMA_TIMEOUT_SECONDS.
            psycopg.Error: when the database refuses a statement.
        """
        with self._pool.connection(timeout=SCHEMA_TIMEOUT_SECONDS) as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK,))
            for statement in _SCHEMA:
                conn.execute(statement)

    @contextmanager
    def read(self) -> Iterator[PostgresRecords]:
        """Read in one REPEATABLE READ, READ ONLY transaction."""
        with self._pool.connection() as conn:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            yield PostgresRecords(conn)

    @contextmanager
    def write(self) -> Iterator[PostgresRecords]:
        """Write in one transaction, after every write before it has ended."""
        with self._pool.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_WRITE_LOCK,))
            yield PostgresRecords(conn)
