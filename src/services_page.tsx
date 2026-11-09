import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { ServiceSummary } from './api_types';
import { amsterdamLocalToIso, formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, CheckboxField, Notice, TextField } from './form_fields';
import { routeHref } from './routes';
import { useAction } from './use_action';
import { navigate } from './use_hash_route';
import { useResource } from './use_resource';

const START_HINT = 'Dutch time.';

function NewServiceForm(): ReactElement {
  const [title, setTitle] = useState('');
  const [serviceType, setServiceType] = useState('Sunday morning');
  const [startsAt, setStartsAt] = useState('');
  const [streamed, setStreamed] = useState(true);
  const [errors, setErrors] = useState<{ title?: string; startsAt?: string }>({});
  const action = useAction();

  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="new-service-heading"
      onSubmit={(event) => {
        event.preventDefault();
        const start = amsterdamLocalToIso(startsAt);
        const found = {
          ...(title.trim() === '' ? { title: 'Give the service a title.' } : {}),
          ...(start === null ? { startsAt: 'Choose the date and time it starts.' } : {}),
        };
        setErrors(found);
        if (start === null || title.trim() === '') {
          return;
        }
        void action.run(async () => {
          const service = await api.createService({
            title: title.trim(),
            serviceType: serviceType.trim() === '' ? 'Service' : serviceType.trim(),
            startsAt: start,
            streamed,
          });
          navigate({ page: 'service', serviceId: service.id });
          return `Created ${service.title}.`;
        });
      }}
    >
      <h2 id="new-service-heading">New service</h2>
      <div className="field-row">
        <TextField label="Title" value={title} onChange={setTitle} error={errors.title} required />
        <TextField label="Service type" value={serviceType} onChange={setServiceType} />
      </div>
      <div className="field-row">
        <TextField
          label="Starts"
          type="datetime-local"
          value={startsAt}
          onChange={setStartsAt}
          hint={START_HINT}
          error={errors.startsAt}
          required
        />
        <CheckboxField label="Streamed" checked={streamed} onChange={setStreamed} />
      </div>
      <button type="submit" disabled={action.busy}>
        Create service
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface CopyFormProps {
  readonly service: ServiceSummary;
  readonly onCancel: () => void;
}

/** Copies a past service's items into a new one, with no link back to it. */
function CopyServiceForm({ service, onCancel }: CopyFormProps): ReactElement {
  const [title, setTitle] = useState(service.title);
  const [startsAt, setStartsAt] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  return (
    <form
      noValidate
      className="copy-form"
      aria-label={`Copy ${service.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        const start = amsterdamLocalToIso(startsAt);
        if (start === null) {
          setError('Choose when the copy starts.');
          return;
        }
        setError(undefined);
        void action.run(async () => {
          const copy = await api.copyService(service.id, {
            startsAt: start,
            title: title.trim() === '' || title.trim() === service.title ? null : title.trim(),
          });
          navigate({ page: 'service', serviceId: copy.id });
          return `Copied into ${copy.title}.`;
        });
      }}
    >
      <p className="hint">
        The copy gets this service&rsquo;s items, without its people. Changing one never changes the
        other.
      </p>
      <div className="field-row">
        <TextField label="Title of the copy" value={title} onChange={setTitle} />
        <TextField
          label="Copy starts"
          type="datetime-local"
          value={startsAt}
          onChange={setStartsAt}
          hint={START_HINT}
          error={error}
          required
        />
      </div>
      <div className="button-row">
        <button type="submit" disabled={action.busy}>
          Copy service
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <ActionNotice message={action.message} />
    </form>
  );
}

/** Every service, in date order, with a way to plan, run or copy each. */
export function ServicesPage(): ReactElement {
  const load = useCallback((signal: AbortSignal) => api.listServices(signal), []);
  const [services] = useResource(load);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  return (
    <>
      <h1>Services</h1>
      <NewServiceForm />
      <section aria-labelledby="services-heading">
        <h2 id="services-heading">All services</h2>
        {services.status === 'loading' ? <p>Loading services…</p> : null}
        {services.status === 'failed' ? <Notice message={services.error} tone="error" /> : null}
        {services.status === 'ready' ? (
          services.value.length === 0 ? (
            <p>No services yet. Create the first one above.</p>
          ) : (
            <ul className="card-list">
              {services.value.map((service) => (
                <li key={service.id} className="card">
                  <div className="card-head">
                    <h3>
                      <a href={routeHref({ page: 'service', serviceId: service.id })}>
                        {service.title}
                      </a>
                    </h3>
                    <span className="muted">{service.serviceType}</span>
                  </div>
                  <p>
                    {formatServiceDate(service.startsAt)}, {formatClock(service.startsAt)}–
                    {formatClock(service.endsAt)} ·{' '}
                    {service.itemCount === 1 ? '1 item' : `${String(service.itemCount)} items`}
                  </p>
                  <div className="button-row">
                    <a
                      className="button secondary"
                      href={routeHref({ page: 'live', serviceId: service.id })}
                    >
                      Live mode
                    </a>
                    <button
                      type="button"
                      className="secondary"
                      aria-expanded={copyingId === service.id}
                      onClick={() => {
                        setCopyingId(copyingId === service.id ? null : service.id);
                      }}
                    >
                      Copy…
                    </button>
                  </div>
                  {copyingId === service.id ? (
                    <CopyServiceForm
                      service={service}
                      onCancel={() => {
                        setCopyingId(null);
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>
    </>
  );
}
