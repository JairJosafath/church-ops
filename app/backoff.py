"""How long the worker waits before its next round."""

MAX_SECONDS = 30.0
"""The longest wait after failed rounds, however many failed in a row.

Short, because a service in live mode must be followed again within
seconds of the api coming back, not minutes."""


def next_delay(failures: int, interval: float) -> float:
    """The seconds to wait before the next round.

    Each failure in a row doubles the wait, up to `MAX_SECONDS`, so a
    dependency that is down is asked less and less often.

    Args:
        failures: The rounds that failed in a row; 0 after a success.
        interval: The wait after a round that succeeded (`POLL_SECONDS`), in seconds.

    Returns:
        `interval` after a success; after failures, `interval` times 2 to the
        power `failures`, at most `MAX_SECONDS` (or `interval`, if that is longer).

    Raises:
        ValueError: When `failures` is negative.
    """
    if failures < 0:
        msg = f"failures must be 0 or more, got {failures}"
        raise ValueError(msg)
    if failures == 0:
        return interval
    # 2.0 ** failures overflows past about 1000 failures; 2 ** 16 intervals is
    # past any cap the worker needs, so the doubling stops there.
    return max(min(interval * 2.0 ** min(failures, 16), MAX_SECONDS), interval)
