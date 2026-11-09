/**
 * Service types (`#/service-types`): the recurring kinds of gathering, each
 * with its usual start time, its rehearsal and its template, the items and
 * positions a new plan of that type starts with (services-and-planning).
 */
import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { ServiceType, Team } from './api_types';
import { ActionNotice, Notice, TextField } from './form_fields';
import { ITEM_KIND_LABELS } from './item_form';
import { formatLength } from './plan_times';
import { routeHref } from './routes';
import {
  describeRehearsal,
  parseServiceTypeForm,
  serviceTypeFormFields,
  type ServiceTypeFormErrors,
  type ServiceTypeFormFields,
} from './service_type_form';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const BLANK: ServiceTypeFormFields = { name: '', startTime: '10:00', rehearsalOffset: '' };

interface ServiceTypeFormProps {
  /** The type to edit; null adds a new one. */
  readonly serviceType: ServiceType | null;
  readonly onSaved: () => void;
  /** Closes the edit form. */
  readonly onCancel?: () => void;
}

function ServiceTypeForm({ serviceType, onSaved, onCancel }: ServiceTypeFormProps): ReactElement {
  const [fields, setFields] = useState(() =>
    serviceType === null ? BLANK : serviceTypeFormFields(serviceType),
  );
  const [errors, setErrors] = useState<ServiceTypeFormErrors>({});
  const action = useAction();
  const update = (change: Partial<ServiceTypeFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  return (
    <form
      noValidate
      className={serviceType === null ? 'panel' : 'copy-form'}
      {...(serviceType === null
        ? { 'aria-labelledby': 'new-service-type-heading' }
        : { 'aria-label': `Edit ${serviceType.name}` })}
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseServiceTypeForm(fields);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setErrors({});
        void action
          .run(async () => {
            if (serviceType === null) {
              const added = await api.createServiceType(result.serviceType);
              return `Added ${added.name}.`;
            }
            const saved = await api.updateServiceType(serviceType.id, result.serviceType);
            return `Saved ${saved.name}.`;
          })
          .then((saved) => {
            if (saved) {
              if (serviceType === null) {
                setFields(BLANK);
              }
              onSaved();
            }
          });
      }}
    >
      {serviceType === null ? <h2 id="new-service-type-heading">New service type</h2> : null}
      <div className="field-row">
        <TextField
          label="Name"
          value={fields.name}
          onChange={(name) => {
            update({ name });
          }}
          error={errors.name}
          hint="Such as Sunday morning, Youth evening or Prayer meeting."
          required
        />
        <TextField
          label="Start time"
          value={fields.startTime}
          onChange={(startTime) => {
            update({ startTime });
          }}
          error={errors.startTime}
          hint="Dutch time, such as 10:00."
          inputMode="numeric"
        />
        <TextField
          label="Rehearsal, minutes before the start"
          value={fields.rehearsalOffset}
          onChange={(rehearsalOffset) => {
            update({ rehearsalOffset });
          }}
          error={errors.rehearsalOffset}
          hint="Each new plan gets a rehearsal this long before it starts. Blank for none."
          inputMode="numeric"
        />
      </div>
      <div className="button-row">
        <button type="submit" disabled={action.busy}>
          {serviceType === null ? 'Add service type' : 'Save'}
        </button>
        {onCancel === undefined ? null : (
          <button type="button" className="secondary" onClick={onCancel}>
            Close
          </button>
        )}
      </div>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface TemplateViewProps {
  readonly serviceType: ServiceType;
  readonly teams: readonly Team[];
}

/** The items and positions a new plan of this type starts with. */
function TemplateView({ serviceType, teams }: TemplateViewProps): ReactElement {
  const { items, needed } = serviceType.template;
  const positions = new Map(
    teams.flatMap((team) =>
      team.positions.map((position) => [position.id, `${team.name}: ${position.name}`] as const),
    ),
  );
  if (items.length === 0 && needed.length === 0) {
    return (
      <p className="hint">
        The template is empty. Open a plan of this type and save it as the template.
      </p>
    );
  }
  return (
    <details>
      <summary>Template</summary>
      {items.length === 0 ? null : (
        <ol className="template-items" aria-label="Template items">
          {items.map((item, index) => (
            // A template item has no id: its place in the order is its identity,
            // and this list is read only.
            <li key={index}>
              {item.title} ({ITEM_KIND_LABELS[item.kind]}
              {item.lengthSeconds === 0 ? '' : `, ${formatLength(item.lengthSeconds)}`})
            </li>
          ))}
        </ol>
      )}
      {needed.length === 0 ? null : (
        <ul className="template-needed" aria-label="Positions needed">
          {needed.map((need) => (
            <li key={need.positionId}>
              {positions.get(need.positionId) ?? `Position ${String(need.positionId)}`},{' '}
              {String(need.count)} needed
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        To change it, open a plan of this type, make it the way the type usually goes, and save it
        as the template. Plans already made keep their own order.
      </p>
    </details>
  );
}

export function ServiceTypesPage(): ReactElement {
  const loadTypes = useCallback((signal: AbortSignal) => api.listServiceTypes(signal), []);
  const loadTeams = useCallback((signal: AbortSignal) => api.listTeams(signal), []);
  const [types, reload] = useResource(loadTypes);
  const [teams] = useResource(loadTeams);
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <>
      <p>
        <a href={routeHref({ page: 'services' })}>Services</a>
      </p>
      <h1>Service types</h1>
      <ServiceTypeForm serviceType={null} onSaved={reload} />
      <section aria-labelledby="types-heading">
        <h2 id="types-heading">All service types</h2>
        {types.status === 'loading' ? <p>Loading the service types…</p> : null}
        {types.status === 'failed' ? <Notice message={types.error} tone="error" /> : null}
        {teams.status === 'failed' ? <Notice message={teams.error} tone="error" /> : null}
        {types.status === 'ready' && types.value.length === 0 ? (
          <p>No service types yet. Add the first one above.</p>
        ) : null}
        {types.status === 'ready' && types.value.length > 0 ? (
          <ul className="card-list">
            {types.value.map((serviceType) => (
              <li key={serviceType.id} className="card">
                <div className="card-head">
                  <h3>{serviceType.name}</h3>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Edit ${serviceType.name}`}
                    aria-expanded={editingId === serviceType.id}
                    onClick={() => {
                      setEditingId(editingId === serviceType.id ? null : serviceType.id);
                    }}
                  >
                    Edit
                  </button>
                </div>
                <p>
                  Starts {serviceType.startTime} ·{' '}
                  {describeRehearsal(serviceType.rehearsalOffsetMinutes)}
                </p>
                {editingId === serviceType.id ? (
                  <ServiceTypeForm
                    serviceType={serviceType}
                    onSaved={reload}
                    onCancel={() => {
                      setEditingId(null);
                    }}
                  />
                ) : null}
                <TemplateView
                  serviceType={serviceType}
                  teams={teams.status === 'ready' ? teams.value : []}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
