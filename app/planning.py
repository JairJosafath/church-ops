"""The rules of a service's order, as pure functions over records.

Items have lengths and the clock is computed from the service's start: an item
starts when the ones before it have taken their length, so an overrun moves every
item after it. Positions are 0-based and contiguous.
"""

import dataclasses
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

from app import errors, records


def item_starts(starts_at: datetime, lengths: Sequence[int]) -> list[datetime]:
    """Return when each item starts, given the service's start and the items' lengths.

    Args:
        starts_at: when the service starts.
        lengths: each item's length in seconds, in order.

    Returns:
        One time per item, in UTC: starts_at plus the lengths before it. Empty for no
        items. Lengths are elapsed time, so an item across the clock change still
        takes its length.
    """
    base = starts_at.astimezone(UTC)
    starts: list[datetime] = []
    elapsed = 0
    for length in lengths:
        starts.append(base + timedelta(seconds=elapsed))
        elapsed += length
    return starts


def ends_at(starts_at: datetime, total_seconds: int) -> datetime:
    """Return when a service ends, in UTC: its start plus the lengths of all its items."""
    return starts_at.astimezone(UTC) + timedelta(seconds=total_seconds)


# How long a rehearsal from a service type's offset takes, unless the service starts first.
REHEARSAL_LENGTH = timedelta(hours=2)


def rehearsal(starts_at: datetime, offset_minutes: int) -> tuple[datetime, datetime]:
    """Return when the rehearsal a service type's offset gives starts and ends, in UTC.

    It starts offset_minutes before the service and ends when the service starts or
    after REHEARSAL_LENGTH, whichever is first: a warm-up that morning runs up to the
    service, a rehearsal on Thursday evening takes two hours.
    """
    start = starts_at.astimezone(UTC) - timedelta(minutes=offset_minutes)
    return start, min(start + REHEARSAL_LENGTH, starts_at.astimezone(UTC))


def default_off_stream(kind: records.ItemKind) -> bool:
    """Return whether a new item of this kind is off stream when the planner does not say.

    A prayer is: pastoral moments default off stream and are put on stream on purpose
    (streaming-and-obs). Every other kind is on stream.
    """
    return kind is records.ItemKind.PRAYER


def check_item(fields: records.ItemFields) -> None:
    """Check that an item's fields fit its kind.

    A song names an arrangement; no other kind does, nor sets a key of its own or a
    song leader; a header groups items and takes no time.

    Raises:
        errors.InvalidError: saying which rule the fields break.
    """
    is_song = fields.kind is records.ItemKind.SONG
    if is_song and fields.arrangement_id is None:
        msg = "a song item needs an arrangement_id"
        raise errors.InvalidError(msg)
    if not is_song and fields.arrangement_id is not None:
        msg = f"a {fields.kind} item has no arrangement; leave arrangement_id out"
        raise errors.InvalidError(msg)
    if not is_song and fields.key is not None:
        msg = f"a {fields.kind} item has no key; leave key out"
        raise errors.InvalidError(msg)
    if not is_song and fields.song_leader_id is not None:
        msg = f"a {fields.kind} item has no song leader; leave song_leader_id out"
        raise errors.InvalidError(msg)
    if fields.kind is records.ItemKind.HEADER and fields.length_seconds:
        msg = "a header takes no time; its length_seconds must be 0"
        raise errors.InvalidError(msg)


def with_team_notes(
    notes: Sequence[records.TeamNote], changes: Sequence[records.TeamNote]
) -> tuple[records.TeamNote, ...]:
    """Return the notes with the changes made: each change sets its team's note.

    A change with an empty note removes the team's note; the teams the changes leave
    out keep theirs. The result keeps the notes' order, with new teams after them.
    """
    changed = {c.team_id: c for c in changes}
    kept = [changed.pop(n.team_id, n) for n in notes]
    return tuple(n for n in (*kept, *changed.values()) if n.note)


def renumbered(items: Sequence[records.Item]) -> list[records.Item]:
    """Return the items whose position changes when they are numbered 0, 1, 2... in order."""
    return [
        dataclasses.replace(item, position=index)
        for index, item in enumerate(items)
        if item.position != index
    ]


def reordered(items: Sequence[records.Item], item_ids: Sequence[int]) -> list[records.Item]:
    """Return the items in the order item_ids gives.

    Args:
        items: every item of one service.
        item_ids: each of their ids exactly once.

    Raises:
        errors.InvalidError: when item_ids repeats an id, misses one or names another.
    """
    by_id = {item.id: item for item in items}
    if len(set(item_ids)) != len(item_ids):
        msg = "item_ids names an item more than once"
        raise errors.InvalidError(msg)
    if set(item_ids) != set(by_id):
        missing = sorted(set(by_id) - set(item_ids))
        unknown = sorted(set(item_ids) - set(by_id))
        msg = (
            "item_ids must name every item of the service exactly once;"
            f" missing {missing}, not of this service {unknown}"
        )
        raise errors.InvalidError(msg)
    return [by_id[item_id] for item_id in item_ids]
