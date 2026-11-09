"""Following live mode: each advance drives OBS and Ableton once; their state goes to the api."""

import logging
from collections.abc import Sequence
from dataclasses import replace
from typing import Protocol, assert_never

from app import osc
from app.ableton import AbletonError
from app.api import NotLiveError
from app.live import Moment, ObsAction, Seen, SongLoad, describe, react
from app.obs import ObsError
from app.records import Devices, DeviceState, LiveState

logger = logging.getLogger(__name__)


class LiveApi(Protocol):
    """What following live mode needs of the api."""

    def live(self) -> list[LiveState]:
        """Every service in live mode."""
        ...

    def report_devices(self, service_id: int, devices: Devices) -> None:
        """Record the devices' state for a live service.

        Raises:
            NotLiveError: When the service left live mode.
        """
        ...


class Obs(Protocol):
    """What following live mode needs of OBS."""

    def apply(self, actions: Sequence[ObsAction]) -> None:
        """Send the requests to OBS.

        Raises:
            ObsError: When OBS cannot be reached.
        """
        ...


class Ableton(Protocol):
    """What following live mode needs of Ableton."""

    def load(self, song: SongLoad) -> None:
        """Load the song and set its tempo.

        Raises:
            osc.EncodeError: When OSC cannot carry the song.
            AbletonError: When the music computer cannot be reached.
        """
        ...


class Follower:
    """Follows every service in live mode, one poll at a time.

    It remembers the version it last saw of each service, so it acts once
    per advance, and what it last knew of OBS and Ableton, which it reports.
    """

    def __init__(
        self, api: LiveApi, obs: Obs | None, ableton: Ableton | None, holding_scene: str
    ) -> None:
        """Follow the services `api` gives, driving `obs` and `ableton`.

        Args:
            api: Gives the live states and records the devices' state.
            obs: Drives OBS; `None` when OBS is unconfigured.
            ableton: Drives Ableton; `None` when Ableton is unconfigured.
            holding_scene: The OBS scene for what must not be streamed.
        """
        self._api = api
        self._obs = obs
        self._ableton = ableton
        self._holding_scene = holding_scene
        self._seen: dict[int, Seen] = {}
        self._devices = Devices(
            obs=DeviceState.UNCONFIGURED if obs is None else DeviceState.UNKNOWN,
            ableton=DeviceState.UNCONFIGURED if ableton is None else DeviceState.UNKNOWN,
        )

    def follow(self) -> None:
        """Poll the live services once: act on each advance, then report the devices.

        A service's devices are reported when this poll reached (or failed to
        reach) them, or when the api's record of them is not what the worker
        knows. A device that cannot be reached is logged and reported; it never
        fails the poll, and what it missed is not sent again.

        Raises:
            ApiError: When the api cannot give the live states or record a report.
        """
        states = self._api.live()
        live = {state.service_id for state in states}
        for service_id in self._seen.keys() - live:
            logger.info("service %d left live mode", service_id)
            del self._seen[service_id]
        for state in states:
            reached = self._follow(state)
            if reached or state.devices != self._devices:
                self._report(state.service_id)

    def _follow(self, state: LiveState) -> bool:
        reaction = react(self._seen.get(state.service_id), state, self._holding_scene)
        # Remembered before acting: a device that fails is not sent the same again.
        self._seen[state.service_id] = reaction.seen
        match reaction.moment:
            case Moment.UNCHANGED:
                return False
            case Moment.JOINED:
                logger.info(
                    "service %d (%s) is live at version %d; following it from its next advance",
                    state.service_id,
                    state.service_title,
                    state.version,
                )
                return False
            case Moment.ADVANCED:
                logger.info(
                    "service %d (%s) is at version %d",
                    state.service_id,
                    state.service_title,
                    state.version,
                )
                self._drive_obs(reaction.obs)
                self._drive_ableton(reaction.song)
                return True
            case _ as unreachable:
                assert_never(unreachable)

    def _drive_obs(self, actions: Sequence[ObsAction]) -> None:
        if self._obs is None:
            for action in actions:
                logger.info("OBS unconfigured, would send: %s", describe(action))
            return
        try:
            self._obs.apply(actions)
        except ObsError as err:
            logger.warning("OBS unreachable: %s", err)
            self._devices = replace(self._devices, obs=DeviceState.UNREACHABLE)
        else:
            self._devices = replace(self._devices, obs=DeviceState.OK)

    def _drive_ableton(self, song: SongLoad | None) -> None:
        if song is None:
            logger.info("Ableton: no song to load")
            return
        if self._ableton is None:
            logger.info(
                "Ableton unconfigured, would load %r in %s at %d BPM",
                song.title,
                song.key,
                song.tempo_bpm,
            )
            return
        try:
            self._ableton.load(song)
        except osc.EncodeError as err:
            logger.warning("could not encode %r for Ableton, nothing sent: %s", song.title, err)
        except AbletonError as err:
            logger.warning("Ableton unreachable: %s", err)
            self._devices = replace(self._devices, ableton=DeviceState.UNREACHABLE)
        else:
            logger.info("Ableton: loaded %r in %s at %d BPM", song.title, song.key, song.tempo_bpm)
            self._devices = replace(self._devices, ableton=DeviceState.OK)

    def _report(self, service_id: int) -> None:
        try:
            self._api.report_devices(service_id, self._devices)
        except NotLiveError:
            logger.info("service %d left live mode before its devices were reported", service_id)
