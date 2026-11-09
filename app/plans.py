"""Services and their order: planning, copying and editing them, and their times.

A new service starts from its type's template or from a past service, and either
way is a copy, with no link back to where it came from, and no requests. Every
change to the order leaves the positions 0, 1, 2... in order, with no gaps.
"""

import dataclasses
from collections.abc import Sequence
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


# What a rehearsal from a service type's offset is called.
REHEARSAL_NAME = "Rehearsal"


def _from_type(tx: store.Records, body: models.NewService, service_type_id: int) -> models.Service:
    service_type = views.found_service_type(tx, service_type_id)
    type_fields = service_type.fields
    if body.starts_at is not None:
        starts_at = body.starts_at
    elif body.date is not None:
        starts_at = local_time.at(body.date, type_fields.start_time)
    else:
        msg = "give starts_at, or date to start at the service type's start_time"
        raise errors.InvalidError(msg)
    service = tx.add_service(
        records.ServiceFields(
            title=type_fields.name if body.title is None else body.title,
            service_type=type_fields.name,
            starts_at=starts_at,
            streamed=body.streamed,
            auto_switch=False,
            service_type_id=service_type.id,
            series=body.series,
        )
    )
    template = tx.template(service_type.id)
    for position, item_fields in enumerate(template.items):
        tx.add_item(service.id, position, item_fields)
    for need in template.needed:
        tx.set_need(service.id, need)
    if type_fields.rehearsal_offset_minutes is not None:
        rehearsal_start, rehearsal_end = planning.rehearsal(
            starts_at, type_fields.rehearsal_offset_minutes
        )
        tx.add_time(
            service.id,
            records.PlanTimeFields(
                kind=records.TimeKind.REHEARSAL,
                name=REHEARSAL_NAME,
                starts_at=rehearsal_start,
                ends_at=rehearsal_end,
            ),
        )
    return views.service(tx, service)


def create_service(source: store.Store, body: models.NewService) -> models.Service:
    """Plan a new service and return it.

    Without a service type it has no items. With one, it is a copy of the type's
    template (its items and needed positions), with the type's name as its
    service_type, and a rehearsal when the type has a rehearsal offset
    (planning.rehearsal).

    Raises:
        errors.NotFoundError: when there is no such service type.
        errors.InvalidError: when the body gives no time to start at, or, without a
            service type, no title or service_type.
    """
    with source.write() as tx:
        if body.service_type_id is not None:
            return _from_type(tx, body, body.service_type_id)
        if body.title is None or body.service_type is None or body.starts_at is None:
            msg = "without a service_type_id, title, service_type and starts_at must be given"
            raise errors.InvalidError(msg)
        fields = records.ServiceFields(
            title=body.title,
            service_type=body.service_type,
            starts_at=body.starts_at,
            streamed=body.streamed,
            auto_switch=False,
            service_type_id=None,
            series=body.series,
        )
        return views.service(tx, tx.add_service(fields))


def copy_service(source: store.Store, service_id: int, body: models.ServiceCopy) -> models.Service:
    """Plan a new service as a copy of another, at another time; return it.

    The copy has the original's items, needed positions, type and series, and its
    rehearsals moved by as much as the start moved; it has no requests.

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
        for need in tx.needed(original.id):
            tx.set_need(copy.id, need)
        moved_by = body.starts_at - original.fields.starts_at
        for kept in tx.times(original.id):
            tx.add_time(
                copy.id,
                dataclasses.replace(
                    kept.fields,
                    starts_at=kept.fields.starts_at + moved_by,
                    ends_at=kept.fields.ends_at + moved_by,
                ),
            )
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


def check_item_fields(tx: store.Records, fields: records.ItemFields) -> None:
    """Check that an item's fields fit its kind and name records that exist.

    Raises:
        errors.InvalidError: when the fields do not fit the kind (planning.check_item).
        errors.NotFoundError: when the arrangement, song leader or a team named does
            not exist.
    """
    planning.check_item(fields)
    if fields.arrangement_id is not None and tx.arrangement(fields.arrangement_id) is None:
        raise errors.not_found(errors.Kind.ARRANGEMENT, fields.arrangement_id)
    if fields.song_leader_id is not None:
        views.found_person(tx, fields.song_leader_id)
    for note in fields.team_notes:
        if tx.team(note.team_id) is None:
            raise errors.not_found(errors.Kind.TEAM, note.team_id)


def _team_notes(changes: Sequence[models.TeamNoteChange]) -> tuple[records.TeamNote, ...]:
    return tuple(records.TeamNote(team_id=c.team_id, note=c.note) for c in changes)


def item_fields(body: models.NewItem) -> records.ItemFields:
    """Return the fields of a new item; off_stream left out takes the kind's default.

    Empty team notes are left out.
    """
    return records.ItemFields(
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
        song_leader_id=body.song_leader_id,
        team_notes=planning.with_team_notes((), _team_notes(body.team_notes)),
    )


def _with_last_notes(
    tx: store.Records, service: records.Service, body: models.NewItem, fields: records.ItemFields
) -> records.ItemFields:
    """Return a song's fields with the notes the body leaves out copied from last time.

    Last time is the song's most recent item in a service that starts before this one;
    a song never planned before keeps its fields as they are.
    """
    copy_notes = "notes" not in body.model_fields_set
    copy_team_notes = "team_notes" not in body.model_fields_set
    if fields.arrangement_id is None or not (copy_notes or copy_team_notes):
        return fields
    arrangement = tx.arrangement(fields.arrangement_id)
    if arrangement is None:
        raise errors.not_found(errors.Kind.ARRANGEMENT, fields.arrangement_id)
    uses = tx.song_uses(
        records.SongUseQuery(song_id=arrangement.song_id, before=service.fields.starts_at)
    )
    last = None if not uses else tx.item(uses[-1].item_id)
    if last is None:
        return fields
    return dataclasses.replace(
        fields,
        notes=last.fields.notes if copy_notes else fields.notes,
        team_notes=last.fields.team_notes if copy_team_notes else fields.team_notes,
    )


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
    (planning.default_off_stream). A song without notes, or without team_notes, in the
    body copies them from the song's most recent item in an earlier service.

    Raises:
        errors.NotFoundError: when there is no such service, or no such arrangement,
            song leader or team.
        errors.InvalidError: when the fields do not fit the item's kind.
    """
    with source.write() as tx:
        service_record = views.found_service(tx, service_id)
        fields = item_fields(body)
        check_item_fields(tx, fields)
        fields = _with_last_notes(tx, service_record, body, fields)
        item = tx.add_item(service_id, len(tx.items(service_id)), fields)
        return _item(tx, service_record, item.id)


def change_item(
    source: store.Store, service_id: int, item_id: int, body: models.ItemChanges
) -> models.Item:
    """Change the fields of an item the body names and return it.

    team_notes set the notes of the teams they name, an empty note removing one; the
    other teams' notes stay.

    Raises:
        errors.NotFoundError: when there is no such service, item of it, arrangement,
            song leader or team.
        errors.InvalidError: when the fields, once changed, do not fit the item's kind.
    """
    with source.write() as tx:
        service_record = views.found_service(tx, service_id)
        old = _found_item(tx, service_id, item_id)
        fields = dataclasses.replace(
            old.fields, **body.model_dump(exclude_unset=True, exclude={"team_notes"})
        )
        if body.team_notes is not None:
            fields = dataclasses.replace(
                fields,
                team_notes=planning.with_team_notes(
                    fields.team_notes, _team_notes(body.team_notes)
                ),
            )
        check_item_fields(tx, fields)
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


def add_time(source: store.Store, service_id: int, body: models.NewPlanTime) -> models.PlanTime:
    """Add a rehearsal to a service's plan and return it.

    Raises:
        errors.NotFoundError: when there is no such service.
    """
    fields = records.PlanTimeFields(
        kind=body.kind, name=body.name, starts_at=body.starts_at, ends_at=body.ends_at
    )
    with source.write() as tx:
        views.found_service(tx, service_id)
        return views.plan_time(tx.add_time(service_id, fields))


def delete_time(source: store.Store, service_id: int, time_id: int) -> None:
    """Take a rehearsal out of a service's plan.

    Raises:
        errors.NotFoundError: when there is no such service, or time of it.
        errors.ConflictError: when time_id is 0, the service's own time, which is read-only.
    """
    with source.write() as tx:
        views.found_service(tx, service_id)
        if time_id == views.SERVICE_TIME_ID:
            msg = (
                f"time {time_id} is service {service_id}'s own time and read-only;"
                " change the service's starts_at or items instead"
            )
            raise errors.ConflictError(msg)
        if not tx.delete_time(service_id, time_id):
            msg = f"time {time_id} not found in service {service_id}"
            raise errors.NotFoundError(msg)
