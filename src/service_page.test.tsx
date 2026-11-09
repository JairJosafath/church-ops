// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServicePage } from './service_page';
import { fakeApi, type FakeApi } from './test_fetch';
import {
  itemJson,
  needJson,
  personJson,
  requestJson,
  serviceJson,
  songItemJson,
  songJson,
  teamJson,
} from './test_fixtures';

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
  render(<ServicePage serviceId={20} focusTeams={focusTeams} />);
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
      notes: '',
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

  it('says what happened when the plan cannot be loaded', async () => {
    renderPage({ 'GET /api/services/20': { status: 404, json: { detail: 'Service not found' } } });
    expect(
      await screen.findByText('Service not found. It may have been removed: reload the page.'),
    ).toBeTruthy();
  });
});
