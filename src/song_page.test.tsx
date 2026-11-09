// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SongPage } from './song_page';
import { fakeApi, type FakeApi } from './test_fetch';
import { arrangementJson, songJson } from './test_fixtures';

const CHART = 'Verse 1\n[G]Amazing [C]grace, how [D/F#]sweet';

const SONG = songJson({
  tags: ['hymn', 'grace'],
  last_scheduled_on: '2026-11-01',
  times_used_12_months: 6,
  arrangements: [
    arrangementJson({
      chart: CHART,
      keys: ['G', 'A'],
      notes: 'Capo 2 for the acoustic',
      audio_url: 'https://example.org/grace.mp3',
    }),
  ],
});

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  const api = fakeApi({ 'GET /api/songs/3': { json: SONG }, ...routes });
  vi.stubGlobal('fetch', api.fetch);
  render(<SongPage songId={3} />);
  return api;
}

function bodyOf(api: FakeApi, method: string, url: string): unknown {
  return api.sent.find((request) => request.method === method && request.url === url)?.body;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('SongPage', () => {
  it('shows the song, when it was last scheduled and how often it was played', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeTruthy();
    expect(screen.getByText('Sunday 1 November 2026')).toBeTruthy();
    expect(screen.getByText('6 times')).toBeTruthy();
    const form = within(screen.getByRole('form', { name: 'Edit the arrangement Default' }));
    expect(form.getByLabelText<HTMLInputElement>('Other keys', { exact: false }).value).toBe('A');
    expect(form.getByLabelText<HTMLTextAreaElement>('Notes').value).toBe('Capo 2 for the acoustic');
    expect(form.getByRole('link', { name: 'Listen to the reference recording' })).toBeTruthy();
  });

  it('saves the song’s fields and tags', async () => {
    const api = renderPage({ 'PATCH /api/songs/3': { json: SONG } });
    const form = within(await screen.findByRole('form', { name: 'Song' }));
    expect(form.getByLabelText<HTMLInputElement>('Tags', { exact: false }).value).toBe(
      'hymn, grace',
    );
    fireEvent.change(form.getByLabelText('Tags', { exact: false }), {
      target: { value: 'hymn, grace, Opwekking' },
    });
    fireEvent.change(form.getByLabelText('CCLI number'), { target: { value: '' } });
    fireEvent.click(form.getByRole('button', { name: 'Save song' }));
    expect(await screen.findByText('Saved Amazing Grace.')).toBeTruthy();
    expect(bodyOf(api, 'PATCH', '/api/songs/3')).toEqual({
      title: 'Amazing Grace',
      authors: 'John Newton',
      ccli: null,
      tags: ['hymn', 'grace', 'Opwekking'],
    });
  });

  it('saves every field of an arrangement', async () => {
    const api = renderPage({ 'PATCH /api/songs/3/arrangements/7': { json: arrangementJson() } });
    const form = within(await screen.findByRole('form', { name: 'Edit the arrangement Default' }));
    fireEvent.change(form.getByLabelText('Other keys', { exact: false }), {
      target: { value: 'a, bb' },
    });
    fireEvent.change(form.getByLabelText('Tempo (BPM)'), { target: { value: '68' } });
    fireEvent.change(form.getByLabelText('Meter'), { target: { value: '3/4' } });
    fireEvent.change(form.getByLabelText('Sequence', { exact: false }), {
      target: { value: 'V1 V2 C V3' },
    });
    fireEvent.change(form.getByLabelText('Reference recording', { exact: false }), {
      target: { value: 'https://example.org/live.mp3' },
    });
    fireEvent.change(form.getByLabelText('Chart (ChordPro)'), {
      target: { value: '[G]Amazing grace' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Save arrangement' }));
    expect(await screen.findByText('Saved the arrangement Default.')).toBeTruthy();
    expect(bodyOf(api, 'PATCH', '/api/songs/3/arrangements/7')).toEqual({
      name: 'Default',
      key: 'G',
      tempo_bpm: 68,
      meter: '3/4',
      length_seconds: 300,
      sequence: 'V1 V2 C V3',
      chart: '[G]Amazing grace',
      keys: ['G', 'A', 'Bb'],
      notes: 'Capo 2 for the acoustic',
      audio_url: 'https://example.org/live.mp3',
    });
  });

  it('previews the chart, transposed to the key the musician picks', async () => {
    renderPage();
    const form = within(await screen.findByRole('form', { name: 'Edit the arrangement Default' }));
    const preview = within(form.getByRole('region', { name: 'Chart preview' }));
    expect(preview.getByRole('heading', { name: 'Verse 1' })).toBeTruthy();
    expect(
      preview
        .getAllByText(/^(G|C|D\/F#)$/, { selector: '.chart-chord' })
        .map((chord) => chord.textContent),
    ).toEqual(['G', 'C', 'D/F#']);
    fireEvent.change(form.getByLabelText('Preview in'), { target: { value: 'Bb' } });
    expect(
      preview
        .getAllByText(/^(Bb|Eb|F\/A)$/, { selector: '.chart-chord' })
        .map((chord) => chord.textContent),
    ).toEqual(['Bb', 'Eb', 'F/A']);
    fireEvent.change(form.getByLabelText('Chart (ChordPro)'), {
      target: { value: 'Chorus\n[D]My chains are gone' },
    });
    expect(preview.getByRole('heading', { name: 'Chorus' })).toBeTruthy();
    expect(preview.getByText('F', { selector: '.chart-chord' })).toBeTruthy();
  });

  it('offers the keys the team plays it in first, then every key', async () => {
    renderPage();
    const form = within(await screen.findByRole('form', { name: 'Edit the arrangement Default' }));
    const select = form.getByLabelText('Preview in');
    const groups = within(select).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      'Keys the team plays',
      'Every key',
    ]);
    const [teamKeys] = groups;
    if (teamKeys === undefined) {
      throw new Error('no group of the team’s keys');
    }
    expect(
      within(teamKeys)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['G (default)', 'A']);
  });

  it('refuses a recording link that is not a web link, without sending it', async () => {
    const api = renderPage();
    const form = within(await screen.findByRole('form', { name: 'Edit the arrangement Default' }));
    fireEvent.change(form.getByLabelText('Reference recording', { exact: false }), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Save arrangement' }));
    expect(
      form.getByText('Give a web link that starts with https://, or leave it blank.'),
    ).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('PATCH /api/songs/3/arrangements/7');
  });

  it('never links a stored recording that is not a web link', async () => {
    renderPage({
      'GET /api/songs/3': {
        json: songJson({ arrangements: [arrangementJson({ audio_url: 'javascript:alert(1)' })] }),
      },
    });
    await screen.findByRole('form', { name: 'Edit the arrangement Default' });
    expect(screen.queryByRole('link', { name: 'Listen to the reference recording' })).toBeNull();
  });

  it('adds an arrangement, then saves the fields a new arrangement does not take', async () => {
    const api = renderPage({
      'POST /api/songs/3/arrangements': {
        status: 201,
        json: arrangementJson({ id: 8, name: 'Acoustic', key: 'A' }),
      },
      'PATCH /api/songs/3/arrangements/8': { json: arrangementJson({ id: 8 }) },
    });
    const form = within(
      await screen.findByRole('form', { name: 'Add an arrangement of Amazing Grace' }),
    );
    fireEvent.change(form.getByLabelText('Name', { exact: false }), {
      target: { value: 'Acoustic' },
    });
    fireEvent.change(form.getByLabelText('Default key', { exact: false }), {
      target: { value: 'a' },
    });
    fireEvent.change(form.getByLabelText('Tempo (BPM)'), { target: { value: '68' } });
    fireEvent.change(form.getByLabelText('Length', { exact: false }), {
      target: { value: '4:10' },
    });
    fireEvent.change(form.getByLabelText('Notes'), { target: { value: 'Guitar leads' } });
    fireEvent.click(form.getByRole('button', { name: 'Add arrangement' }));
    expect(await screen.findByText('Added the arrangement Acoustic.')).toBeTruthy();
    expect(bodyOf(api, 'POST', '/api/songs/3/arrangements')).toEqual({
      name: 'Acoustic',
      key: 'A',
      tempo_bpm: 68,
      meter: '4/4',
      length_seconds: 250,
      sequence: '',
      chart: '',
    });
    expect(bodyOf(api, 'PATCH', '/api/songs/3/arrangements/8')).toMatchObject({
      keys: ['A'],
      notes: 'Guitar leads',
      audio_url: null,
    });
  });

  it('adds an arrangement in one request when it has only the fields a new one takes', async () => {
    const api = renderPage({
      'POST /api/songs/3/arrangements': {
        status: 201,
        json: arrangementJson({ id: 8, name: 'Acoustic', key: 'A' }),
      },
    });
    const form = within(
      await screen.findByRole('form', { name: 'Add an arrangement of Amazing Grace' }),
    );
    fireEvent.change(form.getByLabelText('Name', { exact: false }), {
      target: { value: 'Acoustic' },
    });
    fireEvent.change(form.getByLabelText('Default key', { exact: false }), {
      target: { value: 'A' },
    });
    fireEvent.change(form.getByLabelText('Tempo (BPM)'), { target: { value: '68' } });
    fireEvent.change(form.getByLabelText('Length', { exact: false }), {
      target: { value: '4:10' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add arrangement' }));
    expect(await screen.findByText('Added the arrangement Acoustic.')).toBeTruthy();
    expect(api.sentRoutes().filter((route) => route.startsWith('PATCH'))).toEqual([]);
  });

  it('says what happened when the song cannot be loaded', async () => {
    renderPage({ 'GET /api/songs/3': { status: 404, json: { detail: 'Song not found' } } });
    expect(
      await screen.findByText('Song not found. It may have been removed: reload the page.'),
    ).toBeTruthy();
  });
});
