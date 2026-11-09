"""Staffing a service: who can fill each position, what the service needs, and who to ask.

The candidates for a position are its members, each with the warnings a scheduler
weighs (a blockout, a request elsewhere that day, a decline at this service, how
often they served lately). A warning never refuses a request: the scheduler decides,
and the person still answers (people-and-teams).
"""

from collections.abc import Sequence
from datetime import date, timedelta

from app import errors, local_time, models, records, store, views

# How far back a candidate's serving is counted, before the service they are asked for.
SERVED_WINDOW = timedelta(days=90)


def _found_position(tx: store.Records, position_id: int) -> records.Position:
    position = tx.position(position_id)
    if position is None:
        raise errors.not_found(errors.Kind.POSITION, position_id)
    return position


def add_member(source: store.Store, position_id: int, body: models.NewMember) -> models.Position:
    """Record that a person can fill a position, and return the position.

    Raises:
        errors.NotFoundError: when there is no such position or person.
        errors.ConflictError: when the person is a member of the position already.
    """
    with source.write() as tx:
        position = _found_position(tx, position_id)
        views.found_person(tx, body.person_id)
        membership = records.Membership(position_id=position_id, person_id=body.person_id)
        if membership in tx.members(position_id):
            msg = f"person {body.person_id} is a member of position {position_id} already"
            raise errors.ConflictError(msg)
        tx.add_member(membership)
        return views.position(position, tx.members(position_id))


def remove_member(source: store.Store, position_id: int, person_id: int) -> None:
    """Forget that a person can fill a position; requests already sent stay.

    Raises:
        errors.NotFoundError: when there is no such position, or the person is not a
            member of it.
    """
    with source.write() as tx:
        _found_position(tx, position_id)
        membership = records.Membership(position_id=position_id, person_id=person_id)
        if not tx.delete_member(membership):
            msg = f"person {person_id} is not a member of position {position_id}"
            raise errors.NotFoundError(msg)


def set_needed(source: store.Store, service_id: int, body: models.NeededChanges) -> models.Service:
    """Set how many people a service needs in the positions named, and return the service.

    A count of 0 forgets a need; the positions the body leaves out keep theirs.

    Raises:
        errors.NotFoundError: when there is no such service, or no such position.
    """
    with source.write() as tx:
        service = views.found_service(tx, service_id)
        for needed in body.needed:
            _found_position(tx, needed.position_id)
            tx.set_need(service_id, records.Need(needed.position_id, needed.count))
        return views.service(tx, service)


def has_warning(candidate: models.Candidate) -> bool:
    """Return whether a scheduler should look twice before asking this candidate.

    A candidate is warned about when they are blocked out, asked or serving elsewhere
    that day, asked here already, or declined here.
    """
    return (
        candidate.blocked
        or bool(candidate.conflicts)
        or bool(candidate.also_asked)
        or candidate.declined_here
    )


def in_asking_order(found: Sequence[models.Candidate]) -> list[models.Candidate]:
    """Return candidates with no warning first, then by fewest times served, then by name."""
    return sorted(
        found,
        key=lambda c: (
            has_warning(c),
            c.times_served_90_days,
            c.person.name.casefold(),
            c.person.id,
        ),
    )


def _conflicts(
    tx: store.Records,
    service: records.Service,
    day: date,
    requests: Sequence[records.Request],
) -> list[models.Conflict]:
    """Return the open requests at other services on the same day, by their start."""
    conflicts: list[tuple[records.Service, models.Conflict]] = []
    for request in requests:
        if request.service_id == service.id or request.status not in records.OPEN_REQUEST_STATUSES:
            continue
        other = views.found_service(tx, request.service_id)
        if local_time.date_of(other.fields.starts_at) != day:
            continue
        place, team_name = views.position_and_team(tx, request.position_id)
        conflict = models.Conflict(
            service_id=other.id,
            service_title=other.fields.title,
            starts_at=local_time.local(other.fields.starts_at),
            team_name=team_name,
            position_name=place.name,
            status=request.status,
        )
        conflicts.append((other, conflict))
    conflicts.sort(key=lambda pair: (pair[0].fields.starts_at, pair[0].id))
    return [conflict for _, conflict in conflicts]


def _candidate(
    tx: store.Records, service: records.Service, person: records.Person
) -> models.Candidate:
    starts_at = service.fields.starts_at
    day = local_time.date_of(starts_at)
    covering = [b for b in tx.blockouts(person.id) if b.starts_on <= day <= b.ends_on]
    requests = tx.requests(records.RequestQuery(person_id=person.id))
    served: dict[int, records.Service] = {}
    for request in requests:
        if request.status is records.RequestStatus.ACCEPTED and request.service_id != service.id:
            other = views.found_service(tx, request.service_id)
            if other.fields.starts_at < starts_at:
                served[other.id] = other
    last = max((s.fields.starts_at for s in served.values()), default=None)
    return models.Candidate(
        person=views.person(person),
        blocked=bool(covering),
        also_asked=views.also_asked(tx, person.id, service.id, None),
        conflicts=_conflicts(tx, service, day, requests),
        declined_here=any(
            r.service_id == service.id and r.status is records.RequestStatus.DECLINED
            for r in requests
        ),
        last_served_on=None if last is None else local_time.date_of(last),
        times_served_90_days=sum(
            1 for s in served.values() if s.fields.starts_at >= starts_at - SERVED_WINDOW
        ),
    )


def candidates(source: store.Store, service_id: int, position_id: int) -> list[models.Candidate]:
    """Return the members of a position as candidates to ask for it at a service.

    Each comes with its warnings (models.Candidate), in asking order (in_asking_order).
    Empty when the position has no members.

    Raises:
        errors.NotFoundError: when there is no such service or position.
    """
    with source.read() as tx:
        service = views.found_service(tx, service_id)
        _found_position(tx, position_id)
        found = [
            _candidate(tx, service, views.found_person(tx, m.person_id))
            for m in tx.members(position_id)
        ]
        return in_asking_order(found)
