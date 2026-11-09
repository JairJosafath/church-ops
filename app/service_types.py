"""Service types: the recurring kinds of gathering, and the templates new services copy.

A change to a type or its template changes no service planned from it: a service
is a copy (services-and-planning).
"""

import dataclasses
from datetime import time

from app import errors, models, plans, records, store, views


def service_types(source: store.Store) -> list[models.ServiceType]:
    """Return every service type with its template, by name."""
    with source.read() as tx:
        return [views.service_type(tx, t) for t in tx.service_types()]


def add_service_type(source: store.Store, body: models.NewServiceType) -> models.ServiceType:
    """Keep a new service type, with an empty template, and return it."""
    fields = records.ServiceTypeFields(
        name=body.name,
        start_time=time.fromisoformat(body.start_time),
        rehearsal_offset_minutes=body.rehearsal_offset_minutes,
    )
    with source.write() as tx:
        return views.service_type(tx, tx.add_service_type(fields))


def change_service_type(
    source: store.Store, service_type_id: int, body: models.ServiceTypeChanges
) -> models.ServiceType:
    """Change the fields of a service type the body names and return it.

    Raises:
        errors.NotFoundError: when there is no such service type.
    """
    with source.write() as tx:
        old = views.found_service_type(tx, service_type_id)
        fields = old.fields
        new = dataclasses.replace(
            old,
            fields=records.ServiceTypeFields(
                name=fields.name if body.name is None else body.name,
                start_time=fields.start_time
                if body.start_time is None
                else time.fromisoformat(body.start_time),
                rehearsal_offset_minutes=body.rehearsal_offset_minutes
                if "rehearsal_offset_minutes" in body.model_fields_set
                else fields.rehearsal_offset_minutes,
            ),
        )
        tx.update_service_type(new)
        return views.service_type(tx, new)


def set_template(
    source: store.Store, service_type_id: int, body: models.TemplateChanges
) -> models.ServiceType:
    """Replace a service type's template with the body's items and needed positions.

    Each item follows the rules of an item of a service (plans.check_item_fields); a
    needed count of 0 is left out.

    Raises:
        errors.NotFoundError: when there is no such service type, or an item or a need
            names a record that does not exist.
        errors.InvalidError: when an item's fields do not fit its kind.
    """
    items = tuple(plans.item_fields(i) for i in body.items)
    needed = tuple(records.Need(n.position_id, n.count) for n in body.needed if n.count)
    with source.write() as tx:
        service_type = views.found_service_type(tx, service_type_id)
        for fields in items:
            plans.check_item_fields(tx, fields)
        for need in needed:
            if tx.position(need.position_id) is None:
                raise errors.not_found(errors.Kind.POSITION, need.position_id)
        tx.replace_template(service_type_id, records.Template(items=items, needed=needed))
        return views.service_type(tx, service_type)


def template_from_service(
    source: store.Store, service_type_id: int, body: models.TemplateSource
) -> models.ServiceType:
    """Make a service's items and needed positions its type's template, and return the type.

    Raises:
        errors.NotFoundError: when there is no such service type or service.
    """
    with source.write() as tx:
        service_type = views.found_service_type(tx, service_type_id)
        service = views.found_service(tx, body.service_id)
        template = records.Template(
            items=tuple(i.fields for i in tx.items(service.id)),
            needed=tuple(tx.needed(service.id)),
        )
        tx.replace_template(service_type_id, template)
        return views.service_type(tx, service_type)
