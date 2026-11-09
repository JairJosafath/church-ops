"""Routes for people, teams and their positions, and songs and their arrangements."""

from fastapi import APIRouter, status

from app import catalog, models, store

router = APIRouter()


@router.get("/people")
def list_people(source: store.Injected) -> list[models.Person]:
    """List everyone, by name."""
    return catalog.people(source)


@router.post("/people", status_code=status.HTTP_201_CREATED)
def create_person(body: models.NewPerson, source: store.Injected) -> models.Person:
    """Add a person."""
    return catalog.add_person(source, body)


@router.get("/teams")
def list_teams(source: store.Injected) -> list[models.Team]:
    """List every team with its positions, by name."""
    return catalog.teams(source)


@router.post("/teams", status_code=status.HTTP_201_CREATED)
def create_team(body: models.NewTeam, source: store.Injected) -> models.Team:
    """Add a team."""
    return catalog.add_team(source, body)


@router.post("/teams/{team_id}/positions", status_code=status.HTTP_201_CREATED)
def create_position(
    team_id: models.PathId, body: models.NewPosition, source: store.Injected
) -> models.Position:
    """Add a position to a team; 404 when there is no such team."""
    return catalog.add_position(source, team_id, body)


@router.get("/songs")
def list_songs(source: store.Injected) -> list[models.Song]:
    """List every song with its arrangements, by title."""
    return catalog.songs(source)


@router.post("/songs", status_code=status.HTTP_201_CREATED)
def create_song(body: models.NewSong, source: store.Injected) -> models.Song:
    """Add a song."""
    return catalog.add_song(source, body)


@router.get("/songs/{song_id}")
def read_song(song_id: models.PathId, source: store.Injected) -> models.Song:
    """Return a song with its arrangements; 404 when there is no such song."""
    return catalog.song(source, song_id)


@router.post("/songs/{song_id}/arrangements", status_code=status.HTTP_201_CREATED)
def create_arrangement(
    song_id: models.PathId, body: models.NewArrangement, source: store.Injected
) -> models.Arrangement:
    """Add an arrangement to a song; 404 when there is no such song."""
    return catalog.add_arrangement(source, song_id, body)
