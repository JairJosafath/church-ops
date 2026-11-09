// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePerson } from './api_types';
import { ServicePage } from './service_page';
import { fakeApi, type FakeApi } from './test_fetch';
import {
  itemJson,
  needJson,
  personJson,
  planTimeJson,
  requestJson,
  serviceJson,
  serviceTypeJson,
  songItemJson,
  songJson,
  teamJson,
} from './test_fixtures';

// v0.2 songs and plans: the people who may lead a song.
const ANNA = decodePerson(personJson(), 'person');
const BEN = decodePerson(personJson({ id: 2, name: 'Ben Bakker' }), 'person');

const SERVICE = serviceJson({
  items: [
    itemJson({ id: 100, position: 0, title: 'Psalm 23', length_seconds: 180 }),
    songItemJson({ id: 101, position: 1, length_seconds: 300 }),
    itemJson({ id: 102, position: 2, kind: 'header', title: 'Word', length_seconds: 0 }),
    itemJson({ id: 103, position: 3, kind: 'sermon', title: 'Sermon', length_seconds: 1500 }),
  ],
  requests: [
    requestJson({ status: 'accepted', person: personJson({ id: 2, name: 'Ben Bakker' }) }),
  ],
  needed: [needJson({ count: 1, accepted: 1, open: 0 })],
});

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}, focusTeams = false): FakeApi {
  const api = fakeApi({
    'GET /api/services/20': { json: SERVICE },
    'GET /api/songs': { json: [songJson()] },
    'GET /api/teams': { json: [teamJson()] },
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetch);
  render(<ServicePage serviceId={20} people={[ANNA, BEN]} focusTeams={focusTeams} />);
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('ServicePage', () => {
  it('shows each item at its computed start and the end of the service', async () => {
    renderPage();
    const list = await screen.findByRole('list', { name: 'Service order' });
    const order = within(list).getAllByRole('listitem');
    expect(order.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Psalm 23 Reading',
      'Amazing Grace Song',
      'Word Header',
      'Sermon Sermon',
    ]);
    expect(order.map((item) => item.querySelector('time')?.textContent)).toEqual([
      '10:00',
      '10:03',
      '10:08',
      '10:08',
    ]);
    expect(screen.getByText('Ends', { selector: 'dt' }).nextElementSibling?.textContent).toBe(
      '10:33',
    );
    expect(screen.getByText('Length', { selector: 'dt' }).nextElementSibling?.textContent).toBe(
      '33:00',
    );
  });

  it('shows the key a song item is played in', async () => {
    renderPage();
    expect(await screen.findByText('Key Bb (set for this service)')).toBeTruthy();
  });

  it('moves an item down by sending the new order', async () => {
    const api = renderPage({ 'PUT /api/services/20/items/order': { json: [] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Move Psalm 23 down' }));
    expect(await screen.findByText('Moved.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'PUT')?.body).toEqual({
      item_ids: [101, 100, 102, 103],
    });
  });

  it('removes an item only once the planner confirms', async () => {
    const api = renderPage({ 'DELETE /api/services/20/items/103': { status: 204 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Sermon' }));
    expect(api.sentRoutes()).not.toContain('DELETE /api/services/20/items/103');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Removed Sermon.')).toBeTruthy();
    expect(api.sentRoutes()).toContain('DELETE /api/services/20/items/103');
  });

  it('adds a song item in its own key, with the arrangement it picked', async () => {
    const api = renderPage({
      'POST /api/services/20/items': { status: 201, json: songItemJson() },
    });
    const form = within(await screen.findByRole('form', { name: 'Add an item' }));
    await screen.findByRole('option', { name: 'Amazing Grace: Default (G, 72 BPM, 4/4)' });
    fireEvent.change(form.getByLabelText('Arrangement'), { target: { value: '7' } });
    fireEvent.change(form.getByLabelText('Key for this service'), { target: { value: 'a' } });
    expect(form.getByText(/Plays in A\./)).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByText('Added Amazing Grace.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      kind: 'song',
      title: 'Amazing Grace',
      length_seconds: 300,
      arrangement_id: 7,
      key: 'A',
      off_stream: false,
    });
  });

  it('says what to fix instead of sending an item without a title', async () => {
    const api = renderPage();
    const form = within(await screen.findByRole('form', { name: 'Add an item' }));
    fireEvent.change(form.getByLabelText('Kind'), { target: { value: 'reading' } });
    fireEvent.click(form.getByRole('button', { name: 'Add item' }));
    expect(form.getByText('Give the item a title.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/services/20/items');
  });

  it('edits an item', async () => {
    const api = renderPage({ 'PATCH /api/services/20/items/100': { json: itemJson() } });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Psalm 23' }));
    const form = within(screen.getByRole('form', { name: 'Edit Psalm 23' }));
    fireEvent.change(form.getByLabelText('Length'), { target: { value: '4:00' } });
    fireEvent.click(form.getByRole('button', { name: 'Save item' }));
    expect(await screen.findByText('Saved Psalm 23.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'PATCH')?.body).toMatchObject({
      length_seconds: 240,
      arrangement_id: null,
    });
  });

  // v0.2 scheduling
  it('shows the Teams section with each needed position and its people', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Teams' })).toBeTruthy();
    const drums = within(screen.getByRole('list', { name: 'People for Drums' }));
    expect(drums.getByText('Ben Bakker')).toBeTruthy();
    expect(drums.getByText('Confirmed')).toBeTruthy();
  });

  it('puts the focus on the Teams section when opened there', async () => {
    renderPage({}, true);
    const heading = await screen.findByRole('heading', { name: 'Teams' });
    expect(document.activeElement).toBe(heading);
  });

  // v0.2 songs and plans

  it('links to the Rehearse view of the plan', async () => {
    renderPage();
    expect((await screen.findByRole('link', { name: 'Rehearse' })).getAttribute('href')).toBe(
      '#/services/20/rehearse',
    );
  });

  it('says what happened when the plan cannot be loaded', async () => {
    renderPage({ 'GET /api/services/20': { status: 404, json: { detail: 'Service not found' } } });
    expect(
      await screen.findByText('Service not found. It may have been removed: reload the page.'),
    ).toBeTruthy();
  });
});

// v0.2 songs and plans

const STREAM = teamJson({ id: 6, name: 'Stream', positions: [] });

const PLAN = serviceJson({
  service_type_id: 4,
  series: 'Advent',
  ends_at: '2026-11-15T11:15:00+01:00',
  times: [
    planTimeJson({ id: 31, name: 'Band rehearsal' }),
    planTimeJson({
      id: 0,
      kind: 'service',
      name: 'Service',
      starts_at: '2026-11-15T10:00:00+01:00',
      ends_at: '2026-11-15T11:15:00+01:00',
    }),
  ],
  items: [
    songItemJson({
      id: 101,
      position: 0,
      notes: 'Slow intro',
      song_leader: personJson({ id: 2, name: 'Ben Bakker' }),
      team_notes: [
        { team_id: 5, team_name: 'Worship band', note: 'Keys alone in verse 1' },
        { team_id: 6, team_name: 'Stream', note: 'Lyrics from verse 1' },
      ],
    }),
    itemJson({ id: 103, position: 1, kind: 'sermon', title: 'Sermon', length_seconds: 1500 }),
  ],
});

function renderPlan(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  return renderPage({
    'GET /api/services/20': { json: PLAN },
    'GET /api/teams': { json: [teamJson(), STREAM] },
    'GET /api/service-types': {
      json: [serviceTypeJson(), serviceTypeJson({ id: 5, name: 'Youth evening' })],
    },
    ...routes,
  });
}

function planItem(title: string): HTMLElement {
  const list = screen.getByRole('list', { name: 'Service order' });
  const item = within(list)
    .getAllByRole('listitem')
    .find((entry) => within(entry).queryByRole('heading', { name: new RegExp(`^${title}`) }));
  if (item === undefined) {
    throw new Error(`no item ${title}`);
  }
  return item;
}

describe('ServicePage, for the worship team', () => {
  it('shows the plan’s series and its times, rehearsals and the service', async () => {
    renderPlan();
    expect(await screen.findByText(/Sunday morning · Advent · Streamed/)).toBeTruthy();
    const times = within(screen.getByRole('list', { name: 'Times' }));
    expect(times.getAllByRole('listitem').map((time) => time.textContent)).toEqual([
      'RehearsalBand rehearsalThursday 12 November 2026, 19:30–21:30Remove',
      'ServiceServiceSunday 15 November 2026, 10:00–11:15',
    ]);
  });

  it('adds a rehearsal in Dutch time', async () => {
    const api = renderPlan({
      'POST /api/services/20/times': {
        status: 201,
        json: planTimeJson({ name: 'Vocals rehearsal' }),
      },
    });
    const form = within(await screen.findByRole('form', { name: 'Add a rehearsal' }));
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Vocals rehearsal' } });
    fireEvent.change(form.getByLabelText('Starts', { exact: false }), {
      target: { value: '2026-11-15T08:30' },
    });
    fireEvent.change(form.getByLabelText('Ends', { exact: false }), {
      target: { value: '2026-11-15T09:30' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add rehearsal' }));
    expect(await screen.findByText('Added Vocals rehearsal.')).toBeTruthy();
    expect(api.sent.find((request) => request.url === '/api/services/20/times')?.body).toEqual({
      kind: 'rehearsal',
      name: 'Vocals rehearsal',
      starts_at: '2026-11-15T08:30:00+01:00',
      ends_at: '2026-11-15T09:30:00+01:00',
    });
  });

  it('removes a rehearsal, but never the service itself', async () => {
    const api = renderPlan({ 'DELETE /api/services/20/times/31': { status: 204 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Band rehearsal' }));
    expect(await screen.findByText('Removed Band rehearsal.')).toBeTruthy();
    expect(api.sentRoutes()).toContain('DELETE /api/services/20/times/31');
    expect(screen.queryByRole('button', { name: 'Remove Service' })).toBeNull();
  });

  it('shows who leads a song and the notes of the team chosen', async () => {
    renderPlan();
    await screen.findByRole('list', { name: 'Service order' });
    const song = within(planItem('Amazing Grace'));
    expect(song.getByText('Led by Ben Bakker')).toBeTruthy();
    expect(song.getByText('Keys alone in verse 1')).toBeTruthy();
    expect(song.getByText('Lyrics from verse 1')).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('Notes for'), { target: { value: '6' } });
    expect(song.queryByText('Keys alone in verse 1')).toBeNull();
    expect(song.getByText('Lyrics from verse 1')).toBeTruthy();
  });

  it('edits a song’s leader and its notes per team', async () => {
    const api = renderPlan({ 'PATCH /api/services/20/items/101': { json: songItemJson() } });
    await screen.findAllByRole('option', { name: 'Stream' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Amazing Grace' }));
    const form = within(screen.getByRole('form', { name: 'Edit Amazing Grace' }));
    expect(form.getByLabelText<HTMLSelectElement>('Song leader').value).toBe('2');
    fireEvent.change(form.getByLabelText('Song leader'), { target: { value: '1' } });
    fireEvent.change(form.getByLabelText('Notes for Worship band'), {
      target: { value: 'Full band from the start' },
    });
    fireEvent.change(form.getByLabelText('Notes for Stream'), { target: { value: '' } });
    fireEvent.click(form.getByRole('button', { name: 'Save item' }));
    expect(await screen.findByText('Saved Amazing Grace.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'PATCH')?.body).toMatchObject({
      song_leader_id: 1,
      notes: 'Slow intro',
      team_notes: [
        { team_id: 5, note: 'Full band from the start' },
        { team_id: 6, note: '' },
      ],
    });
  });

  it('adds a song without notes, so it gets the notes of the last time it was planned', async () => {
    const api = renderPlan({
      'POST /api/services/20/items': { status: 201, json: songItemJson() },
    });
    const form = within(await screen.findByRole('form', { name: 'Add an item' }));
    await screen.findByRole('option', { name: 'Amazing Grace: Default (G, 72 BPM, 4/4)' });
    expect(form.getByText(/blank to copy the notes of the last time/)).toBeTruthy();
    fireEvent.change(form.getByLabelText('Arrangement'), { target: { value: '7' } });
    fireEvent.change(form.getByLabelText('Song leader'), { target: { value: '2' } });
    fireEvent.click(form.getByRole('button', { name: 'Add item' }));
    expect(await screen.findByText('Added Amazing Grace.')).toBeTruthy();
    const body = api.sent.find((request) => request.method === 'POST')?.body;
    expect(body).toMatchObject({ song_leader_id: 2 });
    expect(body).not.toHaveProperty('notes');
    expect(body).not.toHaveProperty('team_notes');
  });

  it('saves the plan as its type’s template once the planner confirms', async () => {
    const api = renderPlan({
      'POST /api/service-types/4/template/from-service': { json: serviceTypeJson() },
    });
    const form = within(await screen.findByRole('form', { name: 'Template' }));
    await form.findByRole('option', { name: 'Youth evening' });
    expect(form.getByLabelText<HTMLSelectElement>('Service type').value).toBe('4');
    fireEvent.click(form.getByRole('button', { name: 'Save as the template' }));
    expect(api.sentRoutes()).not.toContain('POST /api/service-types/4/template/from-service');
    expect(form.getByText(/Replace the template of Sunday morning/)).toBeTruthy();
    fireEvent.click(form.getByRole('button', { name: 'Replace the template' }));
    expect(
      await screen.findByText('Saved this plan as the template of Sunday morning.'),
    ).toBeTruthy();
    expect(
      api.sent.find((request) => request.url === '/api/service-types/4/template/from-service')
        ?.body,
    ).toEqual({ service_id: 20 });
  });
});
