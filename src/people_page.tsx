import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Person, Team } from './api_types';
import { ActionNotice, Notice, TextField } from './form_fields';
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

function TeamCard({
  team,
  onChanged,
}: {
  readonly team: Team;
  readonly onChanged: () => void;
}): ReactElement {
  return (
    <li className="card">
      <h3>{team.name}</h3>
      {team.positions.length === 0 ? (
        <p>No positions yet.</p>
      ) : (
        <ul className="chip-list">
          {team.positions.map((position) => (
            <li key={position.id} className="chip">
              {position.name}
            </li>
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

/** Teams with their positions, and the people who can be asked to serve. */
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
              <TeamCard key={team.id} team={team} onChanged={reloadTeams} />
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
