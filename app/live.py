"""Live mode: the run sheet while the service happens, with one current item.

One named person holds live control and is the only one who moves the current item;
control passes only by an explicit handover. Every other screen, and the worker,
follows. The version goes up each time the current item changes, and only then, so
the worker acts on an advance and never on a handover or a device report.
"""

import dataclasses
from datetime import datetime

from app import errors, models, records, store, views


def _found_live(tx: store.Records, service_id: int) -> records.Live:
    live = tx.live(service_id)
    if live is None:
        msg = f"service {service_id} is not live"
        raise errors.NotFoundError(msg)
    return live


def _check_controller(tx: store.Records, live: records.Live, person_id: int) -> None:
    if person_id != live.controller_id:
        holder = views.found_person(tx, live.controller_id)
        msg = (
            f"{holder.name} (person {holder.id}) holds live control of service"
            f" {live.service_id}; person {person_id} does not"
        )
        raise errors.ConflictError(msg)


def lives(source: store.Store) -> list[models.LiveState]:
    """Return the state of every service in live mode, by service id."""
    with source.read() as tx:
        return [views.live_state(tx, live) for live in tx.lives()]


def state(source: store.Store, service_id: int) -> models.LiveState:
    """Return a live service's state.

    Raises:
        errors.NotFoundError: when the service is not live.
    """
    with source.read() as tx:
        return views.live_state(tx, _found_live(tx, service_id))


def start(source: store.Store, service_id: int, body: models.LiveStart) -> models.LiveState:
    """Put a service in live mode at its first item, under the controller's control.

    Raises:
        errors.NotFoundError: when there is no such service or person.
        errors.ConflictError: when the service is live already or has no items.
    """
    with source.write() as tx:
        service = views.found_service(tx, service_id)
        views.found_person(tx, body.controller_id)
        if tx.live(service_id) is not None:
            msg = f"service {service_id} is live already"
            raise errors.ConflictError(msg)
        if not tx.items(service_id):
            msg = f"service {service_id} has no items to run"
            raise errors.ConflictError(msg)
        live = records.Live(
            service_id=service.id,
            controller_id=body.controller_id,
            current_index=0,
            version=1,
            obs=records.DeviceState.UNKNOWN,
            ableton=records.DeviceState.UNKNOWN,
            devices_updated_at=None,
        )
        tx.add_live(live)
        return views.live_state(tx, live)


def advance(source: store.Store, service_id: int, body: models.Advance) -> models.LiveState:
    """Move the current item to another position; the version goes up when it moves.

    Moving back is how an advance is undone.

    Raises:
        errors.NotFoundError: when the service is not live.
        errors.ConflictError: when the person does not hold live control.
        errors.InvalidError: when to_index is past the last item.
    """
    with source.write() as tx:
        live = _found_live(tx, service_id)
        _check_controller(tx, live, body.person_id)
        count = len(tx.items(service_id))
        if body.to_index >= count:
            msg = (
                f"to_index {body.to_index} is out of range; service {service_id} has {count} items"
            )
            raise errors.InvalidError(msg)
        if body.to_index != live.current_index:
            live = dataclasses.replace(live, current_index=body.to_index, version=live.version + 1)
            tx.update_live(live)
        return views.live_state(tx, live)


def handover(source: store.Store, service_id: int, body: models.Handover) -> models.LiveState:
    """Pass live control from its holder to another person; the version stays.

    Raises:
        errors.NotFoundError: when the service is not live, or there is no such person
            to hand over to.
        errors.ConflictError: when from_person_id does not hold live control.
    """
    with source.write() as tx:
        live = _found_live(tx, service_id)
        _check_controller(tx, live, body.from_person_id)
        views.found_person(tx, body.to_person_id)
        live = dataclasses.replace(live, controller_id=body.to_person_id)
        tx.update_live(live)
        return views.live_state(tx, live)


def report_devices(
    source: store.Store, service_id: int, body: models.DeviceReport, now: datetime
) -> models.LiveState:
    """Record what the worker sees of OBS and Ableton, now; the version stays.

    Raises:
        errors.NotFoundError: when the service is not live.
    """
    with source.write() as tx:
        live = dataclasses.replace(
            _found_live(tx, service_id), obs=body.obs, ableton=body.ableton, devices_updated_at=now
        )
        tx.update_live(live)
        return views.live_state(tx, live)


def end(source: store.Store, service_id: int) -> None:
    """End a service's live mode.

    Raises:
        errors.NotFoundError: when the service is not live.
    """
    with source.write() as tx:
        if not tx.delete_live(service_id):
            msg = f"service {service_id} is not live"
            raise errors.NotFoundError(msg)
