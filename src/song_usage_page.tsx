/**
 * Song usage (`#/reports/songs`): how often each song was played in the
 * services of a date range, most first, as the church reports it to CCLI.
 */
import { useCallback, useState, type ReactElement } from 'react';

import { api } from './api_client';
import { formatCalendarDate, parseDateRange, type DateRange } from './calendar_date';
import { Notice, TextField } from './form_fields';
import { routeHref } from './routes';
import { useResource } from './use_resource';

function totalText(songs: number, plays: number): string {
  const songText = songs === 1 ? '1 song' : `${String(songs)} songs`;
  const playText = plays === 1 ? 'once' : `${String(plays)} times`;
  return `${songText}, played ${playText} in all.`;
}

export function SongUsagePage(): ReactElement {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'from' | 'to', string>>>({});
  const [range, setRange] = useState<DateRange | null>(null);
  const load = useCallback(
    (signal: AbortSignal) =>
      range === null ? Promise.resolve(null) : api.songUsage(range.from, range.to, signal),
    [range],
  );
  const [usage] = useResource(load);
  const rows = usage.status === 'ready' ? usage.value : null;

  return (
    <>
      <p>
        <a href={routeHref({ page: 'songs' })}>Songs</a>
      </p>
      <h1>Song usage</h1>
      <p>
        How often each song was played in the services of a range of days, for the church&rsquo;s
        CCLI report.
      </p>
      <form
        noValidate
        className="panel inline-form"
        aria-label="Range"
        onSubmit={(event) => {
          event.preventDefault();
          const result = parseDateRange(from, to);
          if (!result.ok) {
            setErrors(result.errors);
            return;
          }
          setErrors({});
          setRange(result.range);
        }}
      >
        <TextField label="From" type="date" value={from} onChange={setFrom} error={errors.from} />
        <TextField label="To" type="date" value={to} onChange={setTo} error={errors.to} />
        <button type="submit">Show usage</button>
      </form>
      {range !== null && usage.status === 'loading' ? <p>Loading the report…</p> : null}
      {usage.status === 'failed' ? <Notice message={usage.error} tone="error" /> : null}
      {range === null || rows === null ? null : rows.length === 0 ? (
        <p>No songs were played in this range.</p>
      ) : (
        <>
          <table className="report">
            <caption>
              {formatCalendarDate(range.from)} to {formatCalendarDate(range.to)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Song</th>
                <th scope="col">Authors</th>
                <th scope="col">CCLI number</th>
                <th scope="col">Times played</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.songId}>
                  <td>
                    <a href={routeHref({ page: 'song', songId: row.songId })}>{row.title}</a>
                  </td>
                  <td>{row.authors}</td>
                  <td>{row.ccli ?? 'None'}</td>
                  <td className="number">{String(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {totalText(
              rows.length,
              rows.reduce((sum, row) => sum + row.count, 0),
            )}
          </p>
        </>
      )}
    </>
  );
}
