/**
 * One song (`#/songs/<id>`): its title, authors, CCLI number and tags, and each
 * arrangement with its sequence, tempo, meter, length, keys, notes, reference
 * recording and its chart, edited as ChordPro with a preview in any key.
 */
import { useCallback, useId, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Arrangement, Song } from './api_types';
import {
  arrangementFormFields,
  parseArrangementForm,
  recordingHref,
  typedKeys,
  type ArrangementFormErrors,
  type ArrangementFormFields,
} from './arrangement_form';
import { formatCalendarDate } from './calendar_date';
import { ChartView } from './chart_view';
import { keysInMode, parseChart, transposeChart } from './chordpro';
import { ActionNotice, Notice, SelectField, TextField } from './form_fields';
import { routeHref } from './routes';
import { isKeyName, normalizeKey } from './song_keys';
import { formatTimesUsed, parseSongForm, songFormFields, type SongFormFields } from './song_form';
import { useAction } from './use_action';
import { useResource } from './use_resource';

const CHART_HINT =
  'ChordPro, in the default key: chords in brackets ([G]Amazing [C]grace), a section label such as Verse 1 or Chorus on its own line, and {c: comments}.';

interface SongFormProps {
  readonly song: Song;
  readonly onSaved: () => void;
}

function SongForm({ song, onSaved }: SongFormProps): ReactElement {
  const [fields, setFields] = useState<SongFormFields>(() => songFormFields(song));
  const [error, setError] = useState<string | undefined>(undefined);
  const action = useAction();
  const headingId = useId();
  const update = (change: Partial<SongFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  return (
    <form
      noValidate
      className="panel"
      aria-labelledby={headingId}
      onSubmit={(event) => {
        event.preventDefault();
        const result = parseSongForm(fields);
        if (!result.ok) {
          setError(result.errors.title);
          return;
        }
        setError(undefined);
        void action
          .run(async () => {
            const saved = await api.updateSong(song.id, result.song);
            return `Saved ${saved.title}.`;
          })
          .then((saved) => {
            if (saved) {
              onSaved();
            }
          });
      }}
    >
      <h2 id={headingId}>Song</h2>
      <div className="field-row">
        <TextField
          label="Title"
          value={fields.title}
          onChange={(title) => {
            update({ title });
          }}
          error={error}
          required
        />
        <TextField
          label="Authors"
          value={fields.authors}
          onChange={(authors) => {
            update({ authors });
          }}
        />
        <TextField
          label="CCLI number"
          value={fields.ccli}
          onChange={(ccli) => {
            update({ ccli });
          }}
          inputMode="numeric"
        />
      </div>
      <TextField
        label="Tags"
        value={fields.tags}
        onChange={(tags) => {
          update({ tags });
        }}
        hint="Separated by commas, such as hymn, advent, fast. The songs list filters by them."
      />
      <button type="submit" disabled={action.busy}>
        Save song
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface ChartPreviewProps {
  readonly fields: ArrangementFormFields;
}

/** The chart as typed, in the key the musician picks; it follows every keystroke. */
function ChartPreview({ fields }: ChartPreviewProps): ReactElement {
  const [chosenKey, setChosenKey] = useState('');
  const headingId = useId();
  const defaultKey = normalizeKey(fields.key);
  const teamKeys = typedKeys(
    isKeyName(defaultKey) ? `${defaultKey}, ${fields.otherKeys}` : fields.otherKeys,
  );
  const everyKey = keysInMode(defaultKey).filter((key) => !teamKeys.includes(key));
  const shownKey =
    chosenKey !== '' && (teamKeys.includes(chosenKey) || everyKey.includes(chosenKey))
      ? chosenKey
      : defaultKey;
  const chart = transposeChart(parseChart(fields.chart), defaultKey, shownKey);
  return (
    <section className="chart-preview" aria-labelledby={headingId}>
      <h4 id={headingId}>Chart preview</h4>
      <SelectField
        label="Preview in"
        value={shownKey}
        onChange={setChosenKey}
        hint="Only the preview changes; the chart stays in the default key."
      >
        {teamKeys.length === 0 ? null : (
          <optgroup label="Keys the team plays">
            {teamKeys.map((key) => (
              <option key={key} value={key}>
                {key === defaultKey ? `${key} (default)` : key}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Every key">
          {everyKey.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </optgroup>
      </SelectField>
      <ChartView chart={chart} headingLevel={4} />
    </section>
  );
}

interface ArrangementFormProps {
  readonly song: Song;
  /** The arrangement to edit; null adds a new one. */
  readonly arrangement: Arrangement | null;
  readonly onSaved: () => void;
}

/** Whether the arrangement has fields a new arrangement does not take (POST is the v0.1 shape). */
function hasLaterFields(arrangement: ReturnType<typeof parseArrangementForm>): boolean {
  return (
    arrangement.ok &&
    (arrangement.arrangement.keys.length > 1 ||
      arrangement.arrangement.notes !== '' ||
      arrangement.arrangement.audioUrl !== null)
  );
}

function ArrangementForm({ song, arrangement, onSaved }: ArrangementFormProps): ReactElement {
  const [fields, setFields] = useState(() => arrangementFormFields(arrangement));
  const [errors, setErrors] = useState<ArrangementFormErrors>({});
  const action = useAction();
  const update = (change: Partial<ArrangementFormFields>): void => {
    setFields({ ...fields, ...change });
  };
  const stored = recordingHref(arrangement?.audioUrl ?? null);
  return (
    <form
      noValidate
      aria-label={
        arrangement === null
          ? `Add an arrangement of ${song.title}`
          : `Edit the arrangement ${arrangement.name}`
      }
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
            if (arrangement !== null) {
              const saved = await api.updateArrangement(
                song.id,
                arrangement.id,
                result.arrangement,
              );
              return `Saved the arrangement ${saved.name}.`;
            }
            const added = await api.createArrangement(song.id, result.arrangement);
            if (hasLaterFields(result)) {
              await api.updateArrangement(song.id, added.id, result.arrangement);
            }
            return `Added the arrangement ${added.name}.`;
          })
          .then((saved) => {
            if (saved) {
              if (arrangement === null) {
                setFields(arrangementFormFields(null));
              }
              onSaved();
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
        <TextField
          label="Other keys"
          value={fields.otherKeys}
          onChange={(otherKeys) => {
            update({ otherKeys });
          }}
          error={errors.otherKeys}
          hint="The keys the team also plays it in, such as A, Bb."
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
        hint="Such as V1 C V2 B C."
      />
      <TextField
        label="Notes"
        value={fields.notes}
        onChange={(notes) => {
          update({ notes });
        }}
        multiline
      />
      <TextField
        label="Reference recording"
        value={fields.audioUrl}
        onChange={(audioUrl) => {
          update({ audioUrl });
        }}
        error={errors.audioUrl}
        hint="A link to a recording the team learns it from, starting with https://."
      />
      {stored === null ? null : (
        <p>
          <a href={stored} target="_blank" rel="noreferrer">
            Listen to the reference recording
          </a>
        </p>
      )}
      <div className="chart-editor">
        <TextField
          label="Chart (ChordPro)"
          value={fields.chart}
          onChange={(chart) => {
            update({ chart });
          }}
          hint={CHART_HINT}
          multiline
          rows={14}
        />
        <ChartPreview fields={fields} />
      </div>
      <button type="submit" disabled={action.busy}>
        {arrangement === null ? 'Add arrangement' : 'Save arrangement'}
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

interface SongPageProps {
  readonly songId: number;
}

export function SongPage({ songId }: SongPageProps): ReactElement {
  const load = useCallback((signal: AbortSignal) => api.getSong(songId, signal), [songId]);
  const [resource, reload] = useResource(load);

  if (resource.status === 'loading') {
    return <p>Loading the song…</p>;
  }
  if (resource.status === 'failed') {
    return (
      <>
        <h1>Song</h1>
        <Notice message={resource.error} tone="error" />
        <p>
          <a href={routeHref({ page: 'songs' })}>Back to the songs</a>
        </p>
      </>
    );
  }
  const song = resource.value;
  return (
    <>
      <p>
        <a href={routeHref({ page: 'songs' })}>Songs</a>
      </p>
      <h1>{song.title}</h1>
      <p className="muted">
        {song.authors}
        {song.ccli === null ? '' : ` · CCLI ${song.ccli}`}
      </p>
      <dl className="summary">
        <div>
          <dt>Last scheduled</dt>
          <dd>
            {song.lastScheduledOn === null ? 'Never' : formatCalendarDate(song.lastScheduledOn)}
          </dd>
        </div>
        <div>
          <dt>Played in the last 12 months</dt>
          <dd>{formatTimesUsed(song.timesUsed12Months)}</dd>
        </div>
      </dl>
      {resource.error === null ? null : <Notice message={resource.error} tone="error" />}
      <SongForm song={song} onSaved={reload} />
      <section aria-labelledby="arrangements-heading">
        <h2 id="arrangements-heading">Arrangements</h2>
        {song.arrangements.length === 0 ? (
          <p>No arrangements yet: a service needs one to play this song.</p>
        ) : null}
        <ul className="card-list">
          {song.arrangements.map((arrangement) => (
            <li key={arrangement.id} className="card">
              <h3>{arrangement.name}</h3>
              <ArrangementForm song={song} arrangement={arrangement} onSaved={reload} />
            </li>
          ))}
        </ul>
        <details className="panel">
          <summary>Add an arrangement</summary>
          <ArrangementForm song={song} arrangement={null} onSaved={reload} />
        </details>
      </section>
    </>
  );
}
