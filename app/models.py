"""The bodies and parameters of the HTTP API: what callers send and what it answers.

Request bodies parse untrusted input once: text is trimmed where a name is meant,
bounded in length and free of NUL characters; times must carry a UTC offset. The
api answers with every time at Amsterdam's offset (app.local_time).
"""

from datetime import date, datetime
from typing import Annotated, Literal, Self

from fastapi import Path
from pydantic import (
    AfterValidator,
    AwareDatetime,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)

from app import records

# Ids are Postgres bigints.
MAX_ID = 2**63 - 1

# The earliest and latest year a service may be planned in, so that the times
# computed from it (reminders a week before, the clock after the last item) exist.
FIRST_YEAR = 1900
LAST_YEAR = 2999


def _without_nul(value: str) -> str:
    """Refuse text with a NUL character, which Postgres cannot store."""
    if "\x00" in value:
        msg = "must not contain a NUL character"
        raise ValueError(msg)
    return value


def _plausible(moment: datetime) -> datetime:
    """Refuse a time outside FIRST_YEAR to LAST_YEAR."""
    if not FIRST_YEAR <= moment.year <= LAST_YEAR:
        msg = f"must be in the years {FIRST_YEAR} to {LAST_YEAR}"
        raise ValueError(msg)
    return moment


def _plausible_date(day: date) -> date:
    """Refuse a date outside FIRST_YEAR to LAST_YEAR."""
    if not FIRST_YEAR <= day.year <= LAST_YEAR:
        msg = f"must be in the years {FIRST_YEAR} to {LAST_YEAR}"
        raise ValueError(msg)
    return day


Id = Annotated[int, Field(ge=1, le=MAX_ID)]
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]
Name = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    AfterValidator(_without_nul),
]
ShortText = Annotated[str, StringConstraints(max_length=500), AfterValidator(_without_nul)]
LongText = Annotated[str, StringConstraints(max_length=100_000), AfterValidator(_without_nul)]
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
    AfterValidator(_without_nul),
]
# A key name: A to G, then an optional sharp or flat, then m for minor.
Key = Annotated[str, StringConstraints(pattern=r"^[A-G][#b]?m?$")]
# A time signature such as 4/4 or 6/8.
Meter = Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]?/(1|2|4|8|16|32)$")]
TempoBpm = Annotated[int, Field(ge=20, le=300)]
# A clock time in Amsterdam, as HH:MM on the 24-hour clock.
ClockTime = Annotated[str, StringConstraints(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]
# How long before a service its rehearsal starts, in minutes: up to two weeks.
OffsetMinutes = Annotated[int, Field(ge=1, le=20_160)]
Series = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=200), AfterValidator(_without_nul)
]
# A length in whole seconds, up to a day.
Seconds = Annotated[int, Field(ge=0, le=86_400)]
Moment = Annotated[AwareDatetime, AfterValidator(_plausible)]
Day = Annotated[date, AfterValidator(_plausible_date)]


def _refuse_nulls(model: BaseModel, names: tuple[str, ...]) -> None:
    """Refuse an explicit null for the fields named, which may be left out but not cleared."""
    for name in names:
        if name in model.model_fields_set and getattr(model, name) is None:
            msg = f"{name} may be left out but not null"
            raise ValueError(msg)


class Person(BaseModel):
    """Anyone the church keeps a record of."""

    id: int
    name: str
    email: str | None


class NewPerson(BaseModel):
    """A person to add; email may be left out."""

    name: Name
    email: Email | None = None


class Position(BaseModel):
    """A place in a team, such as drums or camera 2.

    member_ids are the people who can fill it, by id: the ones a scheduler is offered
    as candidates. It is empty when no one is named yet.
    """

    id: int
    team_id: int
    name: str
    member_ids: list[int]


class NewMember(BaseModel):
    """A person who can fill a position."""

    person_id: Id


class Team(BaseModel):
    """A team that serves, with its positions by id."""

    id: int
    name: str
    positions: list[Position]


class NewTeam(BaseModel):
    """A team to add."""

    name: Name


class NewPosition(BaseModel):
    """A position to add to a team."""

    name: Name


class Arrangement(BaseModel):
    """One way the church plays a song.

    chart is ChordPro text: chords in brackets inline ("[G]Amazing [G7]grace"),
    section labels on their own line ("Verse 1", "Chorus:"), and {c: ...} or
    {comment: ...} lines; clients transpose and render it. keys are the keys the team
    plays it in, the default key first. notes are the band's, empty when none;
    audio_url links to a reference recording, null when there is none.
    """

    id: int
    song_id: int
    name: str
    key: str
    tempo_bpm: int
    meter: str
    length_seconds: int
    sequence: str
    chart: str
    keys: list[str]
    notes: str
    audio_url: str | None


# A link to a recording on the web.
AudioUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=2000, pattern=r"^https?://[^\s]+$"),
]
Keys = Annotated[list[Key], Field(max_length=24)]


class NewArrangement(BaseModel):
    """An arrangement to add to a song; meter is 4/4 unless given.

    keys are the other keys the team plays it in; the default key is always among them.
    """

    name: Name
    key: Key
    tempo_bpm: TempoBpm
    meter: Meter = "4/4"
    length_seconds: Seconds
    sequence: ShortText = ""
    chart: LongText = ""
    keys: Keys = []
    notes: LongText = ""
    audio_url: AudioUrl | None = None


class ArrangementChanges(BaseModel):
    """The fields of an arrangement to change; those left out stay.

    Only audio_url may be null. keys given replace the other keys; a new default key
    left out of them keeps the old default among the keys.
    """

    name: Name | None = None
    key: Key | None = None
    tempo_bpm: TempoBpm | None = None
    meter: Meter | None = None
    length_seconds: Seconds | None = None
    sequence: ShortText | None = None
    chart: LongText | None = None
    keys: Keys | None = None
    notes: LongText | None = None
    audio_url: AudioUrl | None = None

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(
            self,
            (
                "name",
                "key",
                "tempo_bpm",
                "meter",
                "length_seconds",
                "sequence",
                "chart",
                "keys",
                "notes",
            ),
        )
        return self


class Song(BaseModel):
    """A song with its arrangements by id.

    tags are the church's labels for it, empty when none. last_scheduled_on is the
    date in Amsterdam of the latest service it is planned in, past or to come (null
    when never); times_used_12_months counts its song items in services in the 365
    days up to now.
    """

    id: int
    title: str
    authors: str
    ccli: str | None
    arrangements: list[Arrangement]
    tags: list[str]
    last_scheduled_on: date | None
    times_used_12_months: int


Ccli = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]
Tag = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=50),
    AfterValidator(_without_nul),
]
Tags = Annotated[list[Tag], Field(max_length=30)]


class NewSong(BaseModel):
    """A song to add; ccli is its CCLI song number; a tag given twice (in any case) is kept once."""

    title: Name
    authors: ShortText = ""
    ccli: Ccli | None = None
    tags: Tags = []


class SongChanges(BaseModel):
    """The fields of a song to change; those left out stay, and only ccli may be null."""

    title: Name | None = None
    authors: ShortText | None = None
    ccli: Ccli | None = None
    tags: Tags | None = None

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("title", "authors", "tags"))
        return self


class SongUsage(BaseModel):
    """How many song items a song had in the services of a report's range."""

    song_id: int
    title: str
    authors: str
    ccli: str | None
    count: int


class ItemArrangement(BaseModel):
    """The arrangement a song item is played in, in the key the item is played in."""

    id: int
    song_title: str
    name: str
    key: str
    tempo_bpm: int
    meter: str
    sequence: str
    chart: str


class TeamNote(BaseModel):
    """A note on an item for one team, which that team's view shows."""

    team_id: int
    team_name: str
    note: str


class TeamNoteChange(BaseModel):
    """A team's note on an item; an empty note removes the team's note."""

    team_id: Id
    note: Annotated[str, StringConstraints(max_length=10_000), AfterValidator(_without_nul)]


def _one_per_team(notes: list[TeamNoteChange]) -> list[TeamNoteChange]:
    """Refuse a list that names a team more than once."""
    ids = [n.team_id for n in notes]
    if len(set(ids)) != len(ids):
        msg = "team_notes names a team more than once"
        raise ValueError(msg)
    return notes


TeamNoteChanges = Annotated[
    list[TeamNoteChange], Field(max_length=100), AfterValidator(_one_per_team)
]


class Item(BaseModel):
    """One entry of a service's order.

    position is 0-based and contiguous; starts_at is the service's start plus the
    lengths of the items before it. key is the item's own key, None when it plays
    in the arrangement's. song_leader leads a song, null when no one does;
    team_notes are the notes for single teams, by team name.
    """

    id: int
    service_id: int
    position: int
    kind: records.ItemKind
    title: str
    length_seconds: int
    starts_at: datetime
    arrangement: ItemArrangement | None
    key: str | None
    scene: str | None
    lower_third: str | None
    off_stream: bool
    notes: str
    song_leader: Person | None
    team_notes: list[TeamNote]


class NewItem(BaseModel):
    """An item to append to a service; a song names its arrangement_id, nothing else does.

    off_stream left out takes the kind's default (planning.default_off_stream): true for
    a prayer, false for every other kind. It may be left out but not null. Only a song
    has a song_leader_id. A team note that is empty is left out. A song added without
    notes, or without team_notes, copies them from the song's most recent item in an
    earlier service.
    """

    kind: records.ItemKind
    title: Name
    length_seconds: Seconds
    arrangement_id: Id | None = None
    key: Key | None = None
    scene: ShortText | None = None
    lower_third: ShortText | None = None
    off_stream: bool | None = None
    notes: LongText = ""
    song_leader_id: Id | None = None
    team_notes: TeamNoteChanges = []

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("off_stream",))
        return self


class ItemChanges(BaseModel):
    """The fields of an item to change; those left out stay.

    arrangement_id, key, scene, lower_third and song_leader_id may be set to null; the
    others may not. team_notes set the notes of the teams they name (an empty note
    removes one); the other teams' notes stay.
    """

    kind: records.ItemKind | None = None
    title: Name | None = None
    length_seconds: Seconds | None = None
    arrangement_id: Id | None = None
    key: Key | None = None
    scene: ShortText | None = None
    lower_third: ShortText | None = None
    off_stream: bool | None = None
    notes: LongText | None = None
    song_leader_id: Id | None = None
    team_notes: TeamNoteChanges | None = None

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(
            self, ("kind", "title", "length_seconds", "off_stream", "notes", "team_notes")
        )
        return self


class ItemOrder(BaseModel):
    """Every item of a service, by id, in the order they should be in."""

    item_ids: list[Id]


class AlsoAsked(BaseModel):
    """Another open request of the same person at the same service: pending or accepted."""

    position: Position
    team_name: str
    status: records.RequestStatus


class Request(BaseModel):
    """An invitation to a person to fill a position at a service.

    blocked is true when the service's date was in one of the person's blockouts when
    the request was made; answered_at is null until they accept or decline (or the
    time they withdrew, after accepting). decline_reason is what they said when they
    declined or withdrew, empty when they said nothing. also_asked
    lists the person's other pending or accepted requests at the same service, newest
    first, as they are when the request is read, so a planner sees that the person is
    already asked or serving there; it is empty when there are none, and never holds
    the request itself.
    """

    id: int
    service_id: int
    service_title: str
    service_starts_at: datetime
    position: Position
    team_name: str
    person: Person
    status: records.RequestStatus
    blocked: bool
    created_at: datetime
    answered_at: datetime | None
    also_asked: list[AlsoAsked]
    decline_reason: str


class NewRequest(BaseModel):
    """Who to ask to fill which position, and who asks.

    scheduler_id is the person sending the request, told when it is withdrawn; left
    out, no one is on record and a withdrawal tells no one (the plan shows it).
    """

    position_id: Id
    person_id: Id
    scheduler_id: Id | None = None


Reason = Annotated[
    str, StringConstraints(strip_whitespace=True, max_length=500), AfterValidator(_without_nul)
]


class Answer(BaseModel):
    """A person's answer to a request; a decline may say why, in at most 500 characters."""

    accept: bool
    reason: Reason | None = None

    @model_validator(mode="after")
    def _reason_only_to_decline(self) -> Self:
        if self.accept and self.reason is not None:
            msg = "reason goes with a decline (accept false) only"
            raise ValueError(msg)
        return self


class Withdrawal(BaseModel):
    """Why a person who accepted can no longer serve; at most 500 characters, may be left out."""

    reason: Reason = ""


class Need(BaseModel):
    """How many people a service needs in a position, and how the requests for it stand.

    accepted, pending and declined count the requests for the position at the service
    (a withdrawn one is declined; a cancelled one is not counted). open is how many
    more to ask: count less the accepted and pending ones, never below 0.
    """

    position: Position
    team_name: str
    count: int
    accepted: int
    pending: int
    declined: int
    open: int


NeedCount = Annotated[int, Field(ge=0, le=100)]


class NeededPosition(BaseModel):
    """How many people a position needs; 0 forgets the need."""

    position_id: Id
    count: NeedCount


def _once_each(needed: list[NeededPosition]) -> list[NeededPosition]:
    """Refuse a list that names a position more than once."""
    ids = [n.position_id for n in needed]
    if len(set(ids)) != len(ids):
        msg = "needed names a position more than once"
        raise ValueError(msg)
    return needed


class NeededChanges(BaseModel):
    """The needs of a service to set; the positions left out keep theirs."""

    needed: Annotated[list[NeededPosition], AfterValidator(_once_each)]


class Conflict(BaseModel):
    """A pending or accepted request of a candidate at another service on the same day."""

    service_id: int
    service_title: str
    starts_at: datetime
    team_name: str
    position_name: str
    status: records.RequestStatus


class Candidate(BaseModel):
    """A member of a position, with what a scheduler should know before asking them.

    blocked is true when the service's date is in one of their blockouts. The reason
    they gave stays theirs: a scheduler sees only that they are unavailable
    (people-and-teams: the owner's choice for church-ops). also_asked lists their
    open requests at this service,
    conflicts their open requests at other services on the same date in Amsterdam,
    and declined_here says they declined a request at this service. last_served_on is
    the date of the latest earlier service they accepted a request at (null when
    none); times_served_90_days counts the earlier services they accepted one at in
    the 90 days before this one. None of these refuse a request: the scheduler decides.
    """

    person: Person
    blocked: bool
    also_asked: list[AlsoAsked]
    conflicts: list[Conflict]
    declined_here: bool
    last_served_on: date | None
    times_served_90_days: int


class PlanTime(BaseModel):
    """A time when a service's teams meet: a rehearsal, or the service itself.

    The service's own time has id 0, runs from the service's starts_at to its ends_at,
    is named for the service and cannot be deleted.
    """

    id: int
    kind: records.TimeKind
    name: str
    starts_at: datetime
    ends_at: datetime


class NewPlanTime(BaseModel):
    """A rehearsal to add to a service's plan; it ends after it starts."""

    kind: Literal[records.TimeKind.REHEARSAL]
    name: Name
    starts_at: Moment
    ends_at: Moment

    @model_validator(mode="after")
    def _in_order(self) -> Self:
        if self.ends_at <= self.starts_at:
            msg = f"ends_at {self.ends_at} is not after starts_at {self.starts_at}"
            raise ValueError(msg)
        return self


class Service(BaseModel):
    """One gathering, with its order, its requests (newest first) and the people it needs.

    ends_at is starts_at plus the lengths of all the items. needed is by team name,
    then position. times are the rehearsals and the service's own time, by start.
    service_type_id is the type it was planned from, null when none; series is empty
    when it belongs to none.
    """

    id: int
    title: str
    service_type: str
    service_type_id: int | None
    series: str
    starts_at: datetime
    streamed: bool
    auto_switch: bool
    items: list[Item]
    ends_at: datetime
    requests: list[Request]
    needed: list[Need]
    times: list[PlanTime]


class ServiceSummary(BaseModel):
    """A service in a list, without its items and requests."""

    id: int
    title: str
    service_type: str
    service_type_id: int | None
    series: str
    starts_at: datetime
    ends_at: datetime
    item_count: int


class NewService(BaseModel):
    """A service to plan; it is streamed unless said otherwise, with automatic switching off.

    Without service_type_id, title, service_type and starts_at are needed. With one,
    the service is a copy of that type's template (its items and needed positions),
    service_type is the type's name, title is the type's name when left out, and
    starts_at may be left out for date: that date at the type's start_time in
    Amsterdam. Give starts_at or date, not both.
    """

    title: Name | None = None
    service_type: Name | None = None
    starts_at: Moment | None = None
    streamed: bool = True
    service_type_id: Id | None = None
    series: Series = ""
    date: Day | None = None

    @model_validator(mode="after")
    def _complete(self) -> Self:
        if self.starts_at is not None and self.date is not None:
            msg = "give starts_at or date, not both"
            raise ValueError(msg)
        if self.service_type_id is None:
            missing = [
                name
                for name in ("title", "service_type", "starts_at")
                if getattr(self, name) is None
            ]
            if missing:
                msg = f"without a service_type_id, {', '.join(missing)} must be given"
                raise ValueError(msg)
            if self.date is not None:
                msg = "date needs a service_type_id, whose start_time it starts at"
                raise ValueError(msg)
        elif self.starts_at is None and self.date is None:
            msg = "give starts_at, or date to start at the service type's start_time"
            raise ValueError(msg)
        return self


class ServiceCopy(BaseModel):
    """When the copy of a service starts, and its title (the original's when left out)."""

    starts_at: Moment
    title: Name | None = None


class ServiceChanges(BaseModel):
    """The fields of a service to change; those left out stay, and none may be null."""

    title: Name | None = None
    starts_at: Moment | None = None
    streamed: bool | None = None
    auto_switch: bool | None = None
    series: Series | None = None

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("title", "starts_at", "streamed", "auto_switch", "series"))
        return self


class TemplateItem(BaseModel):
    """An item of a service type's template: an item's fields, without a place in a service."""

    kind: records.ItemKind
    title: str
    length_seconds: int
    arrangement_id: int | None
    key: str | None
    scene: str | None
    lower_third: str | None
    off_stream: bool
    notes: str
    song_leader: Person | None
    team_notes: list[TeamNote]


class TemplateNeed(BaseModel):
    """How many people a service of the type needs in a position."""

    position_id: int
    count: int


class Template(BaseModel):
    """A service type's default order and needed positions, copied into each new service."""

    items: list[TemplateItem]
    needed: list[TemplateNeed]


class ServiceType(BaseModel):
    """A recurring kind of gathering, with its usual start, rehearsal and template.

    start_time is HH:MM in Amsterdam. rehearsal_offset_minutes is how long before the
    service its rehearsal starts; null when it has none.
    """

    id: int
    name: str
    start_time: str
    rehearsal_offset_minutes: int | None
    template: Template


class NewServiceType(BaseModel):
    """A service type to add; it starts at 10:00 with no rehearsal unless said otherwise."""

    name: Name
    start_time: ClockTime = "10:00"
    rehearsal_offset_minutes: OffsetMinutes | None = None


class ServiceTypeChanges(BaseModel):
    """The fields of a service type to change; only rehearsal_offset_minutes may be null."""

    name: Name | None = None
    start_time: ClockTime | None = None
    rehearsal_offset_minutes: OffsetMinutes | None = None

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("name", "start_time"))
        return self


class TemplateChanges(BaseModel):
    """A service type's whole template: the items in order, and the positions needed.

    The items take an item's fields, as POST /services/{id}/items does; a needed count
    of 0 is left out.
    """

    items: Annotated[list[NewItem], Field(max_length=500)]
    needed: Annotated[list[NeededPosition], AfterValidator(_once_each)]


class TemplateSource(BaseModel):
    """The service whose items and needed positions become a template."""

    service_id: Id


class Blockout(BaseModel):
    """Dates a person cannot serve, starts_on to ends_on inclusive."""

    id: int
    person_id: int
    starts_on: date
    ends_on: date
    reason: str


class NewBlockout(BaseModel):
    """Dates to block out; ends_on may not be before starts_on."""

    starts_on: Day
    ends_on: Day
    reason: ShortText = ""

    @model_validator(mode="after")
    def _in_order(self) -> Self:
        if self.ends_on < self.starts_on:
            msg = f"ends_on {self.ends_on} is before starts_on {self.starts_on}"
            raise ValueError(msg)
        return self


class Devices(BaseModel):
    """What the worker last saw of OBS and Ableton; updated_at is null until it reports."""

    obs: records.DeviceState
    ableton: records.DeviceState
    updated_at: datetime | None


class ItemStart(BaseModel):
    """When an item became the current one in live mode."""

    item_id: int
    started_at: datetime


class LiveState(BaseModel):
    """A service in live mode: the current item, the next one, and who moves them.

    version goes up by one each time the current item changes. current is null when
    current_index is past the last item (one was deleted), next when there is none.
    item_started_at is when the current item became current, so a client counts down
    its length and projects the end of the service; it is null only for a service that
    went live before this was recorded. recorded lists every time an item became
    current, in order, going back included, since live mode started.
    """

    service_id: int
    service_title: str
    auto_switch: bool
    streamed: bool
    current_index: int
    version: int
    controller: Person
    current: Item | None
    next: Item | None
    devices: Devices
    item_started_at: datetime | None
    recorded: list[ItemStart]


class LiveStart(BaseModel):
    """Who holds live control of the service."""

    controller_id: Id


class Advance(BaseModel):
    """Who moves the current item, and to which 0-based position."""

    person_id: Id
    to_index: Annotated[int, Field(ge=0)]


class Handover(BaseModel):
    """Live control passing from its holder to another person."""

    from_person_id: Id
    to_person_id: Id


class DeviceReport(BaseModel):
    """What the worker sees of its devices."""

    obs: records.DeviceState
    ableton: records.DeviceState


class Notification(BaseModel):
    """A message for one person; sent_at is null until the worker has sent it."""

    id: int
    person: Person
    kind: records.NotificationKind
    text: str
    due_at: datetime
    sent_at: datetime | None
