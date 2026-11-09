import pytest

from app.backoff import MAX_SECONDS, next_delay

POLL = 1.0


@pytest.mark.parametrize(
    ("failures", "expected"),
    [
        (0, POLL),
        (1, 2 * POLL),
        (2, 4 * POLL),
        (100, MAX_SECONDS),
        (10_000, MAX_SECONDS),
    ],
    ids=["success", "one", "two", "capped", "huge"],
)
def test_next_delay(failures: int, expected: float) -> None:
    assert next_delay(failures, POLL) == expected


def test_an_interval_over_the_cap_is_kept_after_a_success() -> None:
    assert next_delay(0, 60.0) == 60.0


def test_negative_failures_are_an_error() -> None:
    with pytest.raises(ValueError, match="failures must be 0 or more, got -1"):
        next_delay(-1, POLL)
