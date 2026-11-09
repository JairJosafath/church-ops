import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Person, ScheduleRequest } from './api_types';
import { blockoutRangeError } from './blockouts';
import { amsterdamDate, formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, Notice, TextField } from './form_fields';
import { reasonError, splitSchedule } from './my_schedule';
import { rehearseHref, routeHref } from './routes';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const EARLIER_LABELS = {
  pending: 'Not answered',
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

// v0.2 scheduling
interface ReasonFormProps {
  /** What the form does, as its name: "Decline Drums at Sunday morning". */
  readonly label: string;
  readonly submitLabel: string;
  readonly busy: boolean;
  /** Sends the reason ("" for none); resolves to whether it worked. */
  readonly onSubmit: (reason: string) => Promise<boolean>;
  readonly onCancel: () => void;
}

/** Saying no, with a reason if the person wants to give one. */
function ReasonForm({
  label,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: ReasonFormProps): ReactElement {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  return (
    <form
      noValidate
      className="reason-form"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        const problem = reasonError(reason);
        setError(problem ?? undefined);
        if (problem === null) {
          void onSubmit(reason.trim());
        }
      }}
    >
      <TextField
        label="Reason"
        value={reason}
        onChange={setReason}
        hint="Optional. The planner sees it."
        error={error}
        multiline
      />
      <div className="button-row">
        <button type="submit" className="danger" disabled={busy}>
          {submitLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Keep it
        </button>
      </div>
    </form>
  );
}

interface LoadedSchedule {
  readonly requests: readonly ScheduleRequest[];
  /** The Dutch date when the requests were loaded, "YYYY-MM-DD". */
  readonly today: string;
}

/** The person's requests: waiting for an answer, confirmed, and earlier or answered. */
function MySchedule({ person }: { readonly person: Person }): ReactElement {
  const load = useCallback(
    async (signal: AbortSignal): Promise<LoadedSchedule> => ({
      requests: await api.listRequestsFor(person.id, signal),
      // Read here, when the requests arrive, so rendering never reads the clock.
      today: amsterdamDate(new Date().toISOString()) ?? '',
    }),
    [person.id],
  );
  const [loaded, reload] = useResource(load);
  const action = useAction();
  /** The request whose decline or withdrawal form is open. */
  const [answeringId, setAnsweringId] = useState<number | null>(null);

  if (loaded.status === 'loading') {
    return <p>Loading your schedule…</p>;
  }
  if (loaded.status === 'failed') {
    return <Notice message={loaded.error} tone="error" />;
  }
  const { pending, confirmed, earlier } = splitSchedule(loaded.value.requests, loaded.value.today);
  const what = (request: ScheduleRequest): string =>
    `${request.position.name} at ${request.serviceTitle}`;
  const settle = async (act: () => Promise<string>): Promise<boolean> => {
    const done = await action.run(act);
    if (done) {
      setAnsweringId(null);
    }
    reload();
    return done;
  };

  return (
    <>
      <ActionNotice
        message={loaded.error === null ? action.message : { text: loaded.error, tone: 'error' }}
      />
      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading">Waiting for your answer</h2>
        {pending.length === 0 ? (
          <p>Nothing to answer.</p>
        ) : (
          <ul className="request-cards">
            {pending.map((request) => (
              <li key={request.id} className="card">
                <RequestSummary request={request} />
                {answeringId === request.id ? (
                  <ReasonForm
                    label={`Decline ${what(request)}`}
                    submitLabel="Decline"
                    busy={action.busy}
                    onSubmit={(reason) =>
                      settle(async () => {
                        const declined = await api.declineRequest(request.id, reason);
                        return `Declined: ${what(declined)}.`;
                      })
                    }
                    onCancel={() => {
                      setAnsweringId(null);
                    }}
                  />
                ) : (
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={action.busy}
                      aria-label={`Accept ${what(request)}`}
                      onClick={() => {
                        void settle(async () => {
                          const accepted = await api.answerRequest(request.id, true);
                          return `Accepted: ${what(accepted)}.`;
                        });
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={action.busy}
                      aria-label={`Decline ${what(request)}`}
                      onClick={() => {
                        setAnsweringId(request.id);
                      }}
                    >
                      Decline…
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="confirmed-heading">
        <h2 id="confirmed-heading">Confirmed</h2>
        {confirmed.length === 0 ? (
          <p>Nothing confirmed from today on.</p>
        ) : (
          <ul className="request-cards">
            {confirmed.map((request) => (
              <li key={request.id} className="card">
                <RequestSummary request={request} />
                <p className="button-row">
                  <a
                    className="button secondary"
                    href={routeHref({ page: 'service', serviceId: request.serviceId })}
                    aria-label={`Open the plan of ${request.serviceTitle}`}
                  >
                    Open the plan
                  </a>
                  <a
                    className="button secondary"
                    href={rehearseHref(request.serviceId)}
                    aria-label={`Rehearse for ${request.serviceTitle}`}
                  >
                    Rehearse
                  </a>
                </p>
                {answeringId === request.id ? (
                  <ReasonForm
                    label={`Withdraw from ${what(request)}`}
                    submitLabel="Withdraw"
                    busy={action.busy}
                    onSubmit={(reason) =>
                      settle(async () => {
                        const withdrawn = await api.withdrawRequest(request.id, reason);
                        return `Withdrew from ${what(withdrawn)}. The plan shows it.`;
                      })
                    }
                    onCancel={() => {
                      setAnsweringId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    disabled={action.busy}
                    aria-label={`Withdraw from ${what(request)}`}
                    onClick={() => {
                      setAnsweringId(request.id);
                    }}
                  >
                    Can&rsquo;t make it…
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {earlier.length === 0 ? null : (
        <section aria-labelledby="earlier-heading">
          <h2 id="earlier-heading">Earlier and answered</h2>
          <ul className="request-cards">
            {earlier.map((request) => (
              <li key={request.id} className="card">
                <RequestSummary request={request} />
                <span className={`badge status-${request.status}`}>
                  {EARLIER_LABELS[request.status]}
                </span>
                {request.status === 'declined' && request.declineReason !== '' ? (
                  <>
                    {' '}
                    <span className="muted">“{request.declineReason}”</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
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
          hint="Optional, for you: a planner only sees that you are away, never why."
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

/** My schedule: the requests sent to the person at this browser, and the days they cannot serve. */
export function MePage({ me }: MePageProps): ReactElement {
  if (me === null) {
    return (
      <>
        <h1>My schedule</h1>
        <p>
          Choose who you are with &ldquo;You are&rdquo; at the top of the page to see your schedule
          and blockouts. Not listed? Ask a planner to add you on the{' '}
          <a href={routeHref({ page: 'people' })}>People</a> page.
        </p>
      </>
    );
  }
  return (
    <>
      <h1>My schedule</h1>
      <p className="muted">For {me.name}.</p>
      <MySchedule key={me.id} person={me} />
      <section aria-labelledby="my-blockouts-heading">
        <h2 id="my-blockouts-heading">Blockouts</h2>
        <MyBlockouts key={me.id} person={me} />
      </section>
    </>
  );
}
