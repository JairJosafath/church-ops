"""The worker: a round of work, then a wait, until SIGTERM or SIGINT asks it to stop.

A round follows live mode (OBS and Ableton on each item advance, and their
state to the api), then delivers the due notifications.
"""

import logging
import os
import signal
import socket
import time
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager
from types import FrameType

from app import ableton, api, chat, http_client, obs, outbox
from app.backoff import next_delay
from app.config import Config, ConfigError, from_environ
from app.follower import Follower

TICK_SECONDS = 0.1
"""How often a wait looks whether a stop was asked: the longest a stop waits."""

logger = logging.getLogger(__name__)


class RoundError(Exception):
    """A round failed for reasons its message gives, such as the api being down."""


class Stop:
    """Whether SIGTERM or SIGINT asked the worker to stop.

    The signal handler only notes the signal, so a round in progress always
    finishes; `sleep` returns early once a stop is asked.
    """

    def __init__(self) -> None:
        """Start with no stop asked."""
        self.signal: str | None = None

    @property
    def requested(self) -> bool:
        """Whether a signal asked the worker to stop."""
        return self.signal is not None

    def ask(self, signum: int, _frame: FrameType | None) -> None:
        """Ask the worker to stop: the handler of SIGTERM and SIGINT.

        It only notes the signal: logging from a signal handler can break a
        log line the worker is writing.

        Args:
            signum: The signal received.
        """
        self.signal = signal.Signals(signum).name

    def sleep(self, seconds: float) -> None:
        """Wait `seconds`, or less when a stop is asked meanwhile.

        Args:
            seconds: The longest wait.
        """
        deadline = time.monotonic() + seconds
        while not self.requested and (left := deadline - time.monotonic()) > 0:
            time.sleep(min(left, TICK_SECONDS))


def run(work: Callable[[], None], stop: Stop, interval: float) -> None:
    """Do a round of `work`, then wait, until `stop` is asked.

    A round that raises is logged, on one line for a `RoundError` and with
    its traceback for anything else, and the wait before the next one grows
    with each failure in a row (`next_delay`); the worker goes on.

    Args:
        work: One round of the worker's work.
        stop: Says when to stop, and waits between rounds.
        interval: The wait after a round that succeeded, in seconds.
    """
    failures = 0
    while not stop.requested:
        try:
            work()
        except RoundError as err:
            failures += 1
            logger.warning("round failed, %d in a row: %s", failures, err)
        except Exception:
            failures += 1
            logger.exception("round failed, %d in a row", failures)
        else:
            failures = 0
        stop.sleep(next_delay(failures, interval))


def round_of(*parts: Callable[[], None]) -> Callable[[], None]:
    """Make one round of `parts`, each run even when one before it failed on the api.

    So a live state the worker cannot read does not hold up the notifications,
    nor the other way round.

    Args:
        *parts: The round's parts, in order.

    Returns:
        The round: once every part ran, it raises a `RoundError` that gives
        each part's `ApiError`, if any; another error stops it at once.
    """

    def work() -> None:
        errors: list[api.ApiError] = []
        for part in parts:
            try:
                part()
            except api.ApiError as err:
                errors.append(err)
        if errors:
            msg = "; ".join(str(error) for error in errors)
            raise RoundError(msg) from errors[0]

    return work


@contextmanager
def connections(config: Config) -> Iterator[Callable[[], None]]:
    """Make the clients `config` asks for, and the round that uses them.

    Nothing is reached here: OBS is connected to on each advance, and the
    api and Matrix on each request. The UDP socket for Ableton is closed on
    exit.

    Args:
        config: The settings.

    Yields:
        One round of the worker's work.
    """
    http = http_client.Urllib()
    church_api = api.Client(config.api_url, http)
    adapter: chat.Adapter = (
        chat.Log() if config.matrix is None else chat.Matrix(config.matrix, http)
    )
    obs_client = (
        None
        if config.obs is None
        else obs.Client(config.obs, config.scenes.lower_third_input, obs.websocket)
    )
    with ExitStack() as stack:
        music = None
        if config.ableton is not None:
            sock = stack.enter_context(socket.socket(socket.AF_INET, socket.SOCK_DGRAM))
            music = ableton.Client(sock, config.ableton)
        follower = Follower(church_api, obs_client, music, config.scenes.holding)
        yield round_of(
            follower.follow, lambda: outbox.deliver_due(church_api, adapter, time.monotonic)
        )


def describe(config: Config) -> str:
    """Say what the worker drives and where, for the start-up log line.

    Args:
        config: The settings.

    Returns:
        One line, which never holds the OBS password or the Matrix token.
    """
    parts = [f"api {config.api_url}, polled every {config.poll_seconds:g} s"]
    if config.obs is None:
        parts.append("OBS unconfigured (no OBS_URL)")
    else:
        parts.append(
            f"OBS {config.obs.url} (holding scene {config.scenes.holding!r},"
            f" lower third {config.scenes.lower_third_input!r})"
        )
    if config.ableton is None:
        parts.append("Ableton unconfigured (no ABLETON_OSC_HOST)")
    else:
        parts.append(f"Ableton OSC {config.ableton.host}:{config.ableton.port}")
    if config.matrix is None:
        parts.append("notifications to the log")
    else:
        parts.append(f"notifications to Matrix room {config.matrix.room_id}")
    return "; ".join(parts)


def main() -> int:
    """Run the worker until SIGTERM or SIGINT, the `[project.scripts]` entry point.

    Logs go to stderr, one line per event. The settings are read once, here,
    from the environment.

    Returns:
        The exit code: 0 once the worker stopped, 1 when a setting is wrong.
    """
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    try:
        config = from_environ(os.environ)
    except ConfigError as err:
        logger.critical("not started: %s", err)
        return 1
    stop = Stop()
    signal.signal(signal.SIGTERM, stop.ask)
    signal.signal(signal.SIGINT, stop.ask)
    logger.info("started: %s", describe(config))
    with connections(config) as work:
        run(work, stop, config.poll_seconds)
    logger.info("stopped on %s", stop.signal)
    return 0
