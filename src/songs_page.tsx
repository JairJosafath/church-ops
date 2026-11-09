import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Song } from './api_types';
import {
  parseArrangementForm,
  type ArrangementFormErrors,
  type ArrangementFormFields,
} from './arrangement_form';
import { ActionNotice, Notice, TextField } from './form_fields';
import { formatLength } from './plan_times';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const BLANK_ARRANGEMENT: ArrangementFormFields = {
  name: '',
  key: '',
  tempo: '',
  meter: '4/4',
  length: '',
  sequence: '',
  chart: '',
};

interface ArrangementFormProps {
  readonly song: Song;
  readonly onAdded: () => void;
}

function ArrangementForm({ song, onAdded }: ArrangementFormProps): ReactElement {
  const [fields, setFields] = useState(BLANK_ARRANGEMENT);
  const [errors, setErrors] = useState<ArrangementFormErrors>({});
  const action = useAction();
  const update = (change: Partial<ArrangementFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  return (
    <form
      noValidate
      aria-label={`Add an arrangement of ${song.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseArrangementForm(fields);
        if (!result.ok) {
          setErrors(result.errors);
          return;
        }
        setErrors({});
        void action
          .run(async () => {
            const arrangement = await api.createArrangement(song.id, result.arrangement);
            return `Added the arrangement ${arrangement.name}.`;
          })
          .then((added) => {
            if (added) {
              setFields(BLANK_ARRANGEMENT);
              onAdded();
            }
          });
      }}
    >
      <div className="field-row">
        <TextField
          label="Name"
          value={fields.name}
          onChange={(name) => {
            update({ name });
          }}
          error={errors.name}
          hint="Such as Default, Acoustic or Christmas."
          required
        />
        <TextField
          label="Default key"
          value={fields.key}
          onChange={(key) => {
            update({ key });
          }}
          error={errors.key}
          hint="A service may play it in another key."
          required
        />
      </div>
      <div className="field-row">
        <TextField
          label="Tempo (BPM)"
          value={fields.tempo}
          onChange={(tempo) => {
            update({ tempo });
          }}
          error={errors.tempo}
          inputMode="numeric"
          required
        />
        <TextField
          label="Meter"
          value={fields.meter}
          onChange={(meter) => {
            update({ meter });
          }}
          error={errors.meter}
        />
        <TextField
          label="Length"
          value={fields.length}
          onChange={(length) => {
            update({ length });
          }}
          error={errors.length}
          hint="m:ss or minutes."
          inputMode="numeric"
          required
        />
      </div>
      <TextField
        label="Sequence"
        value={fields.sequence}
        onChange={(sequence) => {
          update({ sequence });
        }}
        hint="Such as V1 C V2 C B C."
      />
      <TextField
        label="Chart"
        value={fields.chart}
        onChange={(chart) => {
          update({ chart });
        }}
        hint="Chords over lyrics, as text."
        multiline
      />
      <button type="submit" disabled={action.busy}>
        Add arrangement
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

function NewSongForm({ onAdded }: { readonly onAdded: () => void }): ReactElement {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [ccli, setCcli] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  return (
    <form
      noValidate
      className="panel"
      aria-labelledby="new-song-heading"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() === '') {
          setError('Give the song a title.');
          return;
        }
        setError(undefined);
        void action
          .run(async () => {
            const song = await api.createSong({
              title: title.trim(),
              authors: authors.trim(),
              ccli: ccli.trim() === '' ? null : ccli.trim(),
            });
            return `Added ${song.title}. Add an arrangement so a service can play it.`;
          })
          .then((added) => {
            if (added) {
              setTitle('');
              setAuthors('');
              setCcli('');
              onAdded();
            }
          });
      }}
    >
      <h2 id="new-song-heading">New song</h2>
      <div className="field-row">
        <TextField label="Title" value={title} onChange={setTitle} error={error} required />
        <TextField label="Authors" value={authors} onChange={setAuthors} />
        <TextField label="CCLI number" value={ccli} onChange={setCcli} inputMode="numeric" />
      </div>
      <button type="submit" disabled={action.busy}>
        Add song
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

/** The church's songs, each with the arrangements it plays them in. */
export function SongsPage(): ReactElement {
  const load = useCallback((signal: AbortSignal) => api.listSongs(signal), []);
  const [songs, reload] = useResource(load);
  return (
    <>
      <h1>Songs</h1>
      <NewSongForm onAdded={reload} />
      <section aria-labelledby="songs-heading">
        <h2 id="songs-heading">All songs</h2>
        {songs.status === 'loading' ? <p>Loading songs…</p> : null}
        {songs.status === 'failed' ? <Notice message={songs.error} tone="error" /> : null}
        {songs.status === 'ready' && songs.value.length === 0 ? (
          <p>No songs yet. Add the first one above.</p>
        ) : null}
        {songs.status === 'ready' ? (
          <ul className="card-list">
            {songs.value.map((song) => (
              <li key={song.id} className="card">
                <div className="card-head">
                  <h3>{song.title}</h3>
                  <span className="muted">
                    {song.authors}
                    {song.ccli === null ? '' : ` · CCLI ${song.ccli}`}
                  </span>
                </div>
                {song.arrangements.length === 0 ? (
                  <p>No arrangements yet: a service needs one to play this song.</p>
                ) : (
                  <ul className="arrangement-list">
                    {song.arrangements.map((arrangement) => (
                      <li key={arrangement.id}>
                        <strong>{arrangement.name}</strong>
                        <span>Key {arrangement.key}</span>
                        <span>
                          {String(arrangement.tempoBpm)} BPM, {arrangement.meter}
                        </span>
                        <span>{formatLength(arrangement.lengthSeconds)}</span>
                        {arrangement.sequence === '' ? null : <span>{arrangement.sequence}</span>}
                        {arrangement.chart === '' ? null : (
                          <details>
                            <summary>Chart</summary>
                            <pre className="chart">{arrangement.chart}</pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <details>
                  <summary>Add an arrangement</summary>
                  <ArrangementForm song={song} onAdded={reload} />
                </details>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
