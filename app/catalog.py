"""The people, teams and songs a church plans with."""

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
        return [views.team(t, positions) for t in tx.teams()]


def add_team(source: store.Store, body: models.NewTeam) -> models.Team:
    """Keep a new team, with no positions yet, and return it."""
    with source.write() as tx:
        return views.team(tx.add_team(body.name), [])


def add_position(source: store.Store, team_id: int, body: models.NewPosition) -> models.Position:
    """Add a position to a team and return it.

    Raises:
        errors.NotFoundError: when there is no such team.
    """
    with source.write() as tx:
        if tx.team(team_id) is None:
            raise errors.not_found(errors.Kind.TEAM, team_id)
        return views.position(tx.add_position(team_id, body.name))


def songs(source: store.Store) -> list[models.Song]:
    """Return every song with its arrangements, by title."""
    with source.read() as tx:
        arrangements = tx.arrangements(None)
        return [views.song(s, arrangements) for s in tx.songs()]


def song(source: store.Store, song_id: int) -> models.Song:
    """Return one song with its arrangements.

    Raises:
        errors.NotFoundError: when there is no such song.
    """
    with source.read() as tx:
        record = tx.song(song_id)
        if record is None:
            raise errors.not_found(errors.Kind.SONG, song_id)
        return views.song(record, tx.arrangements(song_id))


def add_song(source: store.Store, body: models.NewSong) -> models.Song:
    """Keep a new song, with no arrangements yet, and return it."""
    with source.write() as tx:
        return views.song(tx.add_song(body.title, body.authors, body.ccli), [])


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
    )
    with source.write() as tx:
        if tx.song(song_id) is None:
            raise errors.not_found(errors.Kind.SONG, song_id)
        return views.arrangement(tx.add_arrangement(song_id, fields))
