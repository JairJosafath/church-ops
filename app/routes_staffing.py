"""Routes for staffing: who can fill each position, what a service needs, and who to ask."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app import models, staffing, store

router = APIRouter()


@router.post("/positions/{position_id}/members", status_code=status.HTTP_201_CREATED)
def add_member(
    position_id: models.PathId, body: models.NewMember, source: store.Injected
) -> models.Position:
    """Name a person who can fill the position; 409 when they are a member already."""
    return staffing.add_member(source, position_id, body)


@router.delete(
    "/positions/{position_id}/members/{person_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_member(
    position_id: models.PathId, person_id: models.PathId, source: store.Injected
) -> Response:
    """Forget that a person can fill the position; 404 when they could not."""
    staffing.remove_member(source, position_id, person_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/services/{service_id}/needed")
def set_needed(
    service_id: models.PathId, body: models.NeededChanges, source: store.Injected
) -> models.Service:
    """Set how many people the service needs in each position named; count 0 removes one."""
    return staffing.set_needed(source, service_id, body)


@router.get("/services/{service_id}/candidates")
def list_candidates(
    service_id: models.PathId,
    position_id: Annotated[int, Query(ge=1, le=models.MAX_ID)],
    source: store.Injected,
) -> list[models.Candidate]:
    """List the position's members to ask, those with no warning first, then least served."""
    return staffing.candidates(source, service_id, position_id)
