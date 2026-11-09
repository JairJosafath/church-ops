"""The clock the api reads the time from, so tests can set it."""

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request

# Returns the current time, timezone-aware.
Clock = Callable[[], datetime]


def system_now() -> datetime:
    """Return the current time from the system clock, in UTC."""
    return datetime.now(UTC)


def get_clock(request: Request) -> Clock:
    """Return the clock the app's lifespan set."""
    clock: Clock = request.app.state.clock
    return clock


# A path operation's parameter for the clock, which tests override through get_clock.
Injected = Annotated[Clock, Depends(get_clock)]
