// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SongsPage } from './songs_page';
import { fakeApi, type FakeApi } from './test_fetch';
import { arrangementJson, songJson } from './test_fixtures';

const GRACE = songJson({
  tags: ['hymn', 'grace'],
  last_scheduled_on: '2026-11-01',
  times_used_12_months: 6,
  arrangements: [arrangementJson({ keys: ['G', 'A'] })],
});

const KING = songJson({
  id: 4,
  title: 'King of Kings',
  authors: 'Brooke Ligertwood',
  ccli: '7127647',
  tags: ['easter'],
  arrangements: [],
});

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  const api = fakeApi({ 'GET /api/songs': { json: [GRACE, KING] }, ...routes });
  vi.stubGlobal('fetch', api.fetch);
  render(<SongsPage />);
  return api;
}

function cardOf(title: string): HTMLElement {
  const item = screen.getByRole('link', { name: title }).closest('li');
  if (item === null) {
    throw new Error(`no card for ${title}`);
  }
  return item;
}

function shownTitles(): string[] {
  const list = screen.getByRole('list', { name: 'Songs found' });
  return within(list)
    .getAllByRole('heading')
    .map((heading) => heading.textContent);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = '#/songs';
});

afterEach(cleanup);

describe('SongsPage', () => {
  it('lists songs with their tags, when they were last scheduled and how often they were played', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: 'Amazing Grace' });
    expect(link.getAttribute('href')).toBe('#/songs/3');
    const card = within(cardOf('Amazing Grace'));
    expect(card.getByText('John Newton · CCLI 22025')).toBeTruthy();
    expect(
      within(card.getByRole('list', { name: 'Tags' }))
        .getAllByRole('listitem')
        .map((tag) => tag.textContent),
    ).toEqual(['hymn', 'grace']);
    expect(card.getByText('Last scheduled Sunday 1 November 2026')).toBeTruthy();
    expect(card.getByText('Played 6 times in the last 12 months')).toBeTruthy();
    expect(card.getByText('Default: G, A · 72 BPM, 4/4 · 5:00')).toBeTruthy();
    const king = within(cardOf('King of Kings'));
    expect(king.getByText('Never scheduled')).toBeTruthy();
    expect(king.getByText(/No arrangements yet/)).toBeTruthy();
  });

  it('filters by tag, offering every tag the songs have', async () => {
    const api = renderPage({ 'GET /api/songs?tag=easter': { json: [KING] } });
    await screen.findByRole('link', { name: 'Amazing Grace' });
    const tag = screen.getByLabelText('Tag');
    expect(
      within(tag)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Every tag', 'easter', 'grace', 'hymn']);
    fireEvent.change(tag, { target: { value: 'easter' } });
    expect(await screen.findByText('1 song found.')).toBeTruthy();
    expect(shownTitles()).toEqual(['King of Kings']);
    expect(api.sentRoutes()).toContain('GET /api/songs?tag=easter');
  });

  it('searches, together with the tag', async () => {
    const api = renderPage({
      'GET /api/songs?q=grace': { json: [GRACE] },
      'GET /api/songs?tag=hymn&q=grace': { json: [GRACE] },
    });
    await screen.findByRole('link', { name: 'Amazing Grace' });
    fireEvent.change(screen.getByLabelText('Search', { exact: false }), {
      target: { value: 'grace' },
    });
    expect(await screen.findByText('1 song found.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'hymn' } });
    expect(await screen.findByRole('list', { name: 'Songs found' })).toBeTruthy();
    expect(shownTitles()).toEqual(['Amazing Grace']);
    expect(api.sentRoutes()).toContain('GET /api/songs?tag=hymn&q=grace');
  });

  it('says so when nothing matches', async () => {
    renderPage({ 'GET /api/songs?q=zzz': { json: [] } });
    await screen.findByRole('link', { name: 'Amazing Grace' });
    fireEvent.change(screen.getByLabelText('Search', { exact: false }), {
      target: { value: 'zzz' },
    });
    expect(await screen.findByText('No songs match. Try fewer words or every tag.')).toBeTruthy();
  });

  it('creates a song with its tags and opens it', async () => {
    const api = renderPage({
      'POST /api/songs': { status: 201, json: songJson({ arrangements: [] }) },
    });
    const form = within(await screen.findByRole('form', { name: 'New song' }));
    fireEvent.change(form.getByLabelText('Title'), { target: { value: 'Amazing Grace' } });
    fireEvent.change(form.getByLabelText('Authors'), { target: { value: 'John Newton' } });
    fireEvent.change(form.getByLabelText('Tags', { exact: false }), {
      target: { value: 'hymn, grace' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add song' }));
    await vi.waitFor(() => {
      expect(window.location.hash).toBe('#/songs/3');
    });
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      title: 'Amazing Grace',
      authors: 'John Newton',
      tags: ['hymn', 'grace'],
    });
  });

  it('links to the song usage report', async () => {
    renderPage();
    expect(
      (await screen.findByRole('link', { name: 'Song usage report' })).getAttribute('href'),
    ).toBe('#/reports/songs');
  });

  it('says what to fix instead of sending a song without a title', async () => {
    const api = renderPage();
    const form = within(await screen.findByRole('form', { name: 'New song' }));
    fireEvent.click(form.getByRole('button', { name: 'Add song' }));
    expect(form.getByText('Give the song a title.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/songs');
  });
});
