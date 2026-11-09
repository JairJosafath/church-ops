from dataclasses import replace

import pytest

from app.live import (
    LowerThird,
    Moment,
    ObsAction,
    PreviewScene,
    ProgramScene,
    Seen,
    SongLoad,
    react,
)
from app.records import Item, LiveState
from tests.builders import OTHER_SONG, PRAYER, SERMON, SONG, live

HOLDING = "Holding"
LOAD_SONG = SongLoad(item_id=1, title="Groot is uw trouw", key="Bb", tempo_bpm=72)
LOAD_OTHER_SONG = SongLoad(item_id=3, title="Heer, U bent mijn leven", key="G", tempo_bpm=96)


def test_the_same_version_again_does_nothing() -> None:
    # A plan edit changes the live state but not its version.
    seen = Seen(version=2, loaded_item_id=1)
    reaction = react(seen, live(replace(SONG, title="Edited"), SERMON, version=2), HOLDING)
    assert reaction.moment is Moment.UNCHANGED
    assert reaction.obs == ()
    assert reaction.song is None
    assert reaction.seen == seen


def test_live_mode_starting_is_an_advance() -> None:
    reaction = react(None, live(SONG, SERMON, version=1), HOLDING)
    assert reaction.moment is Moment.ADVANCED
    assert reaction.seen == Seen(version=1, loaded_item_id=1)


def test_joining_a_service_mid_way_waits_for_the_next_advance() -> None:
    # The worker restarted during the service: re-sending the current item
    # could reload the song the band is playing.
    reaction = react(None, live(SONG, SERMON, version=4), HOLDING)
    assert reaction.moment is Moment.JOINED
    assert reaction.obs == ()
    assert reaction.song is None
    assert reaction.seen == Seen(version=4, loaded_item_id=None)


def test_a_new_version_is_an_advance() -> None:
    reaction = react(Seen(version=1, loaded_item_id=1), live(SERMON, None, version=2), HOLDING)
    assert reaction.moment is Moment.ADVANCED
    assert reaction.seen.version == 2


@pytest.mark.parametrize(
    ("state", "expected"),
    [
        (
            live(SONG, SERMON),
            (
                ProgramScene("Band"),
                LowerThird("Groot is uw trouw · CCLI 12345"),
                PreviewScene("Pulpit"),
            ),
        ),
        (
            live(SONG, SERMON, auto_switch=False),
            (LowerThird("Groot is uw trouw · CCLI 12345"), PreviewScene("Pulpit")),
        ),
        (
            live(PRAYER, SERMON),
            (ProgramScene(HOLDING), LowerThird(""), PreviewScene("Pulpit")),
        ),
        (
            live(PRAYER, SERMON, auto_switch=False),
            (LowerThird(""), PreviewScene("Pulpit")),
        ),
        (
            live(SONG, SERMON, streamed=False),
            (
                ProgramScene(HOLDING),
                LowerThird("Groot is uw trouw · CCLI 12345"),
                PreviewScene(HOLDING),
            ),
        ),
        (
            live(SERMON, PRAYER),
            (ProgramScene("Pulpit"), LowerThird("ds. J. Jansen"), PreviewScene(HOLDING)),
        ),
        (
            live(SERMON, PRAYER, auto_switch=False),
            (LowerThird("ds. J. Jansen"), PreviewScene(HOLDING)),
        ),
        (
            live(SERMON, None),
            (ProgramScene("Pulpit"), LowerThird("ds. J. Jansen")),
        ),
        (
            live(OTHER_SONG, SERMON),
            (ProgramScene("Band"), LowerThird(""), PreviewScene("Pulpit")),
        ),
        (
            live(replace(SERMON, scene=None), replace(SONG, scene=None)),
            (LowerThird("ds. J. Jansen"),),
        ),
        (
            live(None, SERMON),
            (LowerThird(""), PreviewScene("Pulpit")),
        ),
    ],
    ids=[
        "auto-switch-takes-current-to-program",
        "no-auto-switch-only-sets-preview",
        "off-stream-current-shows-holding",
        "off-stream-current-without-auto-switch",
        "unstreamed-service-shows-holding",
        "off-stream-next-previews-holding",
        "off-stream-next-without-auto-switch",
        "last-item-has-no-preview",
        "no-lower-third-clears-it",
        "items-without-scenes-change-no-scene",
        "no-current-item",
    ],
)
def test_obs_on_an_advance(state: LiveState, expected: tuple[ObsAction, ...]) -> None:
    assert react(None, state, HOLDING).obs == expected


@pytest.mark.parametrize(
    ("loaded", "current", "next_item", "expected"),
    [
        (None, SONG, SERMON, LOAD_SONG),
        (None, SERMON, OTHER_SONG, LOAD_OTHER_SONG),
        (None, SONG, OTHER_SONG, LOAD_SONG),
        (None, SERMON, PRAYER, None),
        (None, SERMON, None, None),
        (None, None, SONG, LOAD_SONG),
        (None, replace(SONG, arrangement=None), OTHER_SONG, LOAD_OTHER_SONG),
        (3, OTHER_SONG, SERMON, None),
        (1, SERMON, OTHER_SONG, LOAD_OTHER_SONG),
    ],
    ids=[
        "current-song",
        "next-song-when-current-is-not-one",
        "current-song-before-next-song",
        "no-song-now-or-next",
        "last-item-not-a-song",
        "no-current-item",
        "song-without-arrangement-is-not-loadable",
        "song-loaded-on-the-last-advance-is-not-reloaded",
        "a-different-song-is-loaded",
    ],
)
def test_ableton_on_an_advance(
    loaded: int | None, current: Item | None, next_item: Item | None, expected: SongLoad | None
) -> None:
    seen = Seen(version=1, loaded_item_id=loaded)
    assert react(seen, live(current, next_item, version=2), HOLDING).song == expected


def test_the_loaded_song_is_remembered_across_advances_without_one() -> None:
    seen = Seen(version=1, loaded_item_id=1)
    after = react(seen, live(SERMON, None, version=2), HOLDING)
    assert after.song is None
    assert after.seen == Seen(version=2, loaded_item_id=1)


def test_a_song_is_loaded_once_over_the_advance_to_it() -> None:
    # The reading before a song loads it; advancing to the song does not
    # load it again, in case the band leader already started it.
    first = react(None, live(SERMON, OTHER_SONG, version=1), HOLDING)
    second = react(first.seen, live(OTHER_SONG, SERMON, version=2), HOLDING)
    assert [first.song, second.song] == [LOAD_OTHER_SONG, None]
