"""What OBS and Ableton should do when a service in live mode moves to another item.

A pure decision, with no network: given what the worker last saw of a service
and its live state now, `react` says whether the item advanced and, if it
did, the OBS requests and the song to load. A plan edit does not change the
live state's version, so it never leads to anything.
"""

from dataclasses import dataclass
from enum import Enum
from typing import assert_never

from app.records import Item, ItemKind, LiveState

FIRST_VERSION = 1
"""The version of a service's live state when live mode starts."""


class Moment(Enum):
    """What happened to a service since the worker last saw it."""

    UNCHANGED = "unchanged"
    """The same version as last time: nothing to do, whatever was edited."""

    JOINED = "joined"
    """First seen after an advance, as after a restart: it waits for the next one."""

    ADVANCED = "advanced"
    """Live mode started, or the current item moved: OBS and Ableton follow."""


@dataclass(frozen=True, slots=True)
class ProgramScene:
    """Take a scene to program, on air.

    Attributes:
        name: The scene's name in OBS.
    """

    name: str


@dataclass(frozen=True, slots=True)
class PreviewScene:
    """Put a scene in studio mode's preview, for the operator or the next advance.

    Attributes:
        name: The scene's name in OBS.
    """

    name: str


@dataclass(frozen=True, slots=True)
class LowerThird:
    """Set the caption's text.

    Attributes:
        text: The caption; empty clears it.
    """

    text: str


type ObsAction = ProgramScene | PreviewScene | LowerThird
"""One request to OBS."""


def describe(action: ObsAction) -> str:
    """Say what an OBS action does, for a log line.

    Args:
        action: The action.

    Returns:
        Such as `program 'Band'` or `lower third ''`.
    """
    match action:
        case ProgramScene(name):
            return f"program {name!r}"
        case PreviewScene(name):
            return f"preview {name!r}"
        case LowerThird(text):
            return f"lower third {text!r}"
        case _ as unreachable:
            assert_never(unreachable)


@dataclass(frozen=True, slots=True)
class SongLoad:
    """A song for Ableton to load and the tempo to set; never a transport start.

    Attributes:
        item_id: The service item the song is.
        title: The song's title.
        key: The key to play it in.
        tempo_bpm: The arrangement's tempo, in beats per minute.
    """

    item_id: int
    title: str
    key: str
    tempo_bpm: int


@dataclass(frozen=True, slots=True)
class Seen:
    """What the worker remembers of a service in live mode.

    Attributes:
        version: The last version it saw.
        loaded_item_id: The item whose song it last had Ableton load; `None`
            when it loaded none, or does not know.
    """

    version: int
    loaded_item_id: int | None


@dataclass(frozen=True, slots=True)
class Reaction:
    """What to do about a service's live state.

    Attributes:
        moment: What happened since the worker last saw the service.
        seen: What to remember of it from now on.
        obs: The requests to OBS, in order; empty unless it advanced.
        song: The song for Ableton to load; `None` when there is none to
            load, it is already loaded, or the service did not advance.
    """

    moment: Moment
    seen: Seen
    obs: tuple[ObsAction, ...] = ()
    song: SongLoad | None = None


def react(seen: Seen | None, state: LiveState, holding_scene: str) -> Reaction:
    """Decide what OBS and Ableton do about a service's live state.

    Only a new version acts, once. OBS gets, in this order: the current item's
    scene to program when `auto_switch` is on (the holding scene when the
    item is off stream or the service is not streamed); its lower third, or
    an empty one for none or an off-stream item; and the next item's scene,
    held the same way, to preview. Ableton gets the current item's song, else
    the next item's, unless it is the song already loaded.

    Args:
        seen: What the worker remembers of the service; `None` the first time.
        state: The service's live state now.
        holding_scene: The scene for what must not be streamed.

    Returns:
        What happened and what to do about it.
    """
    if seen is not None and seen.version == state.version:
        return Reaction(Moment.UNCHANGED, seen)
    if seen is None and state.version != FIRST_VERSION:
        return Reaction(Moment.JOINED, Seen(version=state.version, loaded_item_id=None))
    loaded = None if seen is None else seen.loaded_item_id
    song = _song(state)
    if song is not None and song.item_id == loaded:
        song = None
    return Reaction(
        Moment.ADVANCED,
        Seen(version=state.version, loaded_item_id=loaded if song is None else song.item_id),
        obs=_obs(state, holding_scene),
        song=song,
    )


def _on_air(state: LiveState, item: Item, holding_scene: str) -> str | None:
    if item.off_stream or not state.streamed:
        return holding_scene
    return item.scene


def _obs(state: LiveState, holding_scene: str) -> tuple[ObsAction, ...]:
    actions: list[ObsAction] = []
    current = state.current
    if state.auto_switch and current is not None:
        scene = _on_air(state, current, holding_scene)
        if scene is not None:
            actions.append(ProgramScene(scene))
    # An off-stream item's caption could name the person prayed for.
    caption = None if current is None or current.off_stream else current.lower_third
    actions.append(LowerThird(caption or ""))
    if state.next is not None:
        scene = _on_air(state, state.next, holding_scene)
        if scene is not None:
            actions.append(PreviewScene(scene))
    return tuple(actions)


def _song(state: LiveState) -> SongLoad | None:
    for item in (state.current, state.next):
        if item is None or item.kind is not ItemKind.SONG or item.arrangement is None:
            continue
        return SongLoad(
            item_id=item.id,
            title=item.arrangement.song_title,
            key=item.arrangement.key,
            tempo_bpm=item.arrangement.tempo_bpm,
        )
    return None
