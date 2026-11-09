import logging
import os
import signal
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import override

import pytest

from app import worker
from app.api import ApiError
from app.backoff import next_delay
from app.config import Config, from_environ
from app.worker import RoundError, Stop, round_of, run

POLL = 1.0


class StopAfter(Stop):
    """A Stop that records each wait and asks to stop after `rounds` of them."""

    def __init__(self, rounds: int) -> None:
        super().__init__()
        self.rounds = rounds
        self.waits: list[float] = []

    @override
    def sleep(self, seconds: float) -> None:
        self.waits.append(seconds)
        if len(self.waits) == self.rounds:
            self.signal = "SIGTERM"


def test_runs_rounds_until_stopped() -> None:
    rounds: list[int] = []
    stop = StopAfter(3)
    run(lambda: rounds.append(1), stop, POLL)
    assert len(rounds) == 3
    assert stop.waits == [POLL] * 3


def test_a_failing_round_backs_off_and_the_worker_goes_on(caplog: pytest.LogCaptureFixture) -> None:
    outcomes = iter([RuntimeError("provider down"), RuntimeError("provider down"), None])

    def work() -> None:
        outcome = next(outcomes)
        if outcome is not None:
            raise outcome

    stop = StopAfter(3)
    run(work, stop, POLL)
    assert stop.waits == [next_delay(1, POLL), next_delay(2, POLL), POLL]
    assert "round failed, 2 in a row" in caplog.text
    assert "provider down" in caplog.text


def test_sleep_returns_at_once_when_a_stop_was_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_wait(seconds: float) -> None:
        pytest.fail(f"waited {seconds} seconds after a stop was asked")

    monkeypatch.setattr(time, "sleep", no_wait)
    stop = Stop()
    stop.ask(signal.SIGTERM, None)
    stop.sleep(60)
    assert stop.signal == "SIGTERM"


@pytest.fixture
def restore_signal_handlers() -> Iterator[None]:
    """Give back pytest's own SIGTERM and SIGINT handlers after `main` set its."""
    saved = {signum: signal.getsignal(signum) for signum in (signal.SIGTERM, signal.SIGINT)}
    yield
    for signum, handler in saved.items():
        signal.signal(signum, handler)


def connections_with(work: Callable[[], None], configs: list[Config]) -> object:
    """A `worker.connections` that makes no client and yields `work`."""

    @contextmanager
    def connections(config: Config) -> Iterator[Callable[[], None]]:
        configs.append(config)
        yield work

    return connections


@pytest.mark.usefixtures("restore_signal_handlers")
def test_sigterm_stops_the_worker_cleanly(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    rounds: list[int] = []
    configs: list[Config] = []

    def work() -> None:
        # A real SIGTERM, as Kubernetes sends to stop the pod, in the middle of a round.
        rounds.append(1)
        os.kill(os.getpid(), signal.SIGTERM)

    monkeypatch.setenv("API_URL", "http://api:8000")
    monkeypatch.setattr(worker, "connections", connections_with(work, configs))
    caplog.set_level(logging.INFO)
    assert worker.main() == 0
    assert rounds == [1]
    assert [config.api_url for config in configs] == ["http://api:8000"]
    assert "stopped on SIGTERM" in caplog.text


@pytest.mark.usefixtures("restore_signal_handlers")
def test_the_start_is_logged_without_secrets(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def work() -> None:
        os.kill(os.getpid(), signal.SIGTERM)

    for name, value in {
        "API_URL": "http://api:8000",
        "OBS_URL": "ws://obs:4455",
        "OBS_PASSWORD": "obs-secret-value",
        "ABLETON_OSC_HOST": "music.local",
        "CHAT_ADAPTER": "matrix",
        "MATRIX_HOMESERVER": "https://matrix.example.org",
        "MATRIX_ACCESS_TOKEN": "matrix-secret-value",
        "MATRIX_ROOM_ID": "!crew:example.org",
    }.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setattr(worker, "connections", connections_with(work, []))
    caplog.set_level(logging.INFO)
    assert worker.main() == 0
    assert (
        "started: api http://api:8000, polled every 1 s; OBS ws://obs:4455 (holding scene"
        " 'Holding', lower third 'Lower third'); Ableton OSC music.local:11000;"
        " notifications to Matrix room !crew:example.org"
    ) in caplog.text
    assert "secret-value" not in caplog.text


def test_unconfigured_devices_are_logged_at_the_start() -> None:
    config = from_environ({"API_URL": "http://api:8000"})
    assert worker.describe(config) == (
        "api http://api:8000, polled every 1 s; OBS unconfigured (no OBS_URL);"
        " Ableton unconfigured (no ABLETON_OSC_HOST); notifications to the log"
    )


def test_a_wrong_setting_stops_the_start_with_exit_code_1(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("API_URL", raising=False)
    assert worker.main() == 1
    assert "not started: API_URL is not set" in caplog.text


def test_a_round_runs_every_part_even_when_one_fails_on_the_api() -> None:
    ran: list[str] = []

    def follow() -> None:
        ran.append("follow")
        msg = "GET /live: the api answered 500"
        raise ApiError(msg)

    def deliver() -> None:
        ran.append("deliver")
        msg = "the api is unreachable: GET /notifications/due: timed out"
        raise ApiError(msg)

    with pytest.raises(
        RoundError,
        match="GET /live: the api answered 500; the api is unreachable: GET /notifications/due",
    ):
        round_of(follow, deliver)()
    assert ran == ["follow", "deliver"]


def test_a_known_failure_is_logged_on_one_line(caplog: pytest.LogCaptureFixture) -> None:
    def work() -> None:
        msg = "the api is unreachable: GET http://api:8000/live: Connection refused"
        raise RoundError(msg)

    run(work, StopAfter(1), POLL)
    [record] = caplog.records
    assert record.getMessage() == (
        "round failed, 1 in a row: the api is unreachable: GET http://api:8000/live:"
        " Connection refused"
    )
    assert record.exc_info is None


def test_a_round_whose_parts_succeed_raises_nothing() -> None:
    ran: list[str] = []
    round_of(lambda: ran.append("follow"), lambda: ran.append("deliver"))()
    assert ran == ["follow", "deliver"]
