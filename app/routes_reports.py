"""Routes for reports."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app import models, reports, store

router = APIRouter()


@router.get("/reports/song-usage")
def song_usage(
    source: store.Injected,
    first: Annotated[date, Query(alias="from", description="The first date, in Amsterdam.")],
    last: Annotated[date, Query(alias="to", description="The last date, in Amsterdam.")],
) -> list[models.SongUsage]:
    """Count each song's items in the services from `from` to `to`, most used first."""
    return reports.song_usage(source, first, last)
