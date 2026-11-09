import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import { api, type NeededCount } from './api_client';
import type { Position, Service, Team } from './api_types';
import { ActionNotice, Notice, TextField } from './form_fields';
import { routeHref } from './routes';
import {
  askedFor,
  candidateBadges,
  MAX_COUNT,
  neededChanges,
  needSummary,
  parseCount,
  REQUEST_STATUS_LABELS,
  servedText,
  teamGroups,
  type PositionSlot,
} from './scheduling';
import { useAction } from './use_action';
import { useResource, type Resource } from './use_resource';

interface CandidateListProps {
  readonly service: Service;
  readonly position: Position;
  readonly onSent: () => void;
}

/**
 * The people who can fill a position, with every warning about asking them.
 * A warning never stops the scheduler: the request says so, and the person decides.
 */
function CandidateList({ service, position, onSent }: CandidateListProps): ReactElement {
  const load = useCallback(
    (signal: AbortSignal) => api.listCandidates(service.id, position.id, signal),
    [service.id, position.id],
  );
  const [candidates, reload] = useResource(load);
  const action = useAction();

  return (
    <div className="candidates">
      {candidates.status === 'loading' ? <p>Loading who can fill {position.name}…</p> : null}
      {candidates.status === 'failed' ? <Notice message={candidates.error} tone="error" /> : null}
      {candidates.status === 'ready' && candidates.value.length === 0 ? (
        <p>
          Nobody can fill {position.name} yet. Add people to it on the{' '}
          <a href={routeHref({ page: 'people' })}>People</a> page.
        </p>
      ) : null}
      {candidates.status === 'ready' && candidates.value.length > 0 ? (
        <ul className="candidate-list" aria-label={`Who can fill ${position.name}`}>
          {candidates.value.map((candidate) => {
            const badges = candidateBadges(candidate, position.id);
            const asked = askedFor(service, candidate.person.id, position.id);
            const verb = badges.length === 0 ? 'Ask' : 'Ask anyway';
            return (
              <li key={candidate.person.id} className="candidate">
                <div className="candidate-head">
                  <strong>{candidate.person.name}</strong>
                  <span className="muted">{servedText(candidate)}</span>
                </div>
                {badges.length === 0 ? null : (
                  <ul className="badge-list" aria-label={`Warnings about ${candidate.person.name}`}>
                    {badges.map((badge) => (
                      <li key={badge.label} className={`badge ${badge.tone}`}>
                        {badge.label}
                      </li>
                    ))}
                  </ul>
                )}
                {asked === null ? (
                  <button
                    type="button"
                    className={badges.length === 0 ? undefined : 'secondary'}
                    disabled={action.busy}
                    aria-label={`${badges.length === 0 ? verb : `${verb}:`} ${candidate.person.name} for ${position.name}`}
                    onClick={() => {
                      void action
                        .run(async () => {
                          const request = await api.createRequest(
                            service.id,
                            position.id,
                            candidate.person.id,
                          );
                          return (
                            `Asked ${request.person.name} for ${request.position.name}.` +
                            (request.blocked
                              ? ' The request tells them the date is in their blockout.'
                              : '')
                          );
                        })
                        .then((sent) => {
                          if (sent) {
                            onSent();
                          }
                          reload();
                        });
                    }}
                  >
                    {verb}
                  </button>
                ) : (
                  <span className={`badge status-${asked.status}`}>
                    Already {asked.status === 'accepted' ? 'confirmed' : 'asked'} for{' '}
                    {position.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ActionNotice
        message={
          candidates.status === 'ready' && candidates.error !== null
            ? { text: candidates.error, tone: 'error' }
            : action.message
        }
      />
    </div>
  );
}

interface SlotProps {
  readonly service: Service;
  readonly slot: PositionSlot;
  readonly choosing: boolean;
  readonly onToggle: () => void;
  readonly onChanged: () => void;
}

/** One position at the plan: who was asked, how they answered, and the open slots. */
function Slot({ service, slot, choosing, onToggle, onChanged }: SlotProps): ReactElement {
  const { position, need, requests } = slot;
  const open = need?.open ?? 0;
  return (
    <li className="slot">
      <div className="slot-head">
        <h4>{position.name}</h4>
        <span className="muted">
          {need === null ? 'Not in the needed positions' : needSummary(need)}
        </span>
      </div>
      <ul className="slot-people" aria-label={`People for ${position.name}`}>
        {requests.map((request) => (
          <li key={request.id}>
            <span>{request.person.name}</span>{' '}
            <span className={`badge status-${request.status}`}>
              {REQUEST_STATUS_LABELS[request.status]}
            </span>
            {request.blocked ? (
              <>
                {' '}
                <span className="badge warning">Blocked out</span>
              </>
            ) : null}
            {request.status === 'declined' && request.declineReason !== '' ? (
              <>
                {' '}
                <span className="muted">“{request.declineReason}”</span>
              </>
            ) : null}
          </li>
        ))}
        {open > 0 ? <li className="open-slot">{open} open</li> : null}
      </ul>
      <button
        type="button"
        className="secondary"
        aria-expanded={choosing}
        aria-label={`Find people for ${position.name}`}
        onClick={onToggle}
      >
        Find people
      </button>
      {choosing ? <CandidateList service={service} position={position} onSent={onChanged} /> : null}
    </li>
  );
}

interface NeededFormProps {
  readonly service: Service;
  readonly teams: readonly Team[];
  readonly busy: boolean;
  /** Saves the counts; resolves to whether they were saved. */
  readonly onSave: (changes: readonly NeededCount[]) => Promise<boolean>;
  readonly onCancel: () => void;
}

/** How many people the plan needs in each position of each team. */
function NeededForm({ service, teams, busy, onSave, onCancel }: NeededFormProps): ReactElement {
  const [fields, setFields] = useState<ReadonlyMap<number, string>>(
    () => new Map(service.needed.map((need) => [need.position.id, String(need.count)])),
  );
  const [invalid, setInvalid] = useState<ReadonlySet<number>>(new Set());
  const positions = teams.flatMap((team) => team.positions);

  return (
    <form
      noValidate
      className="panel"
      aria-label="Needed positions"
      onSubmit={(event) => {
        event.preventDefault();
        const counts = new Map(
          positions.map((position) => [position.id, parseCount(fields.get(position.id) ?? '')]),
        );
        const wrong = new Set([...counts].filter(([, count]) => count === null).map(([id]) => id));
        setInvalid(wrong);
        if (wrong.size > 0) {
          return;
        }
        const valid = new Map(
          [...counts].flatMap(([id, count]) => (count === null ? [] : [[id, count] as const])),
        );
        void onSave(neededChanges(service.needed, valid));
      }}
    >
      <p className="hint">How many people the plan needs in each position. Blank or 0: none.</p>
      {positions.length === 0 ? (
        <p>
          No positions yet. Add teams and their positions on the{' '}
          <a href={routeHref({ page: 'people' })}>People</a> page.
        </p>
      ) : null}
      {teams.map((team) =>
        team.positions.length === 0 ? null : (
          <fieldset key={team.id} className="needed-team">
            <legend>{team.name}</legend>
            <div className="field-row">
              {team.positions.map((position) => (
                <TextField
                  key={position.id}
                  label={position.name}
                  value={fields.get(position.id) ?? ''}
                  inputMode="numeric"
                  error={
                    invalid.has(position.id)
                      ? `A whole number from 0 to ${String(MAX_COUNT)}.`
                      : undefined
                  }
                  onChange={(value) => {
                    setFields(new Map(fields).set(position.id, value));
                  }}
                />
              ))}
            </div>
          </fieldset>
        ),
      )}
      <div className="button-row">
        <button type="submit" disabled={busy}>
          Save needed positions
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

interface PlanTeamsProps {
  readonly service: Service;
  readonly teams: Resource<Team[]>;
  /** Called after a change, so the page loads the plan again. */
  readonly onChanged: () => void;
  /** Whether the page was opened at the teams (from the Matrix): the heading takes the focus. */
  readonly focused: boolean;
}

/**
 * The plan's Teams section: each needed position with the people asked and
 * their answers, the open slots, and who can fill each one.
 */
export function PlanTeams({ service, teams, onChanged, focused }: PlanTeamsProps): ReactElement {
  const heading = useRef<HTMLHeadingElement>(null);
  const [choosingId, setChoosingId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (focused) {
      heading.current?.focus();
    }
  }, [focused]);

  const groups = teamGroups(service);

  return (
    <section aria-labelledby="teams-heading" className="plan-teams">
      <h2 id="teams-heading" ref={heading} tabIndex={-1}>
        Teams
      </h2>
      {editing ? (
        <>
          {teams.status === 'loading' ? <p>Loading the teams…</p> : null}
          {teams.status === 'failed' ? <Notice message={teams.error} tone="error" /> : null}
          {teams.status === 'ready' ? (
            <NeededForm
              service={service}
              teams={teams.value}
              busy={action.busy}
              onSave={async (changes) => {
                const saved = await action.run(async () => {
                  await api.setNeeded(service.id, changes);
                  return 'Saved the needed positions.';
                });
                if (saved) {
                  setEditing(false);
                  onChanged();
                }
                return saved;
              }}
              onCancel={() => {
                setEditing(false);
              }}
            />
          ) : null}
        </>
      ) : (
        <p>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditing(true);
            }}
          >
            Edit needed positions
          </button>
        </p>
      )}
      <ActionNotice message={action.message} />
      {groups.length === 0 ? (
        <p>This plan needs nobody yet. Choose the positions it needs with Edit needed positions.</p>
      ) : null}
      {groups.map((group) => (
        <div key={group.teamName} className="team-group">
          <h3>{group.teamName}</h3>
          <ul className="slot-list">
            {group.slots.map((slot) => (
              <Slot
                key={slot.position.id}
                service={service}
                slot={slot}
                choosing={choosingId === slot.position.id}
                onToggle={() => {
                  setChoosingId(choosingId === slot.position.id ? null : slot.position.id);
                }}
                onChanged={onChanged}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
