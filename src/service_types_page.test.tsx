// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceTypesPage } from './service_types_page';
import { fakeApi, type FakeApi } from './test_fetch';
import { serviceTypeJson, teamJson } from './test_fixtures';

const EVENING = serviceTypeJson({
  id: 5,
  name: 'Youth evening',
  start_time: '19:30',
  rehearsal_offset_minutes: null,
  template: { items: [], needed: [] },
});

function renderPage(routes: Parameters<typeof fakeApi>[0] = {}): FakeApi {
  const api = fakeApi({
    'GET /api/service-types': { json: [serviceTypeJson(), EVENING] },
    'GET /api/teams': { json: [teamJson()] },
    ...routes,
  });
  vi.stubGlobal('fetch', api.fetch);
  render(<ServiceTypesPage />);
  return api;
}

function cardOf(name: string): HTMLElement {
  const card = screen.getByRole('heading', { level: 3, name }).closest('li');
  if (card === null) {
    throw new Error(`no card for ${name}`);
  }
  return card;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('ServiceTypesPage', () => {
  it('shows each type with its start, its rehearsal and its template', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 3, name: 'Sunday morning' });
    const sunday = within(cardOf('Sunday morning'));
    expect(sunday.getByText('Starts 10:00 · Rehearses 90 minutes before')).toBeTruthy();
    expect(
      within(sunday.getByRole('list', { name: 'Template items' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Worship (Header)', 'Sermon (Sermon, 30:00)']);
    expect(await sunday.findByText('Worship band: Drums, 1 needed')).toBeTruthy();
    const evening = within(cardOf('Youth evening'));
    expect(evening.getByText('Starts 19:30 · No rehearsal')).toBeTruthy();
    expect(evening.getByText(/The template is empty/)).toBeTruthy();
  });

  it('creates a type', async () => {
    const api = renderPage({ 'POST /api/service-types': { status: 201, json: EVENING } });
    const form = within(await screen.findByRole('form', { name: 'New service type' }));
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Youth evening' } });
    fireEvent.change(form.getByLabelText('Start time', { exact: false }), {
      target: { value: '19:30' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add service type' }));
    expect(await screen.findByText('Added Youth evening.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'Youth evening',
      start_time: '19:30',
      rehearsal_offset_minutes: null,
    });
  });

  it('edits a type’s start and rehearsal', async () => {
    const api = renderPage({ 'PATCH /api/service-types/4': { json: serviceTypeJson() } });
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Sunday morning' }));
    const form = within(screen.getByRole('form', { name: 'Edit Sunday morning' }));
    fireEvent.change(form.getByLabelText('Start time', { exact: false }), {
      target: { value: '9:30' },
    });
    fireEvent.change(form.getByLabelText('Rehearsal', { exact: false }), {
      target: { value: '60' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved Sunday morning.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'PATCH')?.body).toEqual({
      name: 'Sunday morning',
      start_time: '09:30',
      rehearsal_offset_minutes: 60,
    });
  });

  it('says what to fix instead of sending a type without a name', async () => {
    const api = renderPage();
    const form = within(await screen.findByRole('form', { name: 'New service type' }));
    fireEvent.click(form.getByRole('button', { name: 'Add service type' }));
    expect(form.getByText('Name the service type.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/service-types');
  });

  it('says what happened when the types cannot be loaded', async () => {
    renderPage({ 'GET /api/service-types': { status: 503 } });
    expect(await screen.findByText('The server failed (503). Try again in a moment.')).toBeTruthy();
  });
});
