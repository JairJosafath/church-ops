import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import type { Song } from './api_types';
import { formatCalendarDate } from './calendar_date';
import { ActionNotice, Notice, SelectField, TextField } from './form_fields';
import { formatLength } from './plan_times';
import { routeHref } from './routes';
import { formatTimesUsed, parseTags } from './song_form';
import { useAction } from './use_action';
import { navigate } from './use_hash_route';
import { useResource } from './use_resource';

function NewSongForm(): ReactElement {
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [ccli, setCcli] = useState('');
  const [tags, setTags] = useState('');
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
        void action.run(async () => {
          const song = await api.createSong({
            title: title.trim(),
            authors: authors.trim(),
            ccli: ccli.trim() === '' ? null : ccli.trim(),
            tags: parseTags(tags),
          });
          navigate({ page: 'song', songId: song.id });
          return `Added ${song.title}.`;
        });
      }}
    >
      <h2 id="new-song-heading">New song</h2>
      <div className="field-row">
        <TextField label="Title" value={title} onChange={setTitle} error={error} required />
        <TextField label="Authors" value={authors} onChange={setAuthors} />
        <TextField label="CCLI number" value={ccli} onChange={setCcli} inputMode="numeric" />
      </div>
      <TextField
        label="Tags"
        value={tags}
        onChange={setTags}
        hint="Separated by commas, such as hymn, advent, fast."
      />
      <button type="submit" disabled={action.busy}>
        Add song
      </button>
      <ActionNotice message={action.message} />
    </form>
  );
}

/** Every tag the songs have, once each, in alphabetical order. */
function tagsOf(songs: readonly Song[]): string[] {
  return [...new Set(songs.flatMap((song) => song.tags))].sort((a, b) => a.localeCompare(b));
}

function SongCard({ song }: { readonly song: Song }): ReactElement {
  return (
    <li className="card">
      <div className="card-head">
        <h3>
          <a href={routeHref({ page: 'song', songId: song.id })}>{song.title}</a>
        </h3>
        <span className="muted">
          {song.authors}
          {song.ccli === null ? '' : ` · CCLI ${song.ccli}`}
        </span>
      </div>
      {song.tags.length === 0 ? null : (
        <ul className="chip-list tags" aria-label="Tags">
          {song.tags.map((tag) => (
            <li key={tag} className="chip">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <p className="song-use">
        <span>
          {song.lastScheduledOn === null
            ? 'Never scheduled'
            : `Last scheduled ${formatCalendarDate(song.lastScheduledOn)}`}
        </span>
        <span>
          Played {formatTimesUsed(song.timesUsed12Months).toLowerCase()} in the last 12 months
        </span>
      </p>
      {song.arrangements.length === 0 ? (
        <p>No arrangements yet: a service needs one to play this song.</p>
      ) : (
        <ul className="arrangement-list">
          {song.arrangements.map((arrangement) => (
            <li key={arrangement.id}>
              {`${arrangement.name}: ${arrangement.keys.join(', ')} · ${String(arrangement.tempoBpm)} BPM, ${arrangement.meter} · ${formatLength(arrangement.lengthSeconds)}`}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function foundText(count: number): string {
  return count === 1 ? '1 song found.' : `${String(count)} songs found.`;
}

/** The church's songs, found by tag and by words, each linking to its arrangements and charts. */
export function SongsPage(): ReactElement {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const filtering = tag !== '' || query.trim() !== '';
  const loadAll = useCallback((signal: AbortSignal) => api.listSongs(signal), []);
  const loadFound = useCallback(
    (signal: AbortSignal) =>
      tag === '' && query.trim() === ''
        ? Promise.resolve(null)
        : api.findSongs({ tag: tag === '' ? null : tag, query }, signal),
    [tag, query],
  );
  const [all] = useResource(loadAll);
  const [found] = useResource(loadFound);
  const shown = filtering ? found : all;
  const songs = shown.status === 'ready' ? shown.value : null;
  const tags = all.status === 'ready' ? tagsOf(all.value) : [];

  return (
    <>
      <h1>Songs</h1>
      <p>
        <a href={routeHref({ page: 'song_usage' })}>Song usage report</a>, for CCLI.
      </p>
      <NewSongForm />
      <section aria-labelledby="songs-heading">
        <h2 id="songs-heading">All songs</h2>
        <form
          role="search"
          aria-label="Find songs"
          className="field-row"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <TextField label="Search" value={query} onChange={setQuery} hint="Title or authors." />
          <SelectField label="Tag" value={tag} onChange={setTag}>
            <option value="">Every tag</option>
            {tags.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </SelectField>
        </form>
        {shown.status === 'loading' ? <p>Loading songs…</p> : null}
        {shown.status === 'failed' ? <Notice message={shown.error} tone="error" /> : null}
        <Notice
          message={
            !filtering || songs === null
              ? null
              : songs.length === 0
                ? 'No songs match. Try fewer words or every tag.'
                : foundText(songs.length)
          }
        />
        {!filtering && songs !== null && songs.length === 0 ? (
          <p>No songs yet. Add the first one above.</p>
        ) : null}
        {songs === null || songs.length === 0 ? null : (
          <ul className="card-list" aria-label="Songs found">
            {songs.map((song) => (
              <SongCard key={song.id} song={song} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
