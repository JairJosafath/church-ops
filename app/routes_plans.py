"""Routes for services and their order of items."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app import clock, models, plans, store

router = APIRouter()


@router.get("/services")
def list_services(
    source: store.Injected,
    starting: Annotated[
        date | None, Query(alias="from", description="Only services on or after this date.")
    ] = None,
) -> list[models.ServiceSummary]:
    """List the services by start, from a date in Amsterdam when `from` is given."""
    return plans.services(source, starting)


@router.post("/services", status_code=status.HTTP_201_CREATED)
def create_service(body: models.NewService, source: store.Injected) -> models.Service:
    """Plan a service, with no items yet."""
    return plans.create_service(source, body)


@router.post("/services/{service_id}/copy", status_code=status.HTTP_201_CREATED)
def copy_service(
    service_id: models.PathId, body: models.ServiceCopy, source: store.Injected
) -> models.Service:
    """Plan a new service with a copy of this one's items, and no requests."""
    return plans.copy_service(source, service_id, body)


@router.get("/services/{service_id}")
def read_service(service_id: models.PathId, source: store.Injected) -> models.Service:
    """Return a service with its items and requests."""
    return plans.service(source, service_id)


@router.patch("/services/{service_id}")
def change_service(
    service_id: models.PathId,
    body: models.ServiceChanges,
    source: store.Injected,
    now: clock.Injected,
) -> models.Service:
    """Change a service's title, start, streaming or automatic switching.

    Moving its start tells the people scheduled for it, and moves their reminders.
    """
    return plans.change_service(source, service_id, body, now())


@router.post("/services/{service_id}/items", status_code=status.HTTP_201_CREATED)
def create_item(
    service_id: models.PathId, body: models.NewItem, source: store.Injected
) -> models.Item:
    """Append an item to a service's order."""
    return plans.add_item(source, service_id, body)


@router.put("/services/{service_id}/items/order")
def reorder_items(
    service_id: models.PathId, body: models.ItemOrder, source: store.Injected
) -> list[models.Item]:
    """Put the items in the order given, which must name each of them exactly once."""
    return plans.reorder_items(source, service_id, body)


@router.patch("/services/{service_id}/items/{item_id}")
def change_item(
    service_id: models.PathId,
    item_id: models.PathId,
    body: models.ItemChanges,
    source: store.Injected,
) -> models.Item:
    """Change an item's fields; key and arrangement_id may be set to null."""
    return plans.change_item(source, service_id, item_id, body)


@router.delete("/services/{service_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    service_id: models.PathId, item_id: models.PathId, source: store.Injected
) -> Response:
    """Take an item out of the order; the items after it move up."""
    plans.delete_item(source, service_id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
