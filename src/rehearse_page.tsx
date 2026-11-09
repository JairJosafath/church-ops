/**
 * Rehearse (`#/services/<id>/rehearse`): each song of the plan in order, as
 * the band practises it: in the key the item is played in, with its tempo,
 * meter, sequence, chart, the notes for one team, and the reference
 * recording. It prints one song to a page.
 */
import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Team, TeamNote } from './api_types';
import { recordingHref } from './arrangement_form';
import { ChartView } from './chart_view';
import { formatServiceDate } from './dutch_time';
import { Notice, SelectField } from './form_fields';
import { rehearsalSongs, teamNotesFor, type RehearsalSong } from './rehearsal';
import { routeHref } from './routes';
import { useResource } from './use_resource';

interface SongCardProps {
  readonly song: RehearsalSong;
  readonly teamId: number | null;
}

function SongCard({ song, teamId }: SongCardProps): ReactElement {
  const { item, arrangement } = song;
  const notes = teamNotesFor(item, teamId);
  const recording = recordingHref(arrangement?.audioUrl ?? null);
  return (
    <article className="rehearse-song">
      <h2>{item.title}</h2>
      <dl className="facts">
        <div>
          <dt>Arrangement</dt>
          <dd>{item.arrangement.name}</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>
            {song.key}
            {item.key === null ? '' : ' (set for this service)'}
          </dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>
            {String(item.arrangement.tempoBpm)} BPM, {item.arrangement.meter}
          </dd>
        </div>
        {item.arrangement.sequence === '' ? null : (
          <div>
            <dt>Sequence</dt>
            <dd>{item.arrangement.sequence}</dd>
          </div>
        )}
        {item.songLeader === null ? null : (
          <div>
            <dt>Led by</dt>
            <dd>{item.songLeader.name}</dd>
          </div>
        )}
      </dl>
      {recording === null ? null : (
        <p className="no-print">
          <a href={recording} target="_blank" rel="noreferrer">
            Reference recording
          </a>
        </p>
      )}
      {item.notes === '' ? null : <p className="plan-notes">{item.notes}</p>}
      {notes.length === 0 ? null : (
        <ul className="team-notes" aria-label="Team notes">
          {notes.map((entry) => (
            <li key={entry.teamId}>
              <strong>{entry.teamName}</strong> <span>{entry.note}</span>
            </li>
          ))}
        </ul>
      )}
      {arrangement === undefined || arrangement.notes === '' ? null : (
        <p className="plan-notes">
          <strong>Arrangement notes</strong> <span>{arrangement.notes}</span>
        </p>
      )}
      {song.writtenIn === null ? (
        <p className="notice warning">
          This chart is shown as written, not in {song.key}: the song library could not be loaded.
          Reload the page to try again.
        </p>
      ) : null}
      <ChartView chart={song.chart} headingLevel={3} />
    </article>
  );
}

/** The teams to offer notes for: the church's, and any a note names that the list lacks. */
function teamChoices(
  teams: readonly Team[],
  notes: readonly TeamNote[],
): { id: number; name: string }[] {
  const known = new Set(teams.map((team) => team.id));
  const extra = new Map(
    notes.filter((note) => !known.has(note.teamId)).map((note) => [note.teamId, note.teamName]),
  );
  return [
    ...teams.map((team) => ({ id: team.id, name: team.name })),
    ...[...extra].map(([id, name]) => ({ id, name })),
  ];
}

interface RehearsePageProps {
  readonly serviceId: number;
}

export function RehearsePage({ serviceId }: RehearsePageProps): ReactElement {
  const loadService = useCallback(
    (signal: AbortSignal) => api.getService(serviceId, signal),
    [serviceId],
  );
  const loadSongs = useCallback((signal: AbortSignal) => api.listSongs(signal), []);
  const loadTeams = useCallback((signal: AbortSignal) => api.listTeams(signal), []);
  const [service] = useResource(loadService);
  const [songs] = useResource(loadSongs);
  const [teams] = useResource(loadTeams);
  const [teamId, setTeamId] = useState('');

  if (service.status === 'loading' || songs.status === 'loading') {
    return <p>Loading the songs of the plan…</p>;
  }
  if (service.status === 'failed') {
    return (
      <>
        <h1>Rehearse</h1>
        <Notice message={service.error} tone="error" />
        <p>
          <a href={routeHref({ page: 'services' })}>Back to the services</a>
        </p>
      </>
    );
  }
  const plan = service.value;
  const planSongs = rehearsalSongs(plan.items, songs.status === 'ready' ? songs.value : null);
  const choices = teamChoices(
    teams.status === 'ready' ? teams.value : [],
    plan.items.flatMap((item) => item.teamNotes),
  );
  const chosenTeam = choices.find((team) => String(team.id) === teamId)?.id ?? null;

  return (
    <>
      <p className="no-print">
        <a href={routeHref({ page: 'service', serviceId: plan.id })}>Back to the plan</a>
      </p>
      <h1>Rehearse {plan.title}</h1>
      <p className="muted">{formatServiceDate(plan.startsAt)}</p>
      <div className="field-row no-print rehearse-tools">
        <SelectField label="Notes for" value={teamId} onChange={setTeamId}>
          <option value="">Every team</option>
          {choices.map((team) => (
            <option key={team.id} value={String(team.id)}>
              {team.name}
            </option>
          ))}
        </SelectField>
        <div className="field">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              window.print();
            }}
          >
            Print
          </button>
        </div>
      </div>
      {songs.status === 'failed' ? <Notice message={songs.error} tone="error" /> : null}
      {teams.status === 'failed' ? <Notice message={teams.error} tone="error" /> : null}
      {planSongs.length === 0 ? <p>No songs in this plan yet.</p> : null}
      <ol className="rehearse-songs">
        {planSongs.map((song) => (
          <li key={song.item.id}>
            <SongCard song={song} teamId={chosenTeam} />
          </li>
        ))}
      </ol>
    </>
  );
}
