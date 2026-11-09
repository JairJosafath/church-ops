"""Reports over what was planned, such as the song usage a CCLI licence asks for."""

from collections import Counter
from datetime import date, timedelta

from app import errors, local_time, models, records, store


def song_usage(source: store.Store, first: date, last: date) -> list[models.SongUsage]:
    """Count the song items of each song in the services from first to last, inclusive.

    The dates are Amsterdam's. Songs with no items in the range are left out; the rest
    come most used first, then by title.

    Raises:
        errors.InvalidError: when last is before first.
    """
    if last < first:
        msg = f"to {last} is before from {first}"
        raise errors.InvalidError(msg)
    query = records.SongUseQuery(
        starting=local_time.start_of(first),
        before=local_time.start_of(last + timedelta(days=1)),
    )
    with source.read() as tx:
        counts = Counter(u.song_id for u in tx.song_uses(query))
        found: list[models.SongUsage] = []
        for song_id, count in counts.items():
            song = tx.song(song_id)
            if song is None:
                raise errors.not_found(errors.Kind.SONG, song_id)
            found.append(
                models.SongUsage(
                    song_id=song.id,
                    title=song.title,
                    authors=song.authors,
                    ccli=song.ccli,
                    count=count,
                )
            )
    return sorted(found, key=lambda u: (-u.count, u.title.casefold(), u.song_id))
