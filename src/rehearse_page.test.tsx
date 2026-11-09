// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RehearsePage } from './rehearse_page';
import { fakeApi, type FakeApi } from './test_fetch';
import {
  arrangementJson,
  itemJson,
  personJson,
  serviceJson,
  songItemJson,
  songJson,
  teamJson,
} from './test_fixtures';

const CHART = 'Verse 1\n[G]Amazing [C]grace\n{c: Keys alone}';

const SERVICE = serviceJson({
  items: [
    itemJson({ id: 100, position: 0, title: 'Welcome' }),
    songItemJson({
      id: 101,
      position: 1,
      arrangement: {
        id: 7,
        song_title: 'Amazing Grace',
        name: 'Default',
        key: 'Bb',
        tempo_bpm: 72,
        meter: '3/4',
        sequence: 'V1 C V2 C',
        chart: CHART,
      },
      key: 'Bb',
      notes: 'Slow intro',
      song_leader: personJson({ id: 2, name: 'Ben Bakker' }),
      team_notes: [
        { team_id: 5, team_name: 'Worship band', note: 'Drums from the chorus' },
        { team_id: 6, team_name: 'Stream', note: 'Lyrics from verse 1' },
      ],
    }),
    songItemJson({
      id: 102,
      position: 2,
      title: 'King of Kings',
      arrangement: {
        id: 9,
        song_title: 'King of Kings',
        name: 'Acoustic',
        key: 'D',
        tempo_bpm: 68,
        meter: '4/4',
        sequence: 'V1 C',
        chart: '[D]In the darkness',
      },
      key: null,
    }),
  ],
});

const SONGS = [
  songJson({
    arrangements: [
      arrangementJson({ key: 'G', chart: CHART, audio_url: 'https://example.org/grace.mp3' }),
    ],
  }),
];

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  const api = fakeApi({
    'GET /api/services/20': { json: SERVICE },
    'GET /api/songs': { json: SONGS },
    'GET /api/teams': {
      json: [teamJson(), teamJson({ id: 6, name: 'Stream', positions: [] })],
    },
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetch);
  render(<RehearsePage serviceId={20} />);
  return api;
}

function songCard(title: string): HTMLElement {
  const card = screen.getByRole('heading', { level: 2, name: title }).closest('article');
  if (card === null) {
    throw new Error(`no card for ${title}`);
  }
  return card;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('RehearsePage', () => {
  it('shows each song of the plan in order, and nothing else', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Rehearse Sunday morning' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(['Amazing Grace', 'King of Kings']);
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it('shows a song’s arrangement, key, tempo, meter, sequence and leader', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Amazing Grace' });
    const card = within(songCard('Amazing Grace'));
    const facts = Object.fromEntries(
      card
        .getAllByRole('term')
        .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
    );
    expect(facts).toEqual({
      Arrangement: 'Default',
      Key: 'Bb (set for this service)',
      Tempo: '72 BPM, 3/4',
      Sequence: 'V1 C V2 C',
      'Led by': 'Ben Bakker',
    });
  });

  it('shows the chart chords over lyrics, moved to the item’s key', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Amazing Grace' });
    const card = within(songCard('Amazing Grace'));
    expect(card.getByRole('heading', { level: 3, name: 'Verse 1' })).toBeTruthy();
    expect(
      card.getAllByText(/./, { selector: '.chart-chord' }).map((chord) => chord.textContent),
    ).toEqual(['Bb', 'Eb']);
    expect(card.getByText('Keys alone')).toBeTruthy();
    const king = within(songCard('King of Kings'));
    expect(king.getByText('D', { selector: '.chart-chord' })).toBeTruthy();
  });

  it('shows the notes for the team the musician picks', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Amazing Grace' });
    const card = within(songCard('Amazing Grace'));
    expect(card.getByText('Slow intro')).toBeTruthy();
    expect(card.getByText('Drums from the chorus')).toBeTruthy();
    expect(card.getByText('Lyrics from verse 1')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Notes for'), { target: { value: '5' } });
    expect(card.getByText('Drums from the chorus')).toBeTruthy();
    expect(card.queryByText('Lyrics from verse 1')).toBeNull();
    expect(card.getByText('Slow intro')).toBeTruthy();
  });

  it('links the reference recording', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 2, name: 'Amazing Grace' });
    const card = within(songCard('Amazing Grace'));
    expect(card.getByRole('link', { name: 'Reference recording' }).getAttribute('href')).toBe(
      'https://example.org/grace.mp3',
    );
  });

  it('says the chart is in its written key when the song library cannot be loaded', async () => {
    renderPage({ 'GET /api/songs': { status: 503 } });
    await screen.findByRole('heading', { level: 2, name: 'Amazing Grace' });
    const card = within(songCard('Amazing Grace'));
    expect(
      await card.findByText(
        'This chart is shown as written, not in Bb: the song library could not be loaded. Reload the page to try again.',
      ),
    ).toBeTruthy();
    expect(
      card.getAllByText(/./, { selector: '.chart-chord' }).map((chord) => chord.textContent),
    ).toEqual(['G', 'C']);
  });

  it('prints from the Print button', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('says so when the plan has no songs', async () => {
    renderPage({ 'GET /api/services/20': { json: serviceJson({ items: [itemJson()] }) } });
    expect(await screen.findByText('No songs in this plan yet.')).toBeTruthy();
  });

  it('says what happened when the plan cannot be loaded', async () => {
    renderPage({ 'GET /api/services/20': { status: 404, json: { detail: 'Service not found' } } });
    expect(
      await screen.findByText('Service not found. It may have been removed: reload the page.'),
    ).toBeTruthy();
  });
});
