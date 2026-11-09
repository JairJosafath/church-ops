/**
 * The parts of a plan page for the teams (v0.2): the plan's times, with its
 * rehearsals, and saving the plan as its service type's template.
 */
import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { PlanTimeKind, Service } from './api_types';
import { formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, Notice, SelectField, TextField } from './form_fields';
import { routeHref } from './routes';
import {
  parseRehearsalForm,
  planTimesOf,
  type RehearsalFormErrors,
  type RehearsalFormFields,
} from './service_times';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const TIME_KIND_LABELS: Readonly<Record<PlanTimeKind, string>> = {
  rehearsal: 'Rehearsal',
  service: 'Service',
};

const BLANK_REHEARSAL: RehearsalFormFields = { name: 'Rehearsal', startsAt: '', endsAt: '' };

interface PlanTimesProps {
  readonly service: Service;
  readonly onChanged: () => void;
}

/** When the teams meet: the rehearsals, which the planner adds and removes, and the service. */
export function PlanTimes({ service, onChanged }: PlanTimesProps): ReactElement {
  const [fields, setFields] = useState(BLANK_REHEARSAL);
  const [errors, setErrors] = useState<RehearsalFormErrors>({});
  const action = useAction();
  const update = (change: Partial<RehearsalFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  const change = (act: () => Promise<string>): Promise<boolean> =>
    action.run(act).then((done) => {
      onChanged();
      return done;
    });
  return (
    <section aria-labelledby="times-heading">
      <h2 id="times-heading">Times</h2>
      <ul className="request-list" aria-labelledby="times-heading">
        {planTimesOf(service).map((time) => (
          <li key={`${time.kind}-${String(time.id)}`}>
            <span className="badge">{TIME_KIND_LABELS[time.kind]}</span>
            <strong>{time.name}</strong>
            <span>
              {formatServiceDate(time.startsAt)}, {formatClock(time.startsAt)}–
              {formatClock(time.endsAt)}
            </span>
            {time.kind === 'rehearsal' && time.id !== 0 ? (
              <button
                type="button"
                className="secondary"
                aria-label={`Remove ${time.name}`}
                disabled={action.busy}
                onClick={() => {
                  void change(async () => {
                    await api.removeTime(service.id, time.id);
                    return `Removed ${time.name}.`;
                  });
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        noValidate
        className="panel"
        aria-labelledby="rehearsal-heading"
        onSubmit={(event) => {
          event.preventDefault();
          const result = parseRehearsalForm(fields);
          if (!result.ok) {
            setErrors(result.errors);
            return;
          }
          setErrors({});
          void change(async () => {
            const added = await api.addRehearsal(service.id, result.rehearsal);
            return `Added ${added.name}.`;
          }).then((added) => {
            if (added) {
              setFields(BLANK_REHEARSAL);
            }
          });
        }}
      >
        <h3 id="rehearsal-heading">Add a rehearsal</h3>
        <div className="field-row">
          <TextField
            label="Name"
            value={fields.name}
            onChange={(name) => {
              update({ name });
            }}
            error={errors.name}
            required
          />
          <TextField
            label="Starts"
            type="datetime-local"
            value={fields.startsAt}
            onChange={(startsAt) => {
              update({ startsAt });
            }}
            hint="Dutch time."
            error={errors.startsAt}
            required
          />
          <TextField
            label="Ends"
            type="datetime-local"
            value={fields.endsAt}
            onChange={(endsAt) => {
              update({ endsAt });
            }}
            hint="Dutch time."
            error={errors.endsAt}
            required
          />
        </div>
        <button type="submit" disabled={action.busy}>
          Add rehearsal
        </button>
      </form>
      <ActionNotice message={action.message} />
    </section>
  );
}

interface SaveAsTemplateProps {
  readonly service: Service;
}

/** Makes this plan's items and needed positions a service type's template, once confirmed. */
export function SaveAsTemplate({ service }: SaveAsTemplateProps): ReactElement {
  const load = useCallback((signal: AbortSignal) => api.listServiceTypes(signal), []);
  const [types] = useResource(load);
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  const typeList = types.status === 'ready' ? types.value : [];
  const chosenId =
    choice ?? String(service.serviceTypeId ?? (typeList[0] === undefined ? '' : typeList[0].id));
  const chosen = typeList.find((serviceType) => String(serviceType.id) === chosenId);

  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="template-heading"
      onSubmit={(event) => {
        event.preventDefault();
        setConfirming(true);
      }}
    >
      <h2 id="template-heading">Template</h2>
      <p className="hint">
        A new plan of a service type starts from a copy of its template. Plans already made never
        change with it.
      </p>
      {types.status === 'loading' ? <p>Loading the service types…</p> : null}
      {types.status === 'failed' ? <Notice message={types.error} tone="error" /> : null}
      {types.status === 'ready' && typeList.length === 0 ? (
        <p>
          There are no service types yet. Add one on the{' '}
          <a href={routeHref({ page: 'service_types' })}>service types</a> page first.
        </p>
      ) : null}
      {chosen === undefined ? null : (
        <>
          <SelectField
            label="Service type"
            value={chosenId}
            onChange={(value) => {
              setChoice(value);
              setConfirming(false);
            }}
          >
            {typeList.map((serviceType) => (
              <option key={serviceType.id} value={String(serviceType.id)}>
                {serviceType.name}
              </option>
            ))}
          </SelectField>
          {confirming ? (
            <div className="button-row confirm">
              <span>
                Replace the template of {chosen.name} with this plan&rsquo;s items and positions?
              </span>
              <button
                type="button"
                disabled={action.busy}
                onClick={() => {
                  setConfirming(false);
                  void action.run(async () => {
                    const saved = await api.saveTemplateFromService(chosen.id, service.id);
                    return `Saved this plan as the template of ${saved.name}.`;
                  });
                }}
              >
                Replace the template
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Keep it
              </button>
            </div>
          ) : (
            <button type="submit" className="secondary" disabled={action.busy}>
              Save as the template
            </button>
          )}
        </>
      )}
      <ActionNotice message={action.message} />
    </form>
  );
}
