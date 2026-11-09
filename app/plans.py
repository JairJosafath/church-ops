"""Services and their order: planning, copying and editing them.

A copy has no link back to the service it came from, and no requests. Every change
to the order leaves the positions 0, 1, 2... in order, with no gaps.
"""

import dataclasses
from datetime import date, datetime

from app import errors, local_time, models, planning, records, scheduling, store, views


def services(source: store.Store, starting: date | None) -> list[models.ServiceSummary]:
    """Return the services by start, from the start of a date in Amsterdam, or all when None."""
    with source.read() as tx:
        found = tx.services(None if starting is None else local_time.start_of(starting))
        totals = tx.item_totals([s.id for s in found])
        empty = records.ItemTotals(count=0, length_seconds=0)
        return [views.summary(s, totals.get(s.id, empty)) for s in found]


def service(source: store.Store, service_id: int) -> models.Service:
    """Return a service with its items and requests.

    Raises:
        errors.NotFoundError: when there is no such service.
    """
    with source.read() as tx:
        return views.service(tx, views.found_service(tx, service_id))


def create_service(source: store.Store, body: models.NewService) -> models.Service:
    """Plan a new service, with no items, and return it."""
    fields = records.ServiceFields(
        title=body.title,
        service_type=body.service_type,
        starts_at=body.starts_at,
        streamed=body.streamed,
        auto_switch=False,
    )
    with source.write() as tx:
        return views.service(tx, tx.add_service(fields))


def copy_service(source: store.Store, service_id: int, body: models.ServiceCopy) -> models.Service:
    """Plan a new service with a copy of another's items, at another time; return it.

    Raises:
        errors.NotFoundError: when there is no service to copy.
    """
    with source.write() as tx:
        original = views.found_service(tx, service_id)
        fields = dataclasses.replace(
            original.fields,
            starts_at=body.starts_at,
            title=original.fields.title if body.title is None else body.title,
        )
        copy = tx.add_service(fields)
        for item in tx.items(original.id):
            tx.add_item(copy.id, item.position, item.fields)
        return views.service(tx, copy)


def change_service(
    source: store.Store, service_id: int, body: models.ServiceChanges, now: datetime
) -> models.Service:
    """Change the fields of a service the body names and return it.

    When its start moves, the people scheduled for it are told, and their reminders
    move with it (scheduling.service_moved).

    Raises:
        errors.NotFoundError: when there is no such service.
    """
    with source.write() as tx:
        old = views.found_service(tx, service_id)
        new = dataclasses.replace(
            old, fields=dataclasses.replace(old.fields, **body.model_dump(exclude_unset=True))
        )
        tx.update_service(new)
        if new.fields.starts_at != old.fields.starts_at:
            scheduling.service_moved(tx, new, now)
        return views.service(tx, new)


def _check_arrangement(tx: store.Records, fields: records.ItemFields) -> None:
    planning.check_item(fields)
    if fields.arrangement_id is not None and tx.arrangement(fields.arrangement_id) is None:
        raise errors.not_found(errors.Kind.ARRANGEMENT, fields.arrangement_id)


def _item(tx: store.Records, service: records.Service, item_id: int) -> models.Item:
    return next(i for i in views.items(tx, service) if i.id == item_id)


def _found_item(tx: store.Records, service_id: int, item_id: int) -> records.Item:
    item = tx.item(item_id)
    if item is None or item.service_id != service_id:
        msg = f"item {item_id} not found in service {service_id}"
        raise errors.NotFoundError(msg)
    return item


def add_item(source: store.Store, service_id: int, body: models.NewItem) -> models.Item:
    """Append an item to a service's order and return it.

    Without off_stream in the body, the item takes its kind's default
    (planning.default_off_stream).

    Raises:
        errors.NotFoundError: when there is no such service, or no such arrangement.
        errors.InvalidError: when the fields do not fit the item's kind.
    """
    fields = records.ItemFields(
        kind=body.kind,
        title=body.title,
        length_seconds=body.length_seconds,
        arrangement_id=body.arrangement_id,
        key=body.key,
        scene=body.scene,
        lower_third=body.lower_third,
        off_stream=planning.default_off_stream(body.kind)
        if body.off_stream is None
        else body.off_stream,
        notes=body.notes,
    )
    with source.write() as tx:
        service_record = views.found_service(tx, service_id)
        _check_arrangement(tx, fields)
        item = tx.add_item(service_id, len(tx.items(service_id)), fields)
        return _item(tx, service_record, item.id)


def change_item(
    source: store.Store, service_id: int, item_id: int, body: models.ItemChanges
) -> models.Item:
    """Change the fields of an item the body names and return it.

    Raises:
        errors.NotFoundError: when there is no such service, item of it, or arrangement.
        errors.InvalidError: when the fields, once changed, do not fit the item's kind.
    """
    with source.write() as tx:
        service_record = views.found_service(tx, service_id)
        old = _found_item(tx, service_id, item_id)
        fields = dataclasses.replace(old.fields, **body.model_dump(exclude_unset=True))
        _check_arrangement(tx, fields)
        tx.update_item(dataclasses.replace(old, fields=fields))
        return _item(tx, service_record, item_id)


def delete_item(source: store.Store, service_id: int, item_id: int) -> None:
    """Take an item out of a service's order; the items after it move up.

    Raises:
        errors.NotFoundError: when there is no such service or item of it.
    """
    with source.write() as tx:
        views.found_service(tx, service_id)
        _found_item(tx, service_id, item_id)
        tx.delete_item(item_id)
        for item in planning.renumbered(tx.items(service_id)):
            tx.update_item(item)


def reorder_items(
    source: store.Store, service_id: int, body: models.ItemOrder
) -> list[models.Item]:
    """Put a service's items in the order the body gives and return them.

    Raises:
        errors.NotFoundError: when there is no such service.
        errors.InvalidError: when the body does not name every item exactly once.
    """
    with source.write() as tx:
        service_record = views.found_service(tx, service_id)
        ordered = planning.reordered(tx.items(service_id), body.item_ids)
        for item in planning.renumbered(ordered):
            tx.update_item(item)
        return views.items(tx, service_record)
