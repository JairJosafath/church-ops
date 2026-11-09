"""The people, teams and songs a church plans with."""

import dataclasses
from collections.abc import Callable, Iterable, Sequence
from datetime import datetime

from app import errors, models, records, store, views


def people(source: store.Store) -> list[models.Person]:
    """Return everyone, by name."""
    with source.read() as tx:
        return [views.person(p) for p in tx.people()]


def add_person(source: store.Store, body: models.NewPerson) -> models.Person:
    """Keep a new person and return them."""
    with source.write() as tx:
        return views.person(tx.add_person(body.name, body.email))


def teams(source: store.Store) -> list[models.Team]:
    """Return every team with its positions, by name."""
    with source.read() as tx:
        positions = tx.positions()
        members = tx.members(None)
        return [views.team(t, positions, members) for t in tx.teams()]


def add_team(source: store.Store, body: models.NewTeam) -> models.Team:
    """Keep a new team, with no positions yet, and return it."""
    with source.write() as tx:
        return views.team(tx.add_team(body.name), [], [])


def add_position(source: store.Store, team_id: int, body: models.NewPosition) -> models.Position:
    """Add a position to a team and return it.

    Raises:
        errors.NotFoundError: when there is no such team.
    """
    with source.write() as tx:
        if tx.team(team_id) is None:
            raise errors.not_found(errors.Kind.TEAM, team_id)
        return views.position(tx.add_position(team_id, body.name), [])


def unique[T](values: Iterable[T], key: Callable[[T], object]) -> tuple[T, ...]:
    """Return the values in order, leaving out each one whose key an earlier one has."""
    seen: set[object] = set()
    kept: list[T] = []
    for value in values:
        if key(value) not in seen:
            seen.add(key(value))
            kept.append(value)
    return tuple(kept)


def _tags(tags: Iterable[str]) -> tuple[str, ...]:
    """Return the tags in order, each once, ignoring case."""
    return unique(tags, str.casefold)


def matches(record: records.Song, tags: Sequence[str], words: str | None) -> bool:
    """Return whether a song has every tag (ignoring case) and contains the words.

    The words match, ignoring case, part of the title, the authors or the CCLI number;
    None matches every song.
    """
    own = {t.casefold() for t in record.tags}
    if not all(t.casefold() in own for t in tags):
        return False
    if words is None:
        return True
    needle = words.casefold()
    return any(
        needle in text.casefold() for text in (record.title, record.authors, record.ccli or "")
    )


def songs(
    source: store.Store, tags: Sequence[str], words: str | None, now: datetime
) -> list[models.Song]:
    """Return the songs with every tag given that contain the words, by title.

    An empty tags and None words return every song. Each comes with its arrangements
    and its usage up to now (views.song).
    """
    with source.read() as tx:
        arrangements = tx.arrangements(None)
        uses = tx.song_uses(records.SongUseQuery())
        return [
            views.song(s, arrangements, uses, now) for s in tx.songs() if matches(s, tags, words)
        ]


def _found_song(tx: store.Records, song_id: int) -> records.Song:
    record = tx.song(song_id)
    if record is None:
        raise errors.not_found(errors.Kind.SONG, song_id)
    return record


def _song(tx: store.Records, record: records.Song, now: datetime) -> models.Song:
    uses = tx.song_uses(records.SongUseQuery(song_id=record.id))
    return views.song(record, tx.arrangements(record.id), uses, now)


def song(source: store.Store, song_id: int, now: datetime) -> models.Song:
    """Return one song with its arrangements and its usage up to now.

    Raises:
        errors.NotFoundError: when there is no such song.
    """
    with source.read() as tx:
        return _song(tx, _found_song(tx, song_id), now)


def add_song(source: store.Store, body: models.NewSong, now: datetime) -> models.Song:
    """Keep a new song, with no arrangements yet and never used, and return it."""
    with source.write() as tx:
        record = tx.add_song(body.title, body.authors, body.ccli, _tags(body.tags))
        return views.song(record, [], [], now)


def change_song(
    source: store.Store, song_id: int, body: models.SongChanges, now: datetime
) -> models.Song:
    """Change the fields of a song the body names and return it.

    Raises:
        errors.NotFoundError: when there is no such song.
    """
    with source.write() as tx:
        old = _found_song(tx, song_id)
        new = records.Song(
            id=old.id,
            title=old.title if body.title is None else body.title,
            authors=old.authors if body.authors is None else body.authors,
            ccli=body.ccli if "ccli" in body.model_fields_set else old.ccli,
            tags=old.tags if body.tags is None else _tags(body.tags),
        )
        tx.update_song(new)
        return _song(tx, new, now)


def _keys(default: str, keys: Iterable[str]) -> tuple[str, ...]:
    """Return the keys an arrangement is played in: the default first, each once."""
    return unique((default, *keys), str)


def add_arrangement(
    source: store.Store, song_id: int, body: models.NewArrangement
) -> models.Arrangement:
    """Add an arrangement to a song and return it.

    Raises:
        errors.NotFoundError: when there is no such song.
    """
    fields = records.ArrangementFields(
        name=body.name,
        key=body.key,
        tempo_bpm=body.tempo_bpm,
        meter=body.meter,
        length_seconds=body.length_seconds,
        sequence=body.sequence,
        chart=body.chart,
        keys=_keys(body.key, body.keys),
        notes=body.notes,
        audio_url=body.audio_url,
    )
    with source.write() as tx:
        _found_song(tx, song_id)
        return views.arrangement(tx.add_arrangement(song_id, fields))


def change_arrangement(
    source: store.Store, song_id: int, arrangement_id: int, body: models.ArrangementChanges
) -> models.Arrangement:
    """Change the fields of an arrangement the body names and return it.

    The default key is always among the keys: keys given replace the others, and a
    new default key without keys keeps the old default among them.

    Raises:
        errors.NotFoundError: when there is no such song, or arrangement of it.
    """
    with source.write() as tx:
        _found_song(tx, song_id)
        old = tx.arrangement(arrangement_id)
        if old is None or old.song_id != song_id:
            msg = f"arrangement {arrangement_id} not found in song {song_id}"
            raise errors.NotFoundError(msg)
        changes = body.model_dump(exclude_unset=True, exclude={"keys"})
        fields = dataclasses.replace(old.fields, **changes)
        others = old.fields.keys if body.keys is None else body.keys
        fields = dataclasses.replace(fields, keys=_keys(fields.key, others))
        new = dataclasses.replace(old, fields=fields)
        tx.update_arrangement(new)
        return views.arrangement(new)
