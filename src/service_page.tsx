import { useCallback, useState, type ReactElement } from 'react';

import { api, type ItemInput } from './api_client';
import {
  ITEM_KINDS,
  type Item,
  type Person,
  type Service,
  type Song,
  type Team,
} from './api_types';
import { isBlockedOn } from './blockouts';
import { amsterdamDate, formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, CheckboxField, Notice, SelectField, TextField } from './form_fields';
import {
  ITEM_KIND_LABELS,
  itemFormFields,
  parseItemForm,
  type ItemFormErrors,
  type ItemFormFields,
} from './item_form';
import { formatLength, planClock } from './plan_times';
import { moveItem } from './reorder';
import { routeHref } from './routes';
import { effectiveKey, isKeyName, normalizeKey } from './song_keys';
import { useAction } from './use_action';
import { useResource } from './use_resource';

/** One list of items, and a view of it per team. */
type PlanView = 'all' | 'band' | 'stream';

const PLAN_VIEWS: readonly { readonly view: PlanView; readonly label: string }[] = [
  { view: 'all', label: 'Everything' },
  { view: 'band', label: 'Band' },
  { view: 'stream', label: 'Stream' },
];

interface ItemFormProps {
  readonly initial: Item | null;
  readonly songs: readonly Song[];
  readonly busy: boolean;
  readonly submitLabel: string;
  /** Saves the item; resolves to whether it was saved. */
  readonly onSubmit: (item: ItemInput) => Promise<boolean>;
  readonly onCancel?: () => void;
}

function ItemForm({
  initial,
  songs,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: ItemFormProps): ReactElement {
  const [fields, setFields] = useState<ItemFormFields>(() => itemFormFields(initial));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const update = (change: Partial<ItemFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  const choices = songs.flatMap((song) =>
    song.arrangements.map((arrangement) => ({ song, arrangement })),
  );
  const chosen = choices.find(({ arrangement }) => String(arrangement.id) === fields.arrangementId);
  const typedKey = normalizeKey(fields.key);
  const keyHint =
    chosen === undefined
      ? 'Leave blank to play the arrangement’s key.'
      : `Leave blank to play the arrangement’s key, ${chosen.arrangement.key}.` +
        (typedKey === '' || isKeyName(typedKey)
          ? ` Plays in ${effectiveKey(typedKey === '' ? null : typedKey, chosen.arrangement.key)}.`
          : '');

  return (
    <form
      noValidate
      className="item-form"
      aria-label={initial === null ? 'Add an item' : `Edit ${initial.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseItemForm(fields);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setErrors({});
        void onSubmit(result.item).then((saved) => {
          if (saved && initial === null) {
            setFields(itemFormFields(null));
          }
        });
      }}
    >
      <div className="field-row">
        <SelectField
          label="Kind"
          value={fields.kind}
          onChange={(value) => {
            const kind = ITEM_KINDS.find((candidate) => candidate === value);
            if (kind !== undefined) {
              update({ kind });
            }
          }}
        >
          {ITEM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ITEM_KIND_LABELS[kind]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Title"
          value={fields.title}
          onChange={(title) => {
            update({ title });
          }}
          error={errors.title}
          required
        />
        <TextField
          label="Length"
          value={fields.length}
          onChange={(length) => {
            update({ length });
          }}
          hint={
            fields.kind === 'header'
              ? 'm:ss or minutes; a header may take none.'
              : 'm:ss or minutes.'
          }
          error={errors.length}
          inputMode="numeric"
        />
      </div>
      {fields.kind === 'song' ? (
        <div className="field-row">
          <SelectField
            label="Arrangement"
            value={fields.arrangementId}
            onChange={(arrangementId) => {
              const choice = choices.find(
                ({ arrangement }) => String(arrangement.id) === arrangementId,
              );
              update({
                arrangementId,
                ...(choice !== undefined && fields.title.trim() === ''
                  ? { title: choice.song.title }
                  : {}),
                ...(choice !== undefined && fields.length.trim() === ''
                  ? { length: formatLength(choice.arrangement.lengthSeconds) }
                  : {}),
              });
            }}
            error={errors.arrangementId}
            {...(choices.length === 0
              ? { hint: 'Add a song and an arrangement on the Songs page first.' }
              : {})}
            required
          >
            <option value="">Choose an arrangement</option>
            {songs.map((song) => (
              <optgroup key={song.id} label={song.title}>
                {song.arrangements.map((arrangement) => (
                  <option key={arrangement.id} value={String(arrangement.id)}>
                    {song.title}: {arrangement.name} ({arrangement.key},{' '}
                    {String(arrangement.tempoBpm)} BPM, {arrangement.meter})
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
          <TextField
            label="Key for this service"
            value={fields.key}
            onChange={(key) => {
              update({ key });
            }}
            hint={keyHint}
            error={errors.key}
          />
        </div>
      ) : null}
      <div className="field-row">
        <TextField
          label="OBS scene"
          value={fields.scene}
          onChange={(scene) => {
            update({ scene });
          }}
          hint="Blank uses the default for this kind."
        />
        <TextField
          label="Lower third"
          value={fields.lowerThird}
          onChange={(lowerThird) => {
            update({ lowerThird });
          }}
          hint="Name a person only if they agreed to be named on the stream."
        />
      </div>
      <CheckboxField
        label="Off stream"
        checked={fields.offStream}
        onChange={(offStream) => {
          update({ offStream });
        }}
        hint="The stream shows the holding scene. Use it for prayer ministry, testimonies and children."
      />
      <TextField
        label="Notes"
        value={fields.notes}
        onChange={(notes) => {
          update({ notes });
        }}
        multiline
      />
      <div className="button-row">
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
        {onCancel === undefined ? null : (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface PlanItemProps {
  readonly item: Item;
  readonly startsAt: Date;
  readonly view: PlanView;
}

/** One item of the plan, as the chosen team's view shows it. */
function PlanItem({ item, startsAt, view }: PlanItemProps): ReactElement {
  const showBand = view !== 'stream' && item.arrangement !== null;
  const showStream = view !== 'band';
  return (
    <div className={item.kind === 'header' ? 'plan-item header' : 'plan-item'}>
      <time className="plan-time" dateTime={startsAt.toISOString()}>
        {formatClock(startsAt)}
      </time>
      <div className="plan-body">
        <h3 className="plan-title">
          {item.title} <span className="muted kind">{ITEM_KIND_LABELS[item.kind]}</span>
        </h3>
        <p className="plan-meta">
          <span>{formatLength(item.lengthSeconds)}</span>
          {showBand ? (
            <>
              <span>
                Key {item.arrangement.key}
                {item.key === null ? '' : ' (set for this service)'}
              </span>
              <span>
                {String(item.arrangement.tempoBpm)} BPM, {item.arrangement.meter}
              </span>
              <span>{item.arrangement.name}</span>
              {item.arrangement.sequence === '' ? null : <span>{item.arrangement.sequence}</span>}
            </>
          ) : null}
          {showStream ? (
            <>
              {item.scene === null ? null : <span>Scene: {item.scene}</span>}
              {item.lowerThird === null ? null : <span>Lower third: {item.lowerThird}</span>}
              {item.offStream ? <span className="badge warning">Off stream</span> : null}
            </>
          ) : null}
        </p>
        {view === 'all' && item.notes !== '' ? <p className="plan-notes">{item.notes}</p> : null}
      </div>
    </div>
  );
}

interface RequestFormProps {
  readonly service: Service;
  readonly teams: readonly Team[];
  readonly people: readonly Person[];
  readonly onSent: () => void;
}

/**
 * Asks a person to fill a position. A blockout on the service's date is the
 * person's word: the planner is warned, may still ask, and the person decides.
 */
function RequestForm({ service, teams, people, onSent }: RequestFormProps): ReactElement {
  const [positionId, setPositionId] = useState('');
  const [personId, setPersonId] = useState('');
  const action = useAction();
  const person = people.find((candidate) => String(candidate.id) === personId) ?? null;
  const chosenId = person?.id ?? null;
  const loadBlockouts = useCallback(
    (signal: AbortSignal) =>
      chosenId === null ? Promise.resolve([]) : api.listBlockouts(chosenId, signal),
    [chosenId],
  );
  const [blockouts] = useResource(loadBlockouts);
  const serviceDate = amsterdamDate(service.startsAt);
  const blocked =
    blockouts.status === 'ready' &&
    serviceDate !== null &&
    isBlockedOn(blockouts.value, serviceDate);
  const positions = teams.flatMap((team) => team.positions.map((position) => ({ team, position })));
  const chosen = positions.find(({ position }) => String(position.id) === positionId);

  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="request-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (person === null || chosen === undefined) {
          return;
        }
        void action
          .run(async () => {
            const request = await api.createRequest(service.id, chosen.position.id, person.id);
            return (
              `Asked ${request.person.name} to serve as ${request.position.name} (${request.teamName}).` +
              (request.blocked ? ' The request tells them the date is in their blockout.' : '')
            );
          })
          .then((sent) => {
            if (sent) {
              onSent();
            }
          });
      }}
    >
      <h3 id="request-heading">Send a request</h3>
      <div className="field-row">
        <SelectField
          label="Position"
          value={positionId}
          onChange={setPositionId}
          required
          {...(positions.length === 0
            ? { hint: 'Add a team and its positions on the People page first.' }
            : {})}
        >
          <option value="">Choose a position</option>
          {teams.map((team) => (
            <optgroup key={team.id} label={team.name}>
              {team.positions.map((position) => (
                <option key={position.id} value={String(position.id)}>
                  {team.name}: {position.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <SelectField label="Person" value={personId} onChange={setPersonId} required>
          <option value="">Choose a person</option>
          {people.map((candidate) => (
            <option key={candidate.id} value={String(candidate.id)}>
              {candidate.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div aria-live="polite" className="notice-region">
        {person !== null && blocked ? (
          <p className="notice warning">
            {person.name} has blocked out {formatServiceDate(service.startsAt)}. You can still ask:
            the request will say so, and they decide.
          </p>
        ) : null}
        {person !== null && blockouts.status === 'failed' ? (
          <p className="notice error">
            Could not check {person.name}&rsquo;s blockouts. {blockouts.error} The request will
            still say if the date is blocked.
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={action.busy || person === null || chosen === undefined}>
        {blocked ? 'Send request anyway' : 'Send request'}
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

const STATUS_LABELS = {
  pending: 'Waiting for an answer',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
} as const;

interface ServicePageProps {
  readonly serviceId: number;
  readonly people: readonly Person[];
}

/** A service's plan: its items with their running clock, and the people asked to serve. */
export function ServicePage({ serviceId, people }: ServicePageProps): ReactElement {
  const loadService = useCallback(
    (signal: AbortSignal) => api.getService(serviceId, signal),
    [serviceId],
  );
  const loadSongs = useCallback((signal: AbortSignal) => api.listSongs(signal), []);
  const loadTeams = useCallback((signal: AbortSignal) => api.listTeams(signal), []);
  const [service, reloadService] = useResource(loadService);
  const [songs] = useResource(loadSongs);
  const [teams] = useResource(loadTeams);
  const [view, setView] = useState<PlanView>('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const action = useAction();

  if (service.status === 'loading') {
    return <p>Loading the plan…</p>;
  }
  if (service.status === 'failed') {
    return (
      <>
        <h1>Plan</h1>
        <Notice message={service.error} tone="error" />
        <p>
          <a href={routeHref({ page: 'services' })}>Back to the services</a>
        </p>
      </>
    );
  }

  const plan = service.value;
  const items = [...plan.items].sort((a, b) => a.position - b.position);
  const clock = planClock(
    plan.startsAt,
    items.map((item) => item.lengthSeconds),
  );
  const songList = songs.status === 'ready' ? songs.value : [];

  const change = async (act: () => Promise<string>): Promise<boolean> => {
    const done = await action.run(act);
    reloadService();
    return done;
  };
  const move = (index: number, to: number): void => {
    const ids = moveItem(
      items.map((item) => item.id),
      index,
      to,
    );
    void change(async () => {
      await api.reorderItems(plan.id, ids);
      return 'Moved.';
    });
  };

  return (
    <>
      <p>
        <a href={routeHref({ page: 'services' })}>Services</a>
      </p>
      <h1>{plan.title}</h1>
      <p className="muted">
        {formatServiceDate(plan.startsAt)} · {plan.serviceType} ·{' '}
        {plan.streamed ? 'Streamed' : 'Not streamed'}
      </p>
      <dl className="summary">
        <div>
          <dt>Starts</dt>
          <dd>{formatClock(plan.startsAt)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{clock === null ? formatClock(plan.endsAt) : formatClock(clock.endsAt)}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{formatLength(clock?.totalSeconds ?? 0)}</dd>
        </div>
      </dl>
      <p>
        <a className="button" href={routeHref({ page: 'live', serviceId: plan.id })}>
          Live mode
        </a>
      </p>
      {service.error === null ? null : <Notice message={service.error} tone="error" />}

      <section aria-labelledby="order-heading">
        <h2 id="order-heading">Service order</h2>
        <fieldset className="view-switch">
          <legend>View for</legend>
          {PLAN_VIEWS.map((option) => (
            <label key={option.view}>
              <input
                type="radio"
                name="plan-view"
                value={option.view}
                checked={view === option.view}
                onChange={() => {
                  setView(option.view);
                }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        {items.length === 0 ? <p>No items yet. Add the first one below.</p> : null}
        <ol className="plan" aria-labelledby="order-heading">
          {items.map((item, index) => (
            <li key={item.id}>
              {editingId === item.id ? (
                <ItemForm
                  initial={item}
                  songs={songList}
                  busy={action.busy}
                  submitLabel="Save item"
                  onSubmit={async (input) => {
                    const saved = await change(async () => {
                      await api.updateItem(plan.id, item.id, input);
                      return `Saved ${input.title}.`;
                    });
                    if (saved) {
                      setEditingId(null);
                    }
                    return saved;
                  }}
                  onCancel={() => {
                    setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <PlanItem
                    item={item}
                    startsAt={clock?.itemStarts[index] ?? new Date(item.startsAt)}
                    view={view}
                  />
                  {removingId === item.id ? (
                    <div className="button-row confirm">
                      <span>Remove {item.title}?</span>
                      <button
                        type="button"
                        className="danger"
                        disabled={action.busy}
                        onClick={() => {
                          setRemovingId(null);
                          void change(async () => {
                            await api.deleteItem(plan.id, item.id);
                            return `Removed ${item.title}.`;
                          });
                        }}
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setRemovingId(null);
                        }}
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="button-row item-actions">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Move ${item.title} up`}
                        disabled={action.busy || index === 0}
                        onClick={() => {
                          move(index, index - 1);
                        }}
                      >
                        ↑ Up
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Move ${item.title} down`}
                        disabled={action.busy || index === items.length - 1}
                        onClick={() => {
                          move(index, index + 1);
                        }}
                      >
                        ↓ Down
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Edit ${item.title}`}
                        onClick={() => {
                          setEditingId(item.id);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Remove ${item.title}`}
                        onClick={() => {
                          setRemovingId(item.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
        <ActionNotice message={action.message} />
        <div className="panel">
          <h3>Add an item</h3>
          {songs.status === 'failed' ? <Notice message={songs.error} tone="error" /> : null}
          <ItemForm
            initial={null}
            songs={songList}
            busy={action.busy}
            submitLabel="Add item"
            onSubmit={(input) =>
              change(async () => {
                await api.createItem(plan.id, input);
                return `Added ${input.title}.`;
              })
            }
          />
        </div>
      </section>

      <section aria-labelledby="people-heading">
        <h2 id="people-heading">People</h2>
        {plan.requests.length === 0 ? (
          <p>Nobody has been asked yet.</p>
        ) : (
          <ul className="request-list">
            {plan.requests.map((request) => (
              <li key={request.id}>
                <span>
                  {request.teamName}: {request.position.name}
                </span>
                <strong>{request.person.name}</strong>
                <span className={`badge status-${request.status}`}>
                  {STATUS_LABELS[request.status]}
                </span>
                {request.blocked ? <span className="badge warning">Blocked out</span> : null}
              </li>
            ))}
          </ul>
        )}
        {teams.status === 'failed' ? <Notice message={teams.error} tone="error" /> : null}
        <RequestForm
          service={plan}
          teams={teams.status === 'ready' ? teams.value : []}
          people={people}
          onSent={reloadService}
        />
      </section>
    </>
  );
}
