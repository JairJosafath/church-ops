"""Turn records into the API's response bodies, looking up what each one names.

Every time is given at Amsterdam's offset. A record a view names is always there
(nothing a view looks up is ever deleted); if one is missing all the same, the view
raises errors.NotFoundError naming it.
"""

from collections.abc import Sequence

from app import errors, local_time, models, planning, records, store


def person(record: records.Person) -> models.Person:
    """Return a person's body."""
    return models.Person(id=record.id, name=record.name, email=record.email)


def position(record: records.Position) -> models.Position:
    """Return a position's body."""
    return models.Position(id=record.id, team_id=record.team_id, name=record.name)


def team(record: records.Team, positions: Sequence[records.Position]) -> models.Team:
    """Return a team's body with those of the positions given that are its own."""
    return models.Team(
        id=record.id,
        name=record.name,
        positions=[position(p) for p in positions if p.team_id == record.id],
    )


def arrangement(record: records.Arrangement) -> models.Arrangement:
    """Return an arrangement's body."""
    fields = record.fields
    return models.Arrangement(
        id=record.id,
        song_id=record.song_id,
        name=fields.name,
        key=fields.key,
        tempo_bpm=fields.tempo_bpm,
        meter=fields.meter,
        length_seconds=fields.length_seconds,
        sequence=fields.sequence,
        chart=fields.chart,
    )


def song(record: records.Song, arrangements: Sequence[records.Arrangement]) -> models.Song:
    """Return a song's body with those of the arrangements given that are its own."""
    return models.Song(
        id=record.id,
        title=record.title,
        authors=record.authors,
        ccli=record.ccli,
        arrangements=[arrangement(a) for a in arrangements if a.song_id == record.id],
    )


def blockout(record: records.Blockout) -> models.Blockout:
    """Return a blockout's body."""
    return models.Blockout(
        id=record.id,
        person_id=record.person_id,
        starts_on=record.starts_on,
        ends_on=record.ends_on,
        reason=record.reason,
    )


def found_person(tx: store.Records, person_id: int) -> records.Person:
    """Return the person with this id.

    Raises:
        errors.NotFoundError: when there is none.
    """
    record = tx.person(person_id)
    if record is None:
        raise errors.not_found(errors.Kind.PERSON, person_id)
    return record


def found_service(tx: store.Records, service_id: int) -> records.Service:
    """Return the service with this id.

    Raises:
        errors.NotFoundError: when there is none.
    """
    record = tx.service(service_id)
    if record is None:
        raise errors.not_found(errors.Kind.SERVICE, service_id)
    return record


def _item_arrangement(
    tx: store.Records, arrangement_id: int, key: str | None
) -> models.ItemArrangement:
    record = tx.arrangement(arrangement_id)
    if record is None:
        raise errors.not_found(errors.Kind.ARRANGEMENT, arrangement_id)
    work = tx.song(record.song_id)
    if work is None:
        raise errors.not_found(errors.Kind.SONG, record.song_id)
    fields = record.fields
    return models.ItemArrangement(
        id=record.id,
        song_title=work.title,
        name=fields.name,
        key=fields.key if key is None else key,
        tempo_bpm=fields.tempo_bpm,
        meter=fields.meter,
        sequence=fields.sequence,
        chart=fields.chart,
    )


def items(tx: store.Records, service: records.Service) -> list[models.Item]:
    """Return the bodies of a service's items, in order, each with its start time."""
    kept = tx.items(service.id)
    starts = planning.item_starts(service.fields.starts_at, [i.fields.length_seconds for i in kept])
    return [
        models.Item(
            id=item.id,
            service_id=item.service_id,
            position=item.position,
            kind=item.fields.kind,
            title=item.fields.title,
            length_seconds=item.fields.length_seconds,
            starts_at=local_time.local(starts_at),
            arrangement=None
            if item.fields.arrangement_id is None
            else _item_arrangement(tx, item.fields.arrangement_id, item.fields.key),
            key=item.fields.key,
            scene=item.fields.scene,
            lower_third=item.fields.lower_third,
            off_stream=item.fields.off_stream,
            notes=item.fields.notes,
        )
        for item, starts_at in zip(kept, starts, strict=True)
    ]


def _position_and_team(
    tx: store.Records, position_id: int
) -> tuple[records.Position, records.Team]:
    place = tx.position(position_id)
    if place is None:
        raise errors.not_found(errors.Kind.POSITION, position_id)
    group = tx.team(place.team_id)
    if group is None:
        raise errors.not_found(errors.Kind.TEAM, place.team_id)
    return place, group


def _also_asked(tx: store.Records, record: records.Request) -> list[models.AlsoAsked]:
    """Return the person's other open requests at the request's service, newest first."""
    others = tx.requests(
        records.RequestQuery(person_id=record.person_id, service_id=record.service_id)
    )
    asked: list[models.AlsoAsked] = []
    for other in others:
        if other.id == record.id or other.status not in records.OPEN_REQUEST_STATUSES:
            continue
        place, group = _position_and_team(tx, other.position_id)
        asked.append(
            models.AlsoAsked(position=position(place), team_name=group.name, status=other.status)
        )
    return asked


def request(tx: store.Records, record: records.Request) -> models.Request:
    """Return a request's body, with the service, position, team and person it names.

    also_asked is read from the store now: the person's other pending or accepted
    requests at the same service, newest first; empty when there are none.
    """
    service = found_service(tx, record.service_id)
    place, group = _position_and_team(tx, record.position_id)
    return models.Request(
        id=record.id,
        service_id=service.id,
        service_title=service.fields.title,
        service_starts_at=local_time.local(service.fields.starts_at),
        position=position(place),
        team_name=group.name,
        person=person(found_person(tx, record.person_id)),
        status=record.status,
        blocked=record.blocked,
        created_at=local_time.local(record.created_at),
        answered_at=None if record.answered_at is None else local_time.local(record.answered_at),
        also_asked=_also_asked(tx, record),
    )


def service(tx: store.Records, record: records.Service) -> models.Service:
    """Return a service's body with its items and its requests, newest first."""
    fields = record.fields
    service_items = items(tx, record)
    total = sum(i.length_seconds for i in service_items)
    return models.Service(
        id=record.id,
        title=fields.title,
        service_type=fields.service_type,
        starts_at=local_time.local(fields.starts_at),
        streamed=fields.streamed,
        auto_switch=fields.auto_switch,
        items=service_items,
        ends_at=local_time.local(planning.ends_at(fields.starts_at, total)),
        requests=[request(tx, r) for r in tx.requests(records.RequestQuery(service_id=record.id))],
    )


def summary(record: records.Service, totals: records.ItemTotals) -> models.ServiceSummary:
    """Return a service's line in a list, from the totals of its items."""
    fields = record.fields
    return models.ServiceSummary(
        id=record.id,
        title=fields.title,
        service_type=fields.service_type,
        starts_at=local_time.local(fields.starts_at),
        ends_at=local_time.local(planning.ends_at(fields.starts_at, totals.length_seconds)),
        item_count=totals.count,
    )


def notification(tx: store.Records, record: records.Notification) -> models.Notification:
    """Return a notification's body, with the person it is for."""
    return models.Notification(
        id=record.id,
        person=person(found_person(tx, record.person_id)),
        kind=record.kind,
        text=record.text,
        due_at=local_time.local(record.due_at),
        sent_at=None if record.sent_at is None else local_time.local(record.sent_at),
    )


def live_state(tx: store.Records, record: records.Live) -> models.LiveState:
    """Return a live service's state, with its current and next item."""
    service = found_service(tx, record.service_id)
    service_items = items(tx, service)
    index = record.current_index
    return models.LiveState(
        service_id=service.id,
        service_title=service.fields.title,
        auto_switch=service.fields.auto_switch,
        streamed=service.fields.streamed,
        current_index=index,
        version=record.version,
        controller=person(found_person(tx, record.controller_id)),
        current=service_items[index] if index < len(service_items) else None,
        next=service_items[index + 1] if index + 1 < len(service_items) else None,
        devices=models.Devices(
            obs=record.obs,
            ableton=record.ableton,
            updated_at=None
            if record.devices_updated_at is None
            else local_time.local(record.devices_updated_at),
        ),
    )
