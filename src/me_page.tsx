import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Person, ScheduleRequest } from './api_types';
import { blockoutRangeError } from './blockouts';
import { formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, Notice, TextField } from './form_fields';
import { routeHref } from './routes';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const ANSWERED_LABELS = {
  accepted: 'You accepted',
  declined: 'You declined',
  cancelled: 'Cancelled by the planner',
} as const;

function RequestSummary({ request }: { readonly request: ScheduleRequest }): ReactElement {
  return (
    <div>
      <strong>
        {request.teamName}: {request.position.name}
      </strong>
      <span className="muted">
        {' '}
        at {request.serviceTitle}, {formatServiceDate(request.serviceStartsAt)}{' '}
        {formatClock(request.serviceStartsAt)}
      </span>
      {request.blocked ? (
        <p className="hint">This date is in one of your blockouts. It is your choice.</p>
      ) : null}
    </div>
  );
}

function MyRequests({ person }: { readonly person: Person }): ReactElement {
  const load = useCallback(
    (signal: AbortSignal) => api.listRequestsFor(person.id, signal),
    [person.id],
  );
  const [requests, reload] = useResource(load);
  const action = useAction();

  if (requests.status === 'loading') {
    return <p>Loading your requests…</p>;
  }
  if (requests.status === 'failed') {
    return <Notice message={requests.error} tone="error" />;
  }
  const pending = requests.value.filter((request) => request.status === 'pending');
  const answered = requests.value.filter((request) => request.status !== 'pending');
  const answer = (request: ScheduleRequest, accept: boolean): void => {
    void action
      .run(async () => {
        const answeredRequest = await api.answerRequest(request.id, accept);
        return `${accept ? 'Accepted' : 'Declined'}: ${answeredRequest.position.name} at ${answeredRequest.serviceTitle}.`;
      })
      .then(reload);
  };

  return (
    <>
      <ActionNotice
        message={requests.error === null ? action.message : { text: requests.error, tone: 'error' }}
      />
      <h3>Waiting for your answer</h3>
      {pending.length === 0 ? (
        <p>Nothing to answer.</p>
      ) : (
        <ul className="request-cards">
          {pending.map((request) => (
            <li key={request.id} className="card">
              <RequestSummary request={request} />
              <div className="button-row">
                <button
                  type="button"
                  disabled={action.busy}
                  aria-label={`Accept ${request.position.name} at ${request.serviceTitle}`}
                  onClick={() => {
                    answer(request, true);
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={action.busy}
                  aria-label={`Decline ${request.position.name} at ${request.serviceTitle}`}
                  onClick={() => {
                    answer(request, false);
                  }}
                >
                  Decline
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {answered.length === 0 ? null : (
        <>
          <h3>Answered</h3>
          <ul className="request-cards">
            {answered.map((request) => (
              <li key={request.id} className="card">
                <RequestSummary request={request} />
                <span className={`badge status-${request.status}`}>
                  {request.status === 'pending' ? '' : ANSWERED_LABELS[request.status]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function MyBlockouts({ person }: { readonly person: Person }): ReactElement {
  const load = useCallback(
    (signal: AbortSignal) => api.listBlockouts(person.id, signal),
    [person.id],
  );
  const [blockouts, reload] = useResource(load);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();

  return (
    <>
      <ActionNotice message={action.message} />
      {blockouts.status === 'loading' ? <p>Loading your blockouts…</p> : null}
      {blockouts.status === 'failed' ? <Notice message={blockouts.error} tone="error" /> : null}
      {blockouts.status === 'ready' && blockouts.value.length === 0 ? (
        <p>No blockouts: you can be asked for any date.</p>
      ) : null}
      {blockouts.status === 'ready' ? (
        <ul className="request-cards">
          {blockouts.value.map((blockout) => (
            <li key={blockout.id} className="card blockout">
              <span>
                {blockout.startsOn === blockout.endsOn
                  ? blockout.startsOn
                  : `${blockout.startsOn} to ${blockout.endsOn}`}
                {blockout.reason === '' ? '' : `: ${blockout.reason}`}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={action.busy}
                aria-label={`Remove the blockout from ${blockout.startsOn} to ${blockout.endsOn}`}
                onClick={() => {
                  void action
                    .run(async () => {
                      await api.deleteBlockout(blockout.id);
                      return 'Removed the blockout.';
                    })
                    .then(reload);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        noValidate
        className="panel"
        aria-labelledby="blockout-heading"
        onSubmit={(event) => {
          event.preventDefault();
          const rangeError = blockoutRangeError(startsOn, endsOn === '' ? startsOn : endsOn);
          setError(rangeError ?? undefined);
          if (rangeError !== null) {
            return;
          }
          void action
            .run(async () => {
              await api.createBlockout(person.id, {
                startsOn,
                endsOn: endsOn === '' ? startsOn : endsOn,
                reason: reason.trim(),
              });
              return 'Added the blockout.';
            })
            .then((added) => {
              if (added) {
                setStartsOn('');
                setEndsOn('');
                setReason('');
              }
              reload();
            });
        }}
      >
        <h3 id="blockout-heading">Add a blockout</h3>
        <div className="field-row">
          <TextField
            label="First day"
            type="date"
            value={startsOn}
            onChange={setStartsOn}
            required
          />
          <TextField
            label="Last day"
            type="date"
            value={endsOn}
            onChange={setEndsOn}
            hint="Blank for one day."
            error={error}
          />
        </div>
        <TextField
          label="Reason"
          value={reason}
          onChange={setReason}
          hint="Optional, for yourself. Planners see only that you are unavailable."
        />
        <button type="submit" disabled={action.busy}>
          Add blockout
        </button>
      </form>
    </>
  );
}

interface MePageProps {
  readonly me: Person | null;
}

/** The requests sent to the person at this browser, and the days they cannot serve. */
export function MePage({ me }: MePageProps): ReactElement {
  if (me === null) {
    return (
      <>
        <h1>My requests</h1>
        <p>
          Choose who you are with &ldquo;You are&rdquo; at the top of the page to see your requests
          and blockouts. Not listed? Ask a planner to add you on the{' '}
          <a href={routeHref({ page: 'people' })}>People</a> page.
        </p>
      </>
    );
  }
  return (
    <>
      <h1>My requests</h1>
      <p className="muted">For {me.name}.</p>
      <section aria-labelledby="my-requests-heading">
        <h2 id="my-requests-heading">Requests</h2>
        <MyRequests key={me.id} person={me} />
      </section>
      <section aria-labelledby="my-blockouts-heading">
        <h2 id="my-blockouts-heading">Blockouts</h2>
        <MyBlockouts key={me.id} person={me} />
      </section>
    </>
  );
}
