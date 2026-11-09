"""Routes for scheduling requests, blockouts and the notification outbox."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app import clock, models, records, scheduling, store

router = APIRouter()


@router.post("/services/{service_id}/requests", status_code=status.HTTP_201_CREATED)
def create_request(
    service_id: models.PathId,
    body: models.NewRequest,
    source: store.Injected,
    now: clock.Injected,
) -> models.Request:
    """Ask a person to fill a position; blocked says the date is in one of their blockouts.

    409 when a pending or accepted request already asks them for it.
    """
    return scheduling.create_request(source, service_id, body, now())


@router.get("/requests")
def list_requests(
    source: store.Injected,
    person_id: Annotated[int | None, Query(ge=1, le=models.MAX_ID)] = None,
    service_id: Annotated[int | None, Query(ge=1, le=models.MAX_ID)] = None,
    request_status: Annotated[records.RequestStatus | None, Query(alias="status")] = None,
) -> list[models.Request]:
    """List the requests, newest first, of a person, a service or a status when given."""
    query = records.RequestQuery(person_id=person_id, service_id=service_id, status=request_status)
    return scheduling.requests(source, query)


@router.post("/requests/{request_id}/answer")
def answer_request(
    request_id: models.PathId, body: models.Answer, source: store.Injected, now: clock.Injected
) -> models.Request:
    """Accept or decline a pending request; 409 when it is no longer pending."""
    return scheduling.answer(source, request_id, body, now())


@router.post("/requests/{request_id}/cancel")
def cancel_request(
    request_id: models.PathId, source: store.Injected, now: clock.Injected
) -> models.Request:
    """Withdraw a pending or accepted request; 409 when it was declined or cancelled."""
    return scheduling.cancel(source, request_id, now())


@router.get("/people/{person_id}/blockouts")
def list_blockouts(person_id: models.PathId, source: store.Injected) -> list[models.Blockout]:
    """List a person's blockouts, by start date."""
    return scheduling.blockouts(source, person_id)


@router.post("/people/{person_id}/blockouts", status_code=status.HTTP_201_CREATED)
def create_blockout(
    person_id: models.PathId, body: models.NewBlockout, source: store.Injected
) -> models.Blockout:
    """Block out dates for a person, starts_on to ends_on inclusive."""
    return scheduling.add_blockout(source, person_id, body)


@router.delete("/blockouts/{blockout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_blockout(blockout_id: models.PathId, source: store.Injected) -> Response:
    """Forget a blockout."""
    scheduling.delete_blockout(source, blockout_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/notifications/due")
def list_due_notifications(
    source: store.Injected,
    now: clock.Injected,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> list[models.Notification]:
    """List the notifications due and not yet sent, oldest first."""
    return scheduling.due_notifications(source, now(), limit)


@router.post("/notifications/{notification_id}/sent")
def mark_notification_sent(
    notification_id: models.PathId, source: store.Injected, now: clock.Injected
) -> models.Notification:
    """Record that a notification was sent; 409 when it was sent already."""
    return scheduling.mark_sent(source, notification_id, now())
