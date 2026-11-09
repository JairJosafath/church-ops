"""The bodies and parameters of the HTTP API: what callers send and what it answers.

Request bodies parse untrusted input once: text is trimmed where a name is meant,
bounded in length and free of NUL characters; times must carry a UTC offset. The
api answers with every time at Amsterdam's offset (app.local_time).
"""

from datetime import date, datetime
from typing import Annotated, Self

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
    """A place in a team, such as drums or camera 2."""

    id: int
    team_id: int
    name: str


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
    """One way the church plays a song."""

    id: int
    song_id: int
    name: str
    key: str
    tempo_bpm: int
    meter: str
    length_seconds: int
    sequence: str
    chart: str


class NewArrangement(BaseModel):
    """An arrangement to add to a song; meter is 4/4 unless given."""

    name: Name
    key: Key
    tempo_bpm: TempoBpm
    meter: Meter = "4/4"
    length_seconds: Seconds
    sequence: ShortText = ""
    chart: LongText = ""


class Song(BaseModel):
    """A song with its arrangements by id."""

    id: int
    title: str
    authors: str
    ccli: str | None
    arrangements: list[Arrangement]


class NewSong(BaseModel):
    """A song to add; ccli is its CCLI song number."""

    title: Name
    authors: ShortText = ""
    ccli: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None


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


class Item(BaseModel):
    """One entry of a service's order.

    position is 0-based and contiguous; starts_at is the service's start plus the
    lengths of the items before it. key is the item's own key, None when it plays
    in the arrangement's.
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


class NewItem(BaseModel):
    """An item to append to a service; a song names its arrangement_id, nothing else does."""

    kind: records.ItemKind
    title: Name
    length_seconds: Seconds
    arrangement_id: Id | None = None
    key: Key | None = None
    scene: ShortText | None = None
    lower_third: ShortText | None = None
    off_stream: bool = False
    notes: LongText = ""


class ItemChanges(BaseModel):
    """The fields of an item to change; those left out stay.

    arrangement_id, key, scene and lower_third may be set to null; the others may not.
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

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("kind", "title", "length_seconds", "off_stream", "notes"))
        return self


class ItemOrder(BaseModel):
    """Every item of a service, by id, in the order they should be in."""

    item_ids: list[Id]


class Request(BaseModel):
    """An invitation to a person to fill a position at a service.

    blocked is true when the service's date was in one of the person's blockouts when
    the request was made; answered_at is null until they accept or decline.
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


class NewRequest(BaseModel):
    """Who to ask to fill which position."""

    position_id: Id
    person_id: Id


class Answer(BaseModel):
    """A person's answer to a request."""

    accept: bool


class Service(BaseModel):
    """One gathering, with its order and its requests (newest first).

    ends_at is starts_at plus the lengths of all the items.
    """

    id: int
    title: str
    service_type: str
    starts_at: datetime
    streamed: bool
    auto_switch: bool
    items: list[Item]
    ends_at: datetime
    requests: list[Request]


class ServiceSummary(BaseModel):
    """A service in a list, without its items and requests."""

    id: int
    title: str
    service_type: str
    starts_at: datetime
    ends_at: datetime
    item_count: int


class NewService(BaseModel):
    """A service to plan; it is streamed unless said otherwise, with automatic switching off."""

    title: Name
    service_type: Name
    starts_at: Moment
    streamed: bool = True


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

    @model_validator(mode="after")
    def _not_null(self) -> Self:
        _refuse_nulls(self, ("title", "starts_at", "streamed", "auto_switch"))
        return self


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


class LiveState(BaseModel):
    """A service in live mode: the current item, the next one, and who moves them.

    version goes up by one each time the current item changes. current is null when
    current_index is past the last item (one was deleted), next when there is none.
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
