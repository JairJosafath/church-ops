"""The church's own time zone, Europe/Amsterdam, which dates and shown times are in.

A service's date is its date in Amsterdam, and every time the api answers with is
given at Amsterdam's offset of that moment, so a service in the week the clocks
change starts when people think it does.
"""

from datetime import date, datetime, time
from zoneinfo import ZoneInfo

ZONE_NAME = "Europe/Amsterdam"


def zone() -> ZoneInfo:
    """Return the church's time zone; zoneinfo caches it after the first call."""
    return ZoneInfo(ZONE_NAME)


def local(moment: datetime) -> datetime:
    """Return the same moment at Amsterdam's offset."""
    return moment.astimezone(zone())


def date_of(moment: datetime) -> date:
    """Return the date it is in Amsterdam at this moment."""
    return local(moment).date()


def start_of(day: date) -> datetime:
    """Return midnight at the start of this date in Amsterdam."""
    return datetime.combine(day, time(), tzinfo=zone())
