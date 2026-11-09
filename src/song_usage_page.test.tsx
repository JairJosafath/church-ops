// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SongUsagePage } from './song_usage_page';
import { fakeApi, type FakeApi } from './test_fetch';
import { songUsageJson } from './test_fixtures';

const USAGE_URL = 'GET /api/reports/song-usage?from=2026-01-01&to=2026-06-30';

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(<SongUsagePage />);
  return api;
}

function ask(from: string, to: string): void {
  fireEvent.change(screen.getByLabelText('From'), { target: { value: from } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: to } });
  fireEvent.click(screen.getByRole('button', { name: 'Show usage' }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('SongUsagePage', () => {
  it('shows how often each song was played in the range, most first, for the CCLI report', async () => {
    const api = renderPage({
      [USAGE_URL]: {
        json: [
          songUsageJson(),
          songUsageJson({
            song_id: 4,
            title: 'King of Kings',
            authors: 'Brooke Ligertwood',
            ccli: null,
            count: 1,
          }),
        ],
      },
    });
    ask('2026-01-01', '2026-06-30');
    const table = await screen.findByRole('table', {
      name: /Thursday 1 January 2026 to Tuesday 30 June 2026/,
    });
    const rows = within(table)
      .getAllByRole('row')
      .map((row) => [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ['Song', 'Authors', 'CCLI number', 'Times played'],
      ['Amazing Grace', 'John Newton', '22025', '4'],
      ['King of Kings', 'Brooke Ligertwood', 'None', '1'],
    ]);
    expect(screen.getByText('2 songs, played 5 times in all.')).toBeTruthy();
    expect(api.sentRoutes()).toEqual([USAGE_URL]);
  });

  it('says so when no song was played in the range', async () => {
    renderPage({ [USAGE_URL]: { json: [] } });
    ask('2026-01-01', '2026-06-30');
    expect(await screen.findByText('No songs were played in this range.')).toBeTruthy();
  });

  it('says what to fix instead of asking for a range that ends before it starts', () => {
    const api = renderPage();
    ask('2026-07-01', '2026-06-30');
    expect(screen.getByText('The last day comes after the first.')).toBeTruthy();
    expect(api.sent).toEqual([]);
  });

  it('says what happened when the report cannot be loaded', async () => {
    renderPage({ [USAGE_URL]: { status: 500 } });
    ask('2026-01-01', '2026-06-30');
    expect(await screen.findByText('The server failed (500). Try again in a moment.')).toBeTruthy();
  });
});
