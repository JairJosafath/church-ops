import { useCallback, useState, type ReactElement } from 'react';

import { api, type ItemInput } from './api_client';
import { ITEM_KINDS, type Item, type Person, type Song, type Team } from './api_types';
import { formatClock, formatServiceDate } from './dutch_time';
import { ActionNotice, CheckboxField, Notice, SelectField, TextField } from './form_fields';
import {
  ITEM_KIND_LABELS,
  itemFormFields,
  parseItemForm,
  type ItemFormErrors,
  type ItemFormFields,
} from './item_form';
import { PlanTeams } from './plan_teams';
import { formatLength, planClock } from './plan_times';
import { PlanTimes, SaveAsTemplate } from './plan_sections';
import { teamNotesFor } from './rehearsal';
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
  // v0.2 songs and plans
  readonly people: readonly Person[];
  readonly teams: readonly Team[];
  readonly busy: boolean;
  readonly submitLabel: string;
  /** Saves the item; resolves to whether it was saved. */
  readonly onSubmit: (item: ItemInput) => Promise<boolean>;
  readonly onCancel?: () => void;
}

function ItemForm({
  initial,
  songs,
  people,
  teams,
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
          {/* v0.2 songs and plans */}
          <SelectField
            label="Song leader"
            value={fields.songLeaderId}
            onChange={(songLeaderId) => {
              update({ songLeaderId });
            }}
          >
            <option value="">Nobody yet</option>
            {leaderChoices(people, initial).map((person) => (
              <option key={person.id} value={String(person.id)}>
                {person.name}
              </option>
            ))}
          </SelectField>
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
        hint="For every team."
        multiline
      />
      {/* v0.2 songs and plans */}
      <fieldset className="team-note-fields">
        <legend>Notes per team</legend>
        {initial === null && fields.kind === 'song' ? (
          <p className="hint">
            Leave the notes blank to copy the notes of the last time this song was planned.
          </p>
        ) : null}
        {noteTeams(teams, initial).map((team) => (
          <TextField
            key={team.id}
            label={`Notes for ${team.name}`}
            value={fields.teamNotes[String(team.id)] ?? ''}
            onChange={(note) => {
              update({ teamNotes: { ...fields.teamNotes, [String(team.id)]: note } });
            }}
            multiline
            rows={2}
          />
        ))}
      </fieldset>
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
  /** v0.2 songs and plans: the team whose notes to show; null for every team. */
  readonly notesFor: number | null;
}

/** One item of the plan, as the chosen team's view shows it. */
function PlanItem({ item, startsAt, view, notesFor }: PlanItemProps): ReactElement {
  const showBand = view !== 'stream' && item.arrangement !== null;
  const showStream = view !== 'band';
  const teamNotes = teamNotesFor(item, notesFor);
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
              {item.songLeader === null ? null : <span>Led by {item.songLeader.name}</span>}
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
        {teamNotes.length === 0 ? null : (
          <ul className="team-notes" aria-label={`Team notes for ${item.title}`}>
            {teamNotes.map((entry) => (
              <li key={entry.teamId}>
                <strong>{entry.teamName}</strong> <span>{entry.note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface ServicePageProps {
  readonly serviceId: number;
  // v0.2 songs and plans
  /** The people who may lead a song. */
  readonly people: readonly Person[];
  // v0.2 scheduling
  /** Whether the page was opened at its Teams section (from the Matrix). */
  readonly focusTeams?: boolean;
}

/** A service's plan: its items with their running clock, and the teams scheduled to serve. */
export function ServicePage({
  serviceId,
  people,
  focusTeams = false,
}: ServicePageProps): ReactElement {
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
  // v0.2 songs and plans: the team whose notes the order shows; "" for every team.
  const [notesFor, setNotesFor] = useState('');
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
  const teamList = teams.status === 'ready' ? teams.value : [];
  const notesTeam = teamList.find((team) => String(team.id) === notesFor)?.id ?? null;

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
        {plan.series === '' ? '' : `${plan.series} · `}
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
      <p className="button-row">
        <a className="button" href={routeHref({ page: 'live', serviceId: plan.id })}>
          Live mode
        </a>
        {/* v0.2 songs and plans */}
        <a className="button secondary" href={routeHref({ page: 'rehearse', serviceId: plan.id })}>
          Rehearse
        </a>
      </p>
      {service.error === null ? null : <Notice message={service.error} tone="error" />}

      {/* v0.2 songs and plans */}
      <PlanTimes service={plan} onChanged={reloadService} />

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
        {/* v0.2 songs and plans */}
        <SelectField label="Notes for" value={notesFor} onChange={setNotesFor}>
          <option value="">Every team</option>
          {teamList.map((team) => (
            <option key={team.id} value={String(team.id)}>
              {team.name}
            </option>
          ))}
        </SelectField>
        {items.length === 0 ? <p>No items yet. Add the first one below.</p> : null}
        <ol className="plan" aria-labelledby="order-heading">
          {items.map((item, index) => (
            <li key={item.id}>
              {editingId === item.id ? (
                <ItemForm
                  initial={item}
                  songs={songList}
                  people={people}
                  teams={teamList}
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
                    notesFor={notesTeam}
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
            people={people}
            teams={teamList}
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

      {/* v0.2 scheduling */}
      <PlanTeams service={plan} teams={teams} onChanged={reloadService} focused={focusTeams} />

      {/* v0.2 songs and plans */}
      <SaveAsTemplate service={plan} />
    </>
  );
}

// v0.2 songs and plans

/** The people who may lead a song: everyone, and the current leader if the list lacks them. */
function leaderChoices(people: readonly Person[], item: Item | null): readonly Person[] {
  const leader = item?.songLeader ?? null;
  return leader === null || people.some((person) => person.id === leader.id)
    ? people
    : [...people, leader];
}

/** The teams to take notes for: the church's, and any the item has a note for that the list lacks. */
function noteTeams(
  teams: readonly Team[],
  item: Item | null,
): readonly { readonly id: number; readonly name: string }[] {
  const known = new Set(teams.map((team) => team.id));
  const extra = (item?.teamNotes ?? [])
    .filter((entry) => !known.has(entry.teamId))
    .map((entry) => ({ id: entry.teamId, name: entry.teamName }));
  return [...teams, ...extra];
}
