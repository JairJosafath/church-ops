import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Person, Position, Team } from './api_types';
import { ActionNotice, Notice, SelectField, TextField } from './form_fields';
import { useAction } from './use_action';
import { useResource } from './use_resource';

interface NameFormProps {
  readonly label: string;
  readonly submitLabel: string;
  readonly formLabel: string;
  /** Creates the thing named; resolves to the message to show. */
  readonly onCreate: (name: string) => Promise<string>;
}

/** A one-field form that names something new. */
function NameForm({ label, submitLabel, formLabel, onCreate }: NameFormProps): ReactElement {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  return (
    <form
      noValidate
      className="inline-form"
      aria-label={formLabel}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === '') {
          setError(`Give the ${label.toLowerCase()}.`);
          return;
        }
        setError(undefined);
        void action
          .run(() => onCreate(name.trim()))
          .then((created) => {
            if (created) {
              setName('');
            }
          });
      }}
    >
      <TextField label={label} value={name} onChange={setName} error={error} required />
      <button type="submit" disabled={action.busy}>
        {submitLabel}
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

// v0.2 scheduling
interface PositionMembersProps {
  readonly position: Position;
  readonly people: readonly Person[];
  readonly onChanged: () => void;
}

/** Who can fill a position: the people the plan's Teams section offers for it. */
function PositionMembers({ position, people, onChanged }: PositionMembersProps): ReactElement {
  const [personId, setPersonId] = useState('');
  const action = useAction();
  const members = people.filter((person) => position.memberIds.includes(person.id));
  const others = people.filter((person) => !position.memberIds.includes(person.id));
  return (
    <li className="position-members">
      <h4>{position.name}</h4>
      {members.length === 0 ? (
        <p>Nobody can fill {position.name} yet.</p>
      ) : (
        <ul className="chip-list" aria-label={`Who can fill ${position.name}`}>
          {members.map((person) => (
            <li key={person.id} className="chip">
              {person.name}
              <button
                type="button"
                className="chip-remove"
                disabled={action.busy}
                aria-label={`Remove ${person.name} from ${position.name}`}
                onClick={() => {
                  void action
                    .run(async () => {
                      await api.removePositionMember(position.id, person.id);
                      return `${person.name} no longer fills ${position.name}.`;
                    })
                    .then(onChanged);
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {others.length === 0 ? null : (
        <form
          noValidate
          className="inline-form"
          aria-label={`Add someone who can fill ${position.name}`}
          onSubmit={(event) => {
            event.preventDefault();
            const person = others.find((candidate) => String(candidate.id) === personId);
            if (person === undefined) {
              return;
            }
            void action
              .run(async () => {
                await api.addPositionMember(position.id, person.id);
                return `${person.name} can fill ${position.name} now.`;
              })
              .then((added) => {
                if (added) {
                  setPersonId('');
                }
                onChanged();
              });
          }}
        >
          <SelectField label={`Add to ${position.name}`} value={personId} onChange={setPersonId}>
            <option value="">Choose a person</option>
            {others.map((person) => (
              <option key={person.id} value={String(person.id)}>
                {person.name}
              </option>
            ))}
          </SelectField>
          <button type="submit" className="secondary" disabled={action.busy || personId === ''}>
            Add
          </button>
        </form>
      )}
      <ActionNotice message={action.message} />
    </li>
  );
}

function TeamCard({
  team,
  people,
  onChanged,
}: {
  readonly team: Team;
  readonly people: readonly Person[];
  readonly onChanged: () => void;
}): ReactElement {
  return (
    <li className="card">
      <h3>{team.name}</h3>
      {team.positions.length === 0 ? (
        <p>No positions yet.</p>
      ) : (
        <ul className="position-list">
          {team.positions.map((position) => (
            <PositionMembers
              key={position.id}
              position={position}
              people={people}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
      <NameForm
        label="Position name"
        submitLabel="Add position"
        formLabel={`Add a position to ${team.name}`}
        onCreate={async (name) => {
          const position = await api.createPosition(team.id, name);
          onChanged();
          return `Added ${position.name} to ${team.name}.`;
        }}
      />
    </li>
  );
}

function NewPersonForm({ onAdded }: { readonly onAdded: () => void }): ReactElement {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="new-person-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === '') {
          setError('Give the person’s name.');
          return;
        }
        setError(undefined);
        void action
          .run(async () => {
            const person = await api.createPerson(
              name.trim(),
              email.trim() === '' ? null : email.trim(),
            );
            return `Added ${person.name}.`;
          })
          .then((added) => {
            if (added) {
              setName('');
              setEmail('');
              onAdded();
            }
          });
      }}
    >
      <h3 id="new-person-heading">New person</h3>
      <div className="field-row">
        <TextField label="Name" value={name} onChange={setName} error={error} required />
        <TextField
          label="E-mail"
          type="email"
          value={email}
          onChange={setEmail}
          hint="Optional. Only what the church needs to reach them."
        />
      </div>
      <button type="submit" disabled={action.busy}>
        Add person
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface PeoplePageProps {
  readonly people: readonly Person[];
  readonly onPeopleChanged: () => void;
}

/** Teams with their positions and who can fill each, and the people who can be asked to serve. */
export function PeoplePage({ people, onPeopleChanged }: PeoplePageProps): ReactElement {
  const load = useCallback((signal: AbortSignal) => api.listTeams(signal), []);
  const [teams, reloadTeams] = useResource(load);
  return (
    <>
      <h1>Teams and people</h1>
      <section aria-labelledby="teams-heading">
        <h2 id="teams-heading">Teams</h2>
        <div className="panel">
          <NameForm
            label="Team name"
            submitLabel="Add team"
            formLabel="Add a team"
            onCreate={async (name) => {
              const team = await api.createTeam(name);
              reloadTeams();
              return `Added ${team.name}. Now add its positions.`;
            }}
          />
        </div>
        {teams.status === 'loading' ? <p>Loading teams…</p> : null}
        {teams.status === 'failed' ? <Notice message={teams.error} tone="error" /> : null}
        {teams.status === 'ready' && teams.value.length === 0 ? <p>No teams yet.</p> : null}
        {teams.status === 'ready' ? (
          <ul className="card-list">
            {teams.value.map((team) => (
              <TeamCard key={team.id} team={team} people={people} onChanged={reloadTeams} />
            ))}
          </ul>
        ) : null}
      </section>
      <section aria-labelledby="people-list-heading">
        <h2 id="people-list-heading">People</h2>
        <NewPersonForm onAdded={onPeopleChanged} />
        {people.length === 0 ? (
          <p>No people yet.</p>
        ) : (
          <ul className="chip-list">
            {people.map((person) => (
              <li key={person.id} className="chip">
                {person.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
