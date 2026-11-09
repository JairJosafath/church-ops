"""Scheduling people: requests, their answers, blockouts, and the notifications they cause.

A request is an invitation, and only an accepted one schedules the person. A
blockout is the person's word: a request on a blocked-out date is still sent, marked
blocked, and the person decides; its reason never leaves the blockout. Notifications
go to an outbox the worker delivers from, and say what the person needs and no more:
the position, the team, the service and its time.
"""

import dataclasses
from collections.abc import Sequence
from datetime import date, datetime, timedelta

from app import errors, local_time, models, records, store, views

# How long before a service a scheduled person is reminded of it, by default a
# week and a day (chat-and-notifications).
REMINDERS_BEFORE = (timedelta(days=7), timedelta(days=1))


def is_blocked(service_date: date, blockouts: Sequence[records.Blockout]) -> bool:
    """Return whether a date falls inside any of the blockouts, their end dates included."""
    return any(b.starts_on <= service_date <= b.ends_on for b in blockouts)


def reminder_times(starts_at: datetime, now: datetime) -> list[datetime]:
    """Return when to remind a scheduled person of a service, leaving out times past.

    A reminder a week before is at the same clock time in Amsterdam a week earlier,
    across a change of the clocks too.

    Args:
        starts_at: when the service starts.
        now: the current time; only reminders after it are returned.

    Returns:
        The reminder times, earliest first; empty when they are all past.
    """
    local_start = local_time.local(starts_at)
    due = sorted(local_start - before for before in REMINDERS_BEFORE)
    return [moment for moment in due if moment > now]


def _what(tx: store.Records, request: records.Request) -> str:
    """Describe what a request asks for, such as "Drums (Worship band) at Sunday ..."."""
    service = views.found_service(tx, request.service_id)
    position = tx.position(request.position_id)
    if position is None:
        raise errors.not_found(errors.Kind.POSITION, request.position_id)
    team = tx.team(position.team_id)
    if team is None:
        raise errors.not_found(errors.Kind.TEAM, position.team_id)
    starts = local_time.local(service.fields.starts_at)
    return f"{position.name} ({team.name}) at {service.fields.title} on {starts:%Y-%m-%d %H:%M}"


def _notify(
    tx: store.Records,
    request: records.Request,
    kind: records.NotificationKind,
    text: str,
    due_at: datetime,
) -> None:
    tx.add_notification(
        records.NotificationDraft(
            person_id=request.person_id,
            request_id=request.id,
            kind=kind,
            text=text,
            due_at=due_at,
        )
    )


def _queue_reminders(tx: store.Records, request: records.Request, now: datetime) -> None:
    service = views.found_service(tx, request.service_id)
    text = f"Reminder: you serve as {_what(tx, request)}."
    for due_at in reminder_times(service.fields.starts_at, now):
        _notify(tx, request, records.NotificationKind.REMINDER, text, due_at)


def _found_request(tx: store.Records, request_id: int) -> records.Request:
    request = tx.request(request_id)
    if request is None:
        raise errors.not_found(errors.Kind.REQUEST, request_id)
    return request


def requests(source: store.Store, query: records.RequestQuery) -> list[models.Request]:
    """Return the requests the query matches, newest first."""
    with source.read() as tx:
        return [views.request(tx, r) for r in tx.requests(query)]


def create_request(
    source: store.Store, service_id: int, body: models.NewRequest, now: datetime
) -> models.Request:
    """Ask a person to fill a position at a service, and queue the request's notification.

    The scheduler, when the body names one, is kept on record and told if the person
    later withdraws.

    Raises:
        errors.NotFoundError: when there is no such service, position, person or scheduler.
        errors.ConflictError: when a pending or accepted request already asks the
            person for that position at that service.
    """
    with source.write() as tx:
        service = views.found_service(tx, service_id)
        if tx.position(body.position_id) is None:
            raise errors.not_found(errors.Kind.POSITION, body.position_id)
        views.found_person(tx, body.person_id)
        if body.scheduler_id is not None:
            views.found_person(tx, body.scheduler_id)
        for other in tx.requests(
            records.RequestQuery(person_id=body.person_id, service_id=service_id)
        ):
            if (
                other.position_id == body.position_id
                and other.status in records.OPEN_REQUEST_STATUSES
            ):
                msg = (
                    f"person {body.person_id} already has a {other.status} request"
                    f" ({other.id}) for position {body.position_id} at service {service_id}"
                )
                raise errors.ConflictError(msg)
        blocked = is_blocked(
            local_time.date_of(service.fields.starts_at), tx.blockouts(body.person_id)
        )
        request = tx.add_request(
            records.RequestDraft(
                service_id=service_id,
                position_id=body.position_id,
                person_id=body.person_id,
                blocked=blocked,
                created_at=now,
                scheduler_id=body.scheduler_id,
            )
        )
        text = f"You are asked to serve as {_what(tx, request)}. Please accept or decline."
        _notify(tx, request, records.NotificationKind.REQUEST, text, now)
        return views.request(tx, request)


def answer(
    source: store.Store, request_id: int, body: models.Answer, now: datetime
) -> models.Request:
    """Accept or decline a pending request; accepting queues the reminders still to come.

    A decline keeps the reason the body gives, if any, for the scheduler to read; it
    goes into no notification.

    Raises:
        errors.NotFoundError: when there is no such request.
        errors.ConflictError: when the request is no longer pending.
    """
    with source.write() as tx:
        request = _found_request(tx, request_id)
        if request.status is not records.RequestStatus.PENDING:
            msg = f"request {request_id} is {request.status}, not pending; it cannot be answered"
            raise errors.ConflictError(msg)
        status = records.RequestStatus.ACCEPTED if body.accept else records.RequestStatus.DECLINED
        answered = dataclasses.replace(
            request, status=status, answered_at=now, decline_reason=body.reason or ""
        )
        tx.update_request(answered)
        if body.accept:
            _queue_reminders(tx, answered, now)
        return views.request(tx, answered)


def cancel(source: store.Store, request_id: int, now: datetime) -> models.Request:
    """Withdraw a pending or accepted request, queue its cancellation and drop its reminders.

    Raises:
        errors.NotFoundError: when there is no such request.
        errors.ConflictError: when the request was declined or cancelled already.
    """
    with source.write() as tx:
        request = _found_request(tx, request_id)
        if request.status not in records.OPEN_REQUEST_STATUSES:
            msg = f"request {request_id} is {request.status}; only an open one can be cancelled"
            raise errors.ConflictError(msg)
        cancelled = dataclasses.replace(request, status=records.RequestStatus.CANCELLED)
        tx.update_request(cancelled)
        tx.delete_unsent(request_id, records.NotificationKind.REMINDER)
        text = f"Cancelled: you are no longer asked to serve as {_what(tx, cancelled)}."
        _notify(tx, cancelled, records.NotificationKind.CANCELLATION, text, now)
        return views.request(tx, cancelled)


def withdraw(
    source: store.Store, request_id: int, body: models.Withdrawal, now: datetime
) -> models.Request:
    """Decline an accepted request after all, and tell the scheduler on record.

    The request becomes declined, answered now, with the reason the body gives; its
    reminders not yet sent are dropped. A change notification, due now, goes to the
    scheduler who sent the request; with no scheduler on record none is queued, and
    the plan shows the decline. The reason goes into no notification.

    Raises:
        errors.NotFoundError: when there is no such request.
        errors.ConflictError: when the request is not accepted.
    """
    with source.write() as tx:
        request = _found_request(tx, request_id)
        if request.status is not records.RequestStatus.ACCEPTED:
            msg = (
                f"request {request_id} is {request.status}; only an accepted request can be"
                " withdrawn (answer a pending one instead)"
            )
            raise errors.ConflictError(msg)
        withdrawn = dataclasses.replace(
            request,
            status=records.RequestStatus.DECLINED,
            answered_at=now,
            decline_reason=body.reason,
        )
        tx.update_request(withdrawn)
        tx.delete_unsent(request_id, records.NotificationKind.REMINDER)
        if withdrawn.scheduler_id is not None:
            person = views.found_person(tx, withdrawn.person_id)
            tx.add_notification(
                records.NotificationDraft(
                    person_id=withdrawn.scheduler_id,
                    request_id=withdrawn.id,
                    kind=records.NotificationKind.CHANGE,
                    text=f"Withdrawn: {person.name} can no longer serve as {_what(tx, withdrawn)}.",
                    due_at=now,
                )
            )
        return views.request(tx, withdrawn)


def service_moved(tx: store.Records, service: records.Service, now: datetime) -> None:
    """Tell the people scheduled for a service that it moved, and remind them at the new time.

    Their reminders not yet sent are replaced by ones for the new start.
    """
    accepted = tx.requests(
        records.RequestQuery(service_id=service.id, status=records.RequestStatus.ACCEPTED)
    )
    for request in accepted:
        tx.delete_unsent(request.id, records.NotificationKind.REMINDER)
        _queue_reminders(tx, request, now)
        text = f"Changed: you now serve as {_what(tx, request)}."
        _notify(tx, request, records.NotificationKind.CHANGE, text, now)


def blockouts(source: store.Store, person_id: int) -> list[models.Blockout]:
    """Return a person's blockouts, by start date.

    Raises:
        errors.NotFoundError: when there is no such person.
    """
    with source.read() as tx:
        views.found_person(tx, person_id)
        return [views.blockout(b) for b in tx.blockouts(person_id)]


def add_blockout(source: store.Store, person_id: int, body: models.NewBlockout) -> models.Blockout:
    """Block out dates for a person and return the blockout.

    Requests already sent keep the blocked flag they were sent with.

    Raises:
        errors.NotFoundError: when there is no such person.
    """
    with source.write() as tx:
        views.found_person(tx, person_id)
        draft = records.BlockoutDraft(
            person_id=person_id,
            starts_on=body.starts_on,
            ends_on=body.ends_on,
            reason=body.reason,
        )
        return views.blockout(tx.add_blockout(draft))


def delete_blockout(source: store.Store, blockout_id: int) -> None:
    """Forget a blockout.

    Raises:
        errors.NotFoundError: when there is no such blockout.
    """
    with source.write() as tx:
        if not tx.delete_blockout(blockout_id):
            raise errors.not_found(errors.Kind.BLOCKOUT, blockout_id)


def due_notifications(source: store.Store, now: datetime, limit: int) -> list[models.Notification]:
    """Return at most limit notifications due by now and not yet sent, oldest first."""
    with source.read() as tx:
        return [views.notification(tx, n) for n in tx.due_notifications(now, limit)]


def mark_sent(source: store.Store, notification_id: int, now: datetime) -> models.Notification:
    """Record that a notification was sent, now, and return it.

    Raises:
        errors.NotFoundError: when there is no such notification.
        errors.ConflictError: when it was sent already.
    """
    with source.write() as tx:
        notification = tx.notification(notification_id)
        if notification is None:
            raise errors.not_found(errors.Kind.NOTIFICATION, notification_id)
        if notification.sent_at is not None:
            sent = local_time.local(notification.sent_at).isoformat()
            msg = f"notification {notification_id} was sent already, at {sent}"
            raise errors.ConflictError(msg)
        tx.mark_sent(notification_id, now)
        return views.notification(tx, dataclasses.replace(notification, sent_at=now))
