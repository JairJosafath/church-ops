import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Devices, Item, LiveState, Person } from './api_types';
import { formatClock } from './dutch_time';
import { ActionNotice, Notice, SelectField } from './form_fields';
import { ITEM_KIND_LABELS } from './item_form';
import { backIndex, deviceBadge, liveRole, nextIndex } from './live';
import { formatCountdown, projectedEnd, secondsAfter, secondsLeft } from './live_timer';
import { formatLength } from './plan_times';
import { routeHref } from './routes';
import { useAction } from './use_action';
import { useNowSeconds } from './use_clock';
import { useLive } from './use_live';
import { useResource } from './use_resource';

function DeviceBadges({ devices }: { readonly devices: Devices }): ReactElement {
  const obs = deviceBadge(devices.obs);
  const ableton = deviceBadge(devices.ableton);
  return (
    <ul className="device-badges" aria-label="Devices">
      <li className={`badge ${obs.tone}`}>OBS: {obs.label}</li>
      <li className={`badge ${ableton.tone}`}>Ableton: {ableton.label}</li>
      {devices.updatedAt === null ? null : (
        <li className="muted">Reported {formatClock(devices.updatedAt)}</li>
      )}
    </ul>
  );
}

interface LiveItemProps {
  readonly item: Item | null;
  readonly label: string;
  readonly prominent: boolean;
}

function LiveItem({ item, label, prominent }: LiveItemProps): ReactElement {
  const headingClass = prominent ? 'live-title current' : 'live-title';
  return (
    <section className={prominent ? 'live-item current' : 'live-item'} aria-label={label}>
      <p className="live-label">{label}</p>
      {item === null ? (
        <p className={headingClass}>{prominent ? 'Nothing' : 'The end of the service'}</p>
      ) : (
        <>
          <p className={headingClass}>{item.title}</p>
          <p className="plan-meta">
            <span>{ITEM_KIND_LABELS[item.kind]}</span>
            <span>Planned {formatClock(item.startsAt)}</span>
            <span>{formatLength(item.lengthSeconds)}</span>
            {item.arrangement === null ? null : (
              <>
                <span>Key {item.arrangement.key}</span>
                <span>
                  {String(item.arrangement.tempoBpm)} BPM, {item.arrangement.meter}
                </span>
                {item.arrangement.sequence === '' ? null : <span>{item.arrangement.sequence}</span>}
              </>
            )}
            {item.scene === null ? null : <span>Scene: {item.scene}</span>}
            {item.offStream ? <span className="badge warning">Off stream</span> : null}
          </p>
          {item.lowerThird === null ? null : (
            <p className="muted">Lower third: {item.lowerThird}</p>
          )}
        </>
      )}
    </section>
  );
}

// v0.2 scheduling
/**
 * The current item's countdown, into overtime below zero, and the projected
 * end of the service from the plan's items after it.
 */
function LiveTimer({ live }: { readonly live: LiveState }): ReactElement | null {
  const nowMs = useNowSeconds() * 1000;
  const serviceId = live.serviceId;
  const loadPlan = useCallback(
    (signal: AbortSignal) => api.getService(serviceId, signal),
    [serviceId],
  );
  const [plan] = useResource(loadPlan);
  const current = live.current;
  if (current === null) {
    return null;
  }
  const left = secondsLeft(live.itemStartedAt, current.lengthSeconds, nowMs);
  if (left === null) {
    return <p className="muted">No countdown: the server did not say when this item started.</p>;
  }
  const end =
    plan.status === 'ready'
      ? projectedEnd(
          live.itemStartedAt,
          current.lengthSeconds,
          secondsAfter(plan.value.items, current.position),
          nowMs,
        )
      : null;
  return (
    <div className="live-timer">
      <p role="timer" className={left < 0 ? 'countdown over' : 'countdown'}>
        <span className="live-label">{left < 0 ? 'Over time' : 'Left'}</span>
        <span className="countdown-value">{formatCountdown(left)}</span>
      </p>
      {plan.status === 'ready' ? (
        <dl className="summary">
          <div>
            <dt>Projected end</dt>
            <dd>{end === null ? '--:--' : formatClock(end)}</dd>
          </div>
          <div>
            <dt>Planned end</dt>
            <dd>{formatClock(plan.value.endsAt)}</dd>
          </div>
        </dl>
      ) : null}
      {plan.status === 'failed' ? (
        <Notice message={`No projected end: could not load the plan. ${plan.error}`} tone="error" />
      ) : null}
    </div>
  );
}

interface ControlsProps {
  readonly live: LiveState;
  readonly me: Person;
  readonly people: readonly Person[];
  readonly apply: (state: LiveState | null) => void;
}

/** What only the person who holds control sees: Next, Back, hand over and end. */
function ControllerControls({ live, me, people, apply }: ControlsProps): ReactElement {
  const action = useAction();
  const [handTo, setHandTo] = useState('');
  const [ending, setEnding] = useState(false);
  const next = nextIndex(live);
  const back = backIndex(live);
  const others = people.filter((person) => person.id !== me.id);
  const goTo = (toIndex: number, verb: string): void => {
    void action.run(async () => {
      const state = await api.advanceLive(live.serviceId, me.id, toIndex);
      apply(state);
      return `${verb}: ${state.current?.title ?? 'the end'}.`;
    });
  };
  return (
    <>
      <div className="live-controls">
        <button
          type="button"
          className="secondary big"
          disabled={action.busy || back === null}
          onClick={() => {
            if (back !== null) {
              goTo(back, 'Back to');
            }
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          className="big"
          disabled={action.busy || next === null}
          onClick={() => {
            if (next !== null) {
              goTo(next, 'Now');
            }
          }}
        >
          Next →
        </button>
      </div>
      <ActionNotice message={action.message} />
      <form
        noValidate
        className="panel inline-form"
        aria-label="Hand over control"
        onSubmit={(event) => {
          event.preventDefault();
          const person = others.find((candidate) => String(candidate.id) === handTo);
          if (person === undefined) {
            return;
          }
          void action.run(async () => {
            const state = await api.handOver(live.serviceId, me.id, person.id);
            apply(state);
            setHandTo('');
            return `${state.controller.name} has control now.`;
          });
        }}
      >
        <SelectField label="Hand control to" value={handTo} onChange={setHandTo}>
          <option value="">Choose a person</option>
          {others.map((person) => (
            <option key={person.id} value={String(person.id)}>
              {person.name}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="secondary" disabled={action.busy || handTo === ''}>
          Hand over
        </button>
      </form>
      {ending ? (
        <div className="button-row confirm">
          <span>End live mode for everyone?</span>
          <button
            type="button"
            className="danger"
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                await api.endLive(live.serviceId);
                apply(null);
                return 'Live mode ended.';
              });
            }}
          >
            End live mode
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEnding(false);
            }}
          >
            Keep going
          </button>
        </div>
      ) : (
        <p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEnding(true);
            }}
          >
            End live mode…
          </button>
        </p>
      )}
    </>
  );
}

interface StartLiveProps {
  readonly serviceId: number;
  readonly me: Person | null;
  readonly people: readonly Person[];
  readonly apply: (state: LiveState | null) => void;
}

function StartLiveForm({ serviceId, me, people, apply }: StartLiveProps): ReactElement {
  const [controllerId, setControllerId] = useState(me === null ? '' : String(me.id));
  const action = useAction();
  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="start-live-heading"
      onSubmit={(event) => {
        event.preventDefault();
        const controller = people.find((person) => String(person.id) === controllerId);
        if (controller === undefined) {
          return;
        }
        void action.run(async () => {
          const state = await api.startLive(serviceId, controller.id);
          apply(state);
          return `Live mode started. ${state.controller.name} has control.`;
        });
      }}
    >
      <h2 id="start-live-heading">Start live mode</h2>
      <p>One person holds control and moves the service on; everyone else follows.</p>
      <SelectField
        label="Who holds control"
        value={controllerId}
        onChange={setControllerId}
        required
      >
        <option value="">Choose a person</option>
        {people.map((person) => (
          <option key={person.id} value={String(person.id)}>
            {person.name}
          </option>
        ))}
      </SelectField>
      <button type="submit" disabled={action.busy || controllerId === ''}>
        Start live mode
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface LivePageProps {
  readonly serviceId: number;
  readonly me: Person | null;
  readonly people: readonly Person[];
}

/**
 * A service while it happens: the current and next item, large. The one
 * person who holds control moves it on; every other screen follows it.
 */
export function LivePage({ serviceId, me, people }: LivePageProps): ReactElement {
  const { view, pollError, apply } = useLive(serviceId);
  const planLink = (
    <p>
      <a href={routeHref({ page: 'service', serviceId })}>Plan</a>
    </p>
  );

  switch (view.status) {
    case 'loading':
      return (
        <>
          {planLink}
          <h1>Live mode</h1>
          <p>Connecting…</p>
          <Notice message={pollError} tone="error" />
        </>
      );
    case 'not_live':
      return (
        <>
          {planLink}
          <h1>Live mode</h1>
          <p>This service is not live. This page shows it as soon as it starts.</p>
          <Notice message={pollError} tone="error" />
          <StartLiveForm
            key={me?.id ?? 'nobody'}
            serviceId={serviceId}
            me={me}
            people={people}
            apply={apply}
          />
        </>
      );
    case 'live': {
      const live = view.state;
      const role = liveRole(live, me?.id ?? null);
      return (
        <div className="live">
          {planLink}
          <h1>{live.serviceTitle}</h1>
          <p className="live-status">
            {role === 'controller' ? (
              <strong>You have control.</strong>
            ) : (
              <>
                <strong>{live.controller.name}</strong> has control.{' '}
                {me === null
                  ? 'Choose who you are at the top of the page to be handed control.'
                  : 'Ask them to hand it to you.'}
              </>
            )}{' '}
            <span className="muted">
              {live.streamed ? 'Streamed' : 'Not streamed'} · Automatic scene switching{' '}
              {live.autoSwitch ? 'on' : 'off'}
            </span>
          </p>
          <DeviceBadges devices={live.devices} />
          <Notice message={pollError} tone="error" />
          <div aria-live="polite">
            <LiveItem item={live.current} label="Now" prominent />
          </div>
          <LiveTimer live={live} />
          <LiveItem item={live.next} label="Next" prominent={false} />
          {role === 'controller' && me !== null ? (
            <ControllerControls live={live} me={me} people={people} apply={apply} />
          ) : null}
        </div>
      );
    }
  }
}
