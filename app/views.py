"""Turn records into the API's response bodies, looking up what each one names.

Every time is given at Amsterdam's offset. A record a view names is always there
(nothing a view looks up is ever deleted); if one is missing all the same, the view
raises errors.NotFoundError naming it.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta

from app import errors, local_time, models, planning, records, store

# The id of the time every service has of its own, from its start to its end.
SERVICE_TIME_ID = 0

# How far back a song's times_used_12_months counts: the twelve months up to now.
USAGE_WINDOW = timedelta(days=365)


def person(record: records.Person) -> models.Person:
    """Return a person's body."""
    return models.Person(id=record.id, name=record.name, email=record.email)


def position(record: records.Position, members: Sequence[records.Membership]) -> models.Position:
    """Return a position's body, with those of the members given that are its own."""
    return models.Position(
        id=record.id,
        team_id=record.team_id,
        name=record.name,
        member_ids=[m.person_id for m in members if m.position_id == record.id],
    )


def team(
    record: records.Team,
    positions: Sequence[records.Position],
    members: Sequence[records.Membership],
) -> models.Team:
    """Return a team's body with those of the positions given that are its own."""
    return models.Team(
        id=record.id,
        name=record.name,
        positions=[position(p, members) for p in positions if p.team_id == record.id],
    )


def arrangement(record: records.Arrangement) -> models.Arrangement:
    """Return an arrangement's body, with its default key first among its keys."""
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
        keys=[fields.key, *(k for k in fields.keys if k != fields.key)],
        notes=fields.notes,
        audio_url=fields.audio_url,
    )


def song(
    record: records.Song,
    arrangements: Sequence[records.Arrangement],
    uses: Sequence[records.SongUse],
    now: datetime,
) -> models.Song:
    """Return a song's body with those of the arrangements and uses given that are its own.

    last_scheduled_on is the date in Amsterdam of its latest use, past or to come;
    times_used_12_months counts its uses in the USAGE_WINDOW up to now.
    """
    own = [u for u in uses if u.song_id == record.id]
    last = max((u.starts_at for u in own), default=None)
    return models.Song(
        id=record.id,
        title=record.title,
        authors=record.authors,
        ccli=record.ccli,
        arrangements=[arrangement(a) for a in arrangements if a.song_id == record.id],
        tags=list(record.tags),
        last_scheduled_on=None if last is None else local_time.date_of(last),
        times_used_12_months=sum(1 for u in own if now - USAGE_WINDOW <= u.starts_at <= now),
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


def found_service_type(tx: store.Records, service_type_id: int) -> records.ServiceType:
    """Return the service type with this id.

    Raises:
        errors.NotFoundError: when there is none.
    """
    record = tx.service_type(service_type_id)
    if record is None:
        raise errors.not_found(errors.Kind.SERVICE_TYPE, service_type_id)
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


def _song_leader(tx: store.Records, fields: records.ItemFields) -> models.Person | None:
    return (
        None if fields.song_leader_id is None else person(found_person(tx, fields.song_leader_id))
    )


def _team_notes(tx: store.Records, fields: records.ItemFields) -> list[models.TeamNote]:
    """Return an item's notes per team, by team name, then team id."""
    notes: list[models.TeamNote] = []
    for kept in fields.team_notes:
        group = tx.team(kept.team_id)
        if group is None:
            raise errors.not_found(errors.Kind.TEAM, kept.team_id)
        notes.append(models.TeamNote(team_id=group.id, team_name=group.name, note=kept.note))
    return sorted(notes, key=lambda n: (n.team_name.casefold(), n.team_id))


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
            song_leader=_song_leader(tx, item.fields),
            team_notes=_team_notes(tx, item.fields),
        )
        for item, starts_at in zip(kept, starts, strict=True)
    ]


def position_and_team(tx: store.Records, position_id: int) -> tuple[models.Position, str]:
    """Return a position's body and its team's name.

    Raises:
        errors.NotFoundError: when there is no such position, or its team is missing.
    """
    place = tx.position(position_id)
    if place is None:
        raise errors.not_found(errors.Kind.POSITION, position_id)
    group = tx.team(place.team_id)
    if group is None:
        raise errors.not_found(errors.Kind.TEAM, place.team_id)
    return position(place, tx.members(place.id)), group.name


def also_asked(
    tx: store.Records, person_id: int, service_id: int, leaving_out: int | None
) -> list[models.AlsoAsked]:
    """Return a person's open requests at a service, newest first.

    Args:
        tx: the records.
        person_id: whose requests.
        service_id: at which service.
        leaving_out: the id of a request not to list, or None to list them all.
    """
    found = tx.requests(records.RequestQuery(person_id=person_id, service_id=service_id))
    asked: list[models.AlsoAsked] = []
    for other in found:
        if other.id == leaving_out or other.status not in records.OPEN_REQUEST_STATUSES:
            continue
        place, team_name = position_and_team(tx, other.position_id)
        asked.append(models.AlsoAsked(position=place, team_name=team_name, status=other.status))
    return asked


def request(tx: store.Records, record: records.Request) -> models.Request:
    """Return a request's body, with the service, position, team and person it names.

    also_asked is read from the store now: the person's other pending or accepted
    requests at the same service, newest first; empty when there are none.
    """
    service = found_service(tx, record.service_id)
    place, team_name = position_and_team(tx, record.position_id)
    return models.Request(
        id=record.id,
        service_id=service.id,
        service_title=service.fields.title,
        service_starts_at=local_time.local(service.fields.starts_at),
        position=place,
        team_name=team_name,
        person=person(found_person(tx, record.person_id)),
        status=record.status,
        blocked=record.blocked,
        created_at=local_time.local(record.created_at),
        answered_at=None if record.answered_at is None else local_time.local(record.answered_at),
        also_asked=also_asked(tx, record.person_id, record.service_id, record.id),
        decline_reason=record.decline_reason,
    )


def _needed(
    tx: store.Records, record: records.Service, requests: Sequence[records.Request]
) -> list[models.Need]:
    """Return what a service needs, by team name then position id, against its requests."""
    needs: list[models.Need] = []
    for need in tx.needed(record.id):
        place, team_name = position_and_team(tx, need.position_id)
        statuses = [r.status for r in requests if r.position_id == need.position_id]
        accepted = statuses.count(records.RequestStatus.ACCEPTED)
        pending = statuses.count(records.RequestStatus.PENDING)
        needs.append(
            models.Need(
                position=place,
                team_name=team_name,
                count=need.count,
                accepted=accepted,
                pending=pending,
                declined=statuses.count(records.RequestStatus.DECLINED),
                open=max(need.count - accepted - pending, 0),
            )
        )
    return sorted(needs, key=lambda n: (n.team_name.casefold(), n.position.id))


def plan_time(record: records.PlanTime) -> models.PlanTime:
    """Return a time's body."""
    fields = record.fields
    return models.PlanTime(
        id=record.id,
        kind=fields.kind,
        name=fields.name,
        starts_at=local_time.local(fields.starts_at),
        ends_at=local_time.local(fields.ends_at),
    )


def _times(tx: store.Records, record: records.Service, ends: datetime) -> list[models.PlanTime]:
    """Return a service's times by start: its rehearsals, and its own time with id 0."""
    own = records.PlanTime(
        id=SERVICE_TIME_ID,
        service_id=record.id,
        fields=records.PlanTimeFields(
            kind=records.TimeKind.SERVICE,
            name=record.fields.title,
            starts_at=record.fields.starts_at,
            ends_at=ends,
        ),
    )
    kept = sorted([own, *tx.times(record.id)], key=lambda t: (t.fields.starts_at, t.id))
    return [plan_time(t) for t in kept]


def service(tx: store.Records, record: records.Service) -> models.Service:
    """Return a service's body with its items, requests (newest first), needs and times."""
    fields = record.fields
    service_items = items(tx, record)
    total = sum(i.length_seconds for i in service_items)
    ends = planning.ends_at(fields.starts_at, total)
    service_requests = tx.requests(records.RequestQuery(service_id=record.id))
    return models.Service(
        id=record.id,
        title=fields.title,
        service_type=fields.service_type,
        service_type_id=fields.service_type_id,
        series=fields.series,
        starts_at=local_time.local(fields.starts_at),
        streamed=fields.streamed,
        auto_switch=fields.auto_switch,
        items=service_items,
        ends_at=local_time.local(ends),
        requests=[request(tx, r) for r in service_requests],
        needed=_needed(tx, record, service_requests),
        times=_times(tx, record, ends),
    )


def summary(record: records.Service, totals: records.ItemTotals) -> models.ServiceSummary:
    """Return a service's line in a list, from the totals of its items."""
    fields = record.fields
    return models.ServiceSummary(
        id=record.id,
        title=fields.title,
        service_type=fields.service_type,
        service_type_id=fields.service_type_id,
        series=fields.series,
        starts_at=local_time.local(fields.starts_at),
        ends_at=local_time.local(planning.ends_at(fields.starts_at, totals.length_seconds)),
        item_count=totals.count,
    )


def template_item(tx: store.Records, fields: records.ItemFields) -> models.TemplateItem:
    """Return the body of an item of a template."""
    return models.TemplateItem(
        kind=fields.kind,
        title=fields.title,
        length_seconds=fields.length_seconds,
        arrangement_id=fields.arrangement_id,
        key=fields.key,
        scene=fields.scene,
        lower_third=fields.lower_third,
        off_stream=fields.off_stream,
        notes=fields.notes,
        song_leader=_song_leader(tx, fields),
        team_notes=_team_notes(tx, fields),
    )


def service_type(tx: store.Records, record: records.ServiceType) -> models.ServiceType:
    """Return a service type's body, with its template."""
    fields = record.fields
    template = tx.template(record.id)
    return models.ServiceType(
        id=record.id,
        name=fields.name,
        start_time=f"{fields.start_time:%H:%M}",
        rehearsal_offset_minutes=fields.rehearsal_offset_minutes,
        template=models.Template(
            items=[template_item(tx, i) for i in template.items],
            needed=[
                models.TemplateNeed(position_id=n.position_id, count=n.count)
                for n in template.needed
            ],
        ),
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
        item_started_at=None
        if record.item_started_at is None
        else local_time.local(record.item_started_at),
        recorded=[
            models.ItemStart(item_id=s.item_id, started_at=local_time.local(s.started_at))
            for s in tx.item_starts(record.service_id)
        ],
    )
