"""Records for the tests: a small service of songs, a sermon and an off-stream prayer.

As the worker holds them, and as the api sends them (`*_json`).
"""

from app.records import Arrangement, Devices, DeviceState, Item, ItemKind, LiveState

SONG = Item(
    id=1,
    kind=ItemKind.SONG,
    title="Groot is uw trouw",
    arrangement=Arrangement(song_title="Groot is uw trouw", key="Bb", tempo_bpm=72),
    scene="Band",
    lower_third="Groot is uw trouw · CCLI 12345",
    off_stream=False,
)
SERMON = Item(
    id=2,
    kind=ItemKind.SERMON,
    title="Preek",
    arrangement=None,
    scene="Pulpit",
    lower_third="ds. J. Jansen",
    off_stream=False,
)
OTHER_SONG = Item(
    id=3,
    kind=ItemKind.SONG,
    title="Heer, U bent mijn leven",
    arrangement=Arrangement(song_title="Heer, U bent mijn leven", key="G", tempo_bpm=96),
    scene="Band",
    lower_third=None,
    off_stream=False,
)
PRAYER = Item(
    id=4,
    kind=ItemKind.PRAYER,
    title="Voorbede",
    arrangement=None,
    scene="Wide",
    lower_third="Voorbede voor Henk",
    off_stream=True,
)
UNKNOWN_DEVICES = Devices(obs=DeviceState.UNKNOWN, ableton=DeviceState.UNKNOWN)


def live(
    current: Item | None,
    next_item: Item | None,
    *,
    version: int = 1,
    auto_switch: bool = True,
    streamed: bool = True,
) -> LiveState:
    """Service 1 in live mode at `current`, with devices the api knows nothing of."""
    return LiveState(
        service_id=1,
        service_title="Zondagochtend",
        auto_switch=auto_switch,
        streamed=streamed,
        version=version,
        current=current,
        next=next_item,
        devices=UNKNOWN_DEVICES,
    )


PERSON = {"id": 3, "name": "Anna de Vries", "email": None}


def item_json(**overrides: object) -> dict[str, object]:
    """An Item as the api sends it, a song unless overridden."""
    return {
        "id": 11,
        "service_id": 1,
        "position": 0,
        "kind": "song",
        "title": "Groot is uw trouw",
        "length_seconds": 240,
        "starts_at": "2026-11-15T10:00:00+01:00",
        "arrangement": {
            "id": 5,
            "song_title": "Groot is uw trouw",
            "name": "Band",
            "key": "Bb",
            "tempo_bpm": 72,
            "meter": "3/4",
            "sequence": "V1 C V2 C",
            "chart": "",
        },
        "key": None,
        "scene": "Band",
        "lower_third": "Groot is uw trouw · CCLI 12345",
        "off_stream": False,
        "notes": "",
    } | overrides


def live_json(**overrides: object) -> dict[str, object]:
    """A LiveState as the api sends it."""
    return {
        "service_id": 1,
        "service_title": "Zondagochtend",
        "auto_switch": True,
        "streamed": True,
        "current_index": 0,
        "version": 1,
        "controller": PERSON,
        "current": item_json(),
        "next": item_json(
            id=12, kind="sermon", title="Preek", arrangement=None, scene="Pulpit", lower_third=None
        ),
        "devices": {"obs": "unknown", "ableton": "unknown", "updated_at": None},
    } | overrides
