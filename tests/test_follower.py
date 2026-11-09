import logging
from collections.abc import Sequence
from dataclasses import dataclass, field, replace

import pytest

from app import osc
from app.ableton import AbletonError
from app.api import NotLiveError
from app.follower import Follower
from app.live import LowerThird, ObsAction, PreviewScene, ProgramScene, SongLoad
from app.obs import ObsError
from app.records import Devices, DeviceState, LiveState
from tests.builders import OTHER_SONG, SERMON, SONG, live

HOLDING = "Holding"
OK = DeviceState.OK
LOAD_SONG = SongLoad(item_id=1, title="Groot is uw trouw", key="Bb", tempo_bpm=72)


@dataclass
class FakeApi:
    states: list[LiveState]
    reports: list[tuple[int, Devices]] = field(default_factory=list)
    not_live: bool = False

    def live(self) -> list[LiveState]:
        return self.states

    def report_devices(self, service_id: int, devices: Devices) -> None:
        if self.not_live:
            msg = f"PUT /services/{service_id}/live/devices: the api answered 404"
            raise NotLiveError(msg)
        self.reports.append((service_id, devices))
        # The api records it, and sends it back on the next poll.
        self.states = [
            replace(state, devices=devices) if state.service_id == service_id else state
            for state in self.states
        ]


@dataclass
class FakeObs:
    applied: list[tuple[ObsAction, ...]] = field(default_factory=list)
    error: ObsError | None = None

    def apply(self, actions: Sequence[ObsAction]) -> None:
        if self.error is not None:
            raise self.error
        self.applied.append(tuple(actions))


@dataclass
class FakeAbleton:
    loaded: list[SongLoad] = field(default_factory=list)
    error: AbletonError | osc.EncodeError | None = None

    def load(self, song: SongLoad) -> None:
        if self.error is not None:
            raise self.error
        self.loaded.append(song)


@pytest.fixture
def obs() -> FakeObs:
    return FakeObs()


@pytest.fixture
def ableton() -> FakeAbleton:
    return FakeAbleton()


def test_an_advance_drives_obs_and_ableton_once(obs: FakeObs, ableton: FakeAbleton) -> None:
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    follower.follow()
    assert obs.applied == [
        (
            ProgramScene("Band"),
            LowerThird("Groot is uw trouw · CCLI 12345"),
            PreviewScene("Pulpit"),
        )
    ]
    assert ableton.loaded == [LOAD_SONG]


def test_a_plan_edit_without_an_advance_sends_nothing(obs: FakeObs, ableton: FakeAbleton) -> None:
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    api.states = [live(replace(SONG, scene="Wide"), OTHER_SONG, auto_switch=False)]
    follower.follow()
    assert len(obs.applied) == 1
    assert len(ableton.loaded) == 1


def test_each_advance_is_followed(obs: FakeObs, ableton: FakeAbleton) -> None:
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    api.states = [live(SERMON, OTHER_SONG, version=2)]
    follower.follow()
    assert obs.applied[1] == (
        ProgramScene("Pulpit"),
        LowerThird("ds. J. Jansen"),
        PreviewScene("Band"),
    )
    assert [song.item_id for song in ableton.loaded] == [1, 3]


def test_reached_devices_are_reported_ok_on_each_advance(
    obs: FakeObs, ableton: FakeAbleton
) -> None:
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    follower.follow()
    api.states = [replace(live(SERMON, None, version=2), devices=Devices(obs=OK, ableton=OK))]
    follower.follow()
    # Reported on the polls that reached them, not on the one in between.
    assert api.reports == [(1, Devices(obs=OK, ableton=OK))] * 2


def test_unconfigured_devices_are_logged_and_reported(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, None, None, HOLDING)
    follower.follow()
    follower.follow()
    unconfigured = Devices(obs=DeviceState.UNCONFIGURED, ableton=DeviceState.UNCONFIGURED)
    assert api.reports == [(1, unconfigured)]
    assert "OBS unconfigured, would send: program 'Band'" in caplog.text
    assert "OBS unconfigured, would send: preview 'Pulpit'" in caplog.text
    assert "Ableton unconfigured, would load 'Groot is uw trouw' in Bb at 72 BPM" in caplog.text


def test_an_unreachable_obs_is_reported_and_ableton_still_loads(
    ableton: FakeAbleton, caplog: pytest.LogCaptureFixture
) -> None:
    api = FakeApi([live(SONG, SERMON)])
    obs = FakeObs(error=ObsError("could not connect to OBS at ws://obs:4455: refused"))
    Follower(api, obs, ableton, HOLDING).follow()
    assert api.reports == [(1, Devices(obs=DeviceState.UNREACHABLE, ableton=OK))]
    assert ableton.loaded == [LOAD_SONG]
    assert "could not connect to OBS at ws://obs:4455: refused" in caplog.text


def test_an_unreachable_ableton_is_reported_and_not_retried(obs: FakeObs) -> None:
    api = FakeApi([live(SONG, SERMON)])
    ableton = FakeAbleton(error=AbletonError("could not send to Ableton at m:11000: no route"))
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    ableton.error = None
    follower.follow()
    # A retried load could land in the middle of the song.
    assert ableton.loaded == []
    assert api.reports == [(1, Devices(obs=OK, ableton=DeviceState.UNREACHABLE))]


def test_a_song_osc_cannot_carry_is_logged(obs: FakeObs, caplog: pytest.LogCaptureFixture) -> None:
    api = FakeApi([live(SONG, SERMON)])
    ableton = FakeAbleton(error=osc.EncodeError("an OSC string cannot hold a NUL character"))
    Follower(api, obs, ableton, HOLDING).follow()
    assert "could not encode 'Groot is uw trouw' for Ableton" in caplog.text
    assert api.reports == [(1, Devices(obs=OK, ableton=DeviceState.UNKNOWN))]


def test_a_service_joined_mid_way_is_followed_from_its_next_advance(
    obs: FakeObs, ableton: FakeAbleton
) -> None:
    api = FakeApi([live(SONG, SERMON, version=3)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    assert obs.applied == []
    api.states = [live(SERMON, None, version=4)]
    follower.follow()
    assert obs.applied == [(ProgramScene("Pulpit"), LowerThird("ds. J. Jansen"))]


def test_a_service_live_again_is_followed_from_its_start(
    obs: FakeObs, ableton: FakeAbleton
) -> None:
    api = FakeApi([live(SONG, SERMON)])
    follower = Follower(api, obs, ableton, HOLDING)
    follower.follow()
    api.states = []
    follower.follow()
    api.states = [live(SONG, SERMON)]
    follower.follow()
    assert len(obs.applied) == 2
    assert len(ableton.loaded) == 2


def test_a_service_that_left_live_mode_before_the_report_is_no_failure(
    obs: FakeObs, ableton: FakeAbleton, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO)
    api = FakeApi([live(SONG, SERMON)], not_live=True)
    Follower(api, obs, ableton, HOLDING).follow()
    assert "service 1 left live mode before its devices were reported" in caplog.text
