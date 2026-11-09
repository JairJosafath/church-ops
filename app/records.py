"""The records the store keeps: people, teams, songs, services and what hangs off them.

Records are immutable; a change is a new record handed back to the store. Ids are
assigned by the store and are positive integers. Times are timezone-aware.
"""

import enum
from dataclasses import dataclass
from datetime import date, datetime


class ItemKind(enum.StrEnum):
    """What an item of a service is; a header groups items and takes no time."""

    SONG = "song"
    READING = "reading"
    SERMON = "sermon"
    PRAYER = "prayer"
    VIDEO = "video"
    ANNOUNCEMENT = "announcement"
    HEADER = "header"


class RequestStatus(enum.StrEnum):
    """Where a scheduling request stands; only an accepted one schedules the person."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    CANCELLED = "cancelled"


# The statuses of a request still open: the person is asked (pending) or scheduled
# (accepted). A declined or cancelled request asks nothing any more.
OPEN_REQUEST_STATUSES = frozenset({RequestStatus.PENDING, RequestStatus.ACCEPTED})


class NotificationKind(enum.StrEnum):
    """Why a notification is sent."""

    REQUEST = "request"
    REMINDER = "reminder"
    CANCELLATION = "cancellation"
    CHANGE = "change"


class DeviceState(enum.StrEnum):
    """What the worker last saw of a device it drives in live mode."""

    OK = "ok"
    UNREACHABLE = "unreachable"
    UNCONFIGURED = "unconfigured"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class Person:
    """Anyone the church keeps a record of; email is None when unknown."""

    id: int
    name: str
    email: str | None


@dataclass(frozen=True, slots=True)
class Team:
    """A group that serves, such as the worship band or the stream team."""

    id: int
    name: str


@dataclass(frozen=True, slots=True)
class Position:
    """A place in a team that one person fills at a service, such as drums."""

    id: int
    team_id: int
    name: str


@dataclass(frozen=True, slots=True)
class Song:
    """A work; ccli is its CCLI song number, None when it has none."""

    id: int
    title: str
    authors: str
    ccli: str | None


@dataclass(frozen=True, slots=True)
class ArrangementFields:
    """How this church plays a song.

    Attributes:
        name: what the church calls the arrangement, such as "Acoustic".
        key: the default key, such as "G", "Bb" or "F#m".
        tempo_bpm: beats per minute.
        meter: the time signature, such as "4/4".
        length_seconds: how long it usually takes.
        sequence: the sections in order, such as "V1 C V2 C B C"; may be empty.
        chart: the chords over the lyrics, as text; may be empty.
    """

    name: str
    key: str
    tempo_bpm: int
    meter: str
    length_seconds: int
    sequence: str
    chart: str


@dataclass(frozen=True, slots=True)
class Arrangement:
    """One arrangement of a song."""

    id: int
    song_id: int
    fields: ArrangementFields


@dataclass(frozen=True, slots=True)
class ServiceFields:
    """What a planner sets on a service.

    Attributes:
        title: the service's name, such as "Sunday morning".
        service_type: the kind of gathering it is, such as "Sunday morning".
        starts_at: when the service itself starts.
        streamed: whether the service goes out on the stream.
        auto_switch: whether the worker takes the current item's scene to program
            on an advance (True) or only sets preview (False).
    """

    title: str
    service_type: str
    starts_at: datetime
    streamed: bool
    auto_switch: bool


@dataclass(frozen=True, slots=True)
class Service:
    """One gathering: a plan on a date."""

    id: int
    fields: ServiceFields


@dataclass(frozen=True, slots=True)
class ItemFields:
    """What a planner sets on an item of a service.

    Attributes:
        kind: what the item is.
        title: what the order shows.
        length_seconds: its planned length; 0 for a header.
        arrangement_id: the arrangement a song is played in; None for any other kind.
        key: the key this item is played in; None means the arrangement's.
        scene: the OBS scene for the item; None when it has none.
        lower_third: the caption for the stream; None when it has none.
        off_stream: whether the stream shows the holding scene during the item.
        notes: the notes for the teams; may be empty.
    """

    kind: ItemKind
    title: str
    length_seconds: int
    arrangement_id: int | None
    key: str | None
    scene: str | None
    lower_third: str | None
    off_stream: bool
    notes: str


@dataclass(frozen=True, slots=True)
class Item:
    """One entry of a service's order, at a 0-based position."""

    id: int
    service_id: int
    position: int
    fields: ItemFields


@dataclass(frozen=True, slots=True)
class ItemTotals:
    """How many items a service has and how long they take, in seconds."""

    count: int
    length_seconds: int


@dataclass(frozen=True, slots=True)
class RequestDraft:
    """A scheduling request before the store gives it an id; it starts pending."""

    service_id: int
    position_id: int
    person_id: int
    blocked: bool
    created_at: datetime


@dataclass(frozen=True, slots=True)
class Request:
    """An invitation to a person to fill a position at a service.

    Attributes:
        blocked: whether the service's date fell in one of the person's blockouts
            when the request was made.
        answered_at: when the person accepted or declined; None while pending.
    """

    id: int
    service_id: int
    position_id: int
    person_id: int
    status: RequestStatus
    blocked: bool
    created_at: datetime
    answered_at: datetime | None


@dataclass(frozen=True, slots=True)
class RequestQuery:
    """Which requests to list; a None field matches every request."""

    person_id: int | None = None
    service_id: int | None = None
    status: RequestStatus | None = None


@dataclass(frozen=True, slots=True)
class BlockoutDraft:
    """A blockout before the store gives it an id."""

    person_id: int
    starts_on: date
    ends_on: date
    reason: str


@dataclass(frozen=True, slots=True)
class Blockout:
    """Dates a person cannot serve, from starts_on to ends_on inclusive.

    The reason is the person's own and never goes into a request or a message.
    """

    id: int
    person_id: int
    starts_on: date
    ends_on: date
    reason: str


@dataclass(frozen=True, slots=True)
class NotificationDraft:
    """A notification before the store gives it an id.

    Attributes:
        request_id: the scheduling request it is about; None when it is about none.
    """

    person_id: int
    request_id: int | None
    kind: NotificationKind
    text: str
    due_at: datetime


@dataclass(frozen=True, slots=True)
class Notification:
    """A message for one person in the outbox; sent_at is None until it is sent."""

    id: int
    person_id: int
    request_id: int | None
    kind: NotificationKind
    text: str
    due_at: datetime
    sent_at: datetime | None


@dataclass(frozen=True, slots=True)
class Live:
    """A service in live mode.

    Attributes:
        controller_id: the one person who may advance it.
        current_index: the position of the current item.
        version: starts at 1 and goes up by one each time the current item changes.
        devices_updated_at: when the worker last reported; None before it has.
    """

    service_id: int
    controller_id: int
    current_index: int
    version: int
    obs: DeviceState
    ableton: DeviceState
    devices_updated_at: datetime | None
