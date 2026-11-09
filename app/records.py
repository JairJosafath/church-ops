"""The api's records the worker reads, parsed from JSON once, at the edge.

Only the fields the worker uses are read; the others are ignored, so the api
may add fields without breaking the worker.
"""

from dataclasses import dataclass
from enum import Enum


class RecordError(ValueError):
    """A record from the api is not the shape the contract gives; the message says where."""


class ItemKind(Enum):
    """What a service item is."""

    SONG = "song"
    READING = "reading"
    SERMON = "sermon"
    PRAYER = "prayer"
    VIDEO = "video"
    ANNOUNCEMENT = "announcement"
    HEADER = "header"


class DeviceState(Enum):
    """What the worker last knew of a device, as the api records it."""

    OK = "ok"
    UNREACHABLE = "unreachable"
    UNCONFIGURED = "unconfigured"
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True)
class Arrangement:
    """The arrangement a song item is played in.

    Attributes:
        song_title: The song's title.
        key: The effective key: the item's own, else the arrangement's.
        tempo_bpm: Beats per minute.
    """

    song_title: str
    key: str
    tempo_bpm: int


@dataclass(frozen=True, slots=True)
class Item:
    """One item of a service, with what OBS and Ableton need of it.

    Attributes:
        id: The item's id.
        kind: What the item is.
        title: Its title.
        arrangement: The arrangement of a song; `None` for other kinds.
        scene: The OBS scene it names; `None` when it names none.
        lower_third: Its caption; `None` when it has none.
        off_stream: Whether the stream must not show it.
    """

    id: int
    kind: ItemKind
    title: str
    arrangement: Arrangement | None
    scene: str | None
    lower_third: str | None
    off_stream: bool


@dataclass(frozen=True, slots=True)
class Devices:
    """The state of OBS and of Ableton.

    Attributes:
        obs: OBS's state.
        ableton: Ableton's state.
    """

    obs: DeviceState
    ableton: DeviceState


@dataclass(frozen=True, slots=True)
class LiveState:
    """A service in live mode: its current and next item.

    Attributes:
        service_id: The service's id.
        service_title: Its title.
        auto_switch: Whether the item advance takes the scene to program.
        streamed: Whether the service is streamed at all.
        version: Bumped by each item advance, never by a plan edit; 1 when live
            mode starts.
        current: The current item; `None` when there is none.
        next: The item after it; `None` at the last item.
        devices: The device states the api holds for it.
    """

    service_id: int
    service_title: str
    auto_switch: bool
    streamed: bool
    version: int
    current: Item | None
    next: Item | None
    devices: Devices


@dataclass(frozen=True, slots=True)
class Notification:
    """A message due to a person.

    Attributes:
        id: The notification's id: its identity, so it is sent once.
        person_name: The name of the person it is for.
        text: What it says.
    """

    id: int
    person_name: str
    text: str


class _Fields:
    """The fields of one JSON object, read with their types checked."""

    def __init__(self, value: object, where: str) -> None:
        if not isinstance(value, dict):
            msg = f"{where}: expected an object, got {_kind(value)}"
            raise RecordError(msg)
        self._value: dict[object, object] = value
        self.where = where

    def _field(self, name: str) -> object:
        if name not in self._value:
            msg = f"{self.where}: {name} is missing"
            raise RecordError(msg)
        return self._value[name]

    def _wrong(self, name: str, expected: str, value: object) -> RecordError:
        return RecordError(f"{self.where}: {name} must be {expected}, got {_kind(value)}")

    def integer(self, name: str) -> int:
        value = self._field(name)
        # bool is an int in Python, never in JSON.
        if isinstance(value, bool) or not isinstance(value, int):
            raise self._wrong(name, "an integer", value)
        return value

    def text(self, name: str) -> str:
        value = self._field(name)
        if not isinstance(value, str):
            raise self._wrong(name, "a string", value)
        return value

    def optional_text(self, name: str) -> str | None:
        value = self._value.get(name)
        if value is None:
            return None
        if not isinstance(value, str):
            raise self._wrong(name, "a string or null", value)
        return value

    def flag(self, name: str) -> bool:
        value = self._field(name)
        if not isinstance(value, bool):
            raise self._wrong(name, "true or false", value)
        return value

    def nested(self, name: str) -> "_Fields":
        return _Fields(self._field(name), f"{self.where}.{name}")

    def optional_nested(self, name: str) -> "_Fields | None":
        value = self._value.get(name)
        return None if value is None else _Fields(value, f"{self.where}.{name}")

    def choice[E: Enum](self, name: str, enum: type[E]) -> E:
        value = self.text(name)
        try:
            return enum(value)
        except ValueError as err:
            allowed = ", ".join(str(member.value) for member in enum)
            msg = f"{self.where}: {name} must be one of {allowed}, got {value!r}"
            raise RecordError(msg) from err


_JSON_KINDS: tuple[tuple[type, str], ...] = (
    # bool before int: True is an int in Python, a boolean in JSON.
    (bool, "a boolean"),
    (int, "a number"),
    (float, "a number"),
    (str, "a string"),
    (list, "an array"),
    (dict, "an object"),
)


def _kind(value: object) -> str:
    if value is None:
        return "null"
    return next(
        (name for json_type, name in _JSON_KINDS if isinstance(value, json_type)),
        type(value).__name__,
    )


def _list(value: object, where: str) -> list[object]:
    if not isinstance(value, list):
        msg = f"{where}: expected an array, got {_kind(value)}"
        raise RecordError(msg)
    return list(value)


def _item(fields: _Fields | None) -> Item | None:
    if fields is None:
        return None
    arrangement = fields.optional_nested("arrangement")
    return Item(
        id=fields.integer("id"),
        kind=fields.choice("kind", ItemKind),
        title=fields.text("title"),
        arrangement=(
            None
            if arrangement is None
            else Arrangement(
                song_title=arrangement.text("song_title"),
                key=arrangement.text("key"),
                tempo_bpm=arrangement.integer("tempo_bpm"),
            )
        ),
        scene=fields.optional_text("scene"),
        lower_third=fields.optional_text("lower_third"),
        off_stream=fields.flag("off_stream"),
    )


def _live_state(fields: _Fields) -> LiveState:
    devices = fields.nested("devices")
    return LiveState(
        service_id=fields.integer("service_id"),
        service_title=fields.text("service_title"),
        auto_switch=fields.flag("auto_switch"),
        streamed=fields.flag("streamed"),
        version=fields.integer("version"),
        current=_item(fields.optional_nested("current")),
        next=_item(fields.optional_nested("next")),
        devices=Devices(
            obs=devices.choice("obs", DeviceState),
            ableton=devices.choice("ableton", DeviceState),
        ),
    )


def parse_live_states(value: object) -> list[LiveState]:
    """Parse the body of `GET /live`: every service in live mode.

    Args:
        value: The decoded JSON.

    Returns:
        The live states, in the api's order; empty when no service is live.

    Raises:
        RecordError: When the JSON is not a list of LiveState records.
    """
    return [
        _live_state(_Fields(entry, f"live[{index}]"))
        for index, entry in enumerate(_list(value, "live"))
    ]


def parse_notifications(value: object) -> list[Notification]:
    """Parse the body of `GET /notifications/due`.

    Args:
        value: The decoded JSON.

    Returns:
        The due notifications, oldest first; empty when none is due.

    Raises:
        RecordError: When the JSON is not a list of Notification records.
    """
    notifications = []
    for index, entry in enumerate(_list(value, "notifications")):
        fields = _Fields(entry, f"notifications[{index}]")
        notifications.append(
            Notification(
                id=fields.integer("id"),
                person_name=fields.nested("person").text("name"),
                text=fields.text("text"),
            )
        )
    return notifications
