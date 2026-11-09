// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MATRIX_PLANS, MatrixPage } from './matrix_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import {
  needJson,
  personJson,
  positionJson,
  requestJson,
  serviceJson,
  serviceSummaryJson,
} from './test_fixtures';

const DRUMS = positionJson({ id: 10, name: 'Drums' });

function renderPage(routes: Readonly<Record<string, Route>>): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(<MatrixPage />);
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T23:30:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MatrixPage', () => {
  it('shows the upcoming plans across and the positions down, each cell with people and status', async () => {
    const api = renderPage({
      'GET /api/services?from=2026-11-10': {
        json: [
          serviceSummaryJson(),
          serviceSummaryJson({ id: 21, title: 'Advent 1', starts_at: '2026-11-29T10:00:00+01:00' }),
        ],
      },
      'GET /api/services/20': {
        json: serviceJson({
          needed: [needJson({ position: DRUMS, count: 2, accepted: 1, open: 1 })],
          requests: [requestJson({ position: DRUMS, status: 'accepted' })],
        }),
      },
      'GET /api/services/21': {
        json: serviceJson({
          id: 21,
          title: 'Advent 1',
          starts_at: '2026-11-29T10:00:00+01:00',
          requests: [
            requestJson({
              id: 51,
              service_id: 21,
              position: DRUMS,
              person: personJson({ id: 2, name: 'Ben Bakker' }),
              status: 'declined',
            }),
          ],
        }),
      },
    });
    const table = within(await screen.findByRole('table', { name: /The next plans/ }));
    expect(table.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Position',
      'Sunday morningSunday 15 November 2026',
      'Advent 1Sunday 29 November 2026',
    ]);
    expect(table.getByRole('rowheader', { name: 'Worship band' })).toBeTruthy();
    expect(table.getByRole('rowheader', { name: 'Drums' })).toBeTruthy();
    const first = table.getByRole('link', {
      name: 'Drums at Sunday morning, Sunday 15 November 2026: Anna de Vries (confirmed), 1 open',
    });
    expect(first.getAttribute('href')).toBe('#/services/20/teams');
    const second = table.getByRole('link', {
      name: 'Drums at Advent 1, Sunday 29 November 2026: Ben Bakker (declined)',
    });
    expect(second.getAttribute('href')).toBe('#/services/21/teams');
    expect(api.sentRoutes()).toEqual([
      'GET /api/services?from=2026-11-10',
      'GET /api/services/20',
      'GET /api/services/21',
    ]);
  });

  it(`loads only the next ${String(MATRIX_PLANS)} plans`, async () => {
    const summaries = Array.from({ length: MATRIX_PLANS + 3 }, (_, index) =>
      serviceSummaryJson({ id: 100 + index }),
    );
    const routes: Record<string, Route> = {
      'GET /api/services?from=2026-11-10': { json: summaries },
    };
    for (let index = 0; index < summaries.length; index += 1) {
      routes[`GET /api/services/${String(100 + index)}`] = {
        json: serviceJson({ id: 100 + index }),
      };
    }
    const api = renderPage(routes);
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(api.sent).toHaveLength(MATRIX_PLANS + 1);
  });

  it('says when there are no plans from today on', async () => {
    renderPage({ 'GET /api/services?from=2026-11-10': { json: [] } });
    expect(await screen.findByText(/No plans from today on/)).toBeTruthy();
  });

  it('says when no plan needs anyone yet', async () => {
    renderPage({
      'GET /api/services?from=2026-11-10': { json: [serviceSummaryJson()] },
      'GET /api/services/20': { json: serviceJson() },
    });
    expect(await screen.findByText(/None of these plans needs anyone yet/)).toBeTruthy();
  });

  it('says what happened when the plans cannot be loaded', async () => {
    renderPage({ 'GET /api/services?from=2026-11-10': { status: 503, json: { detail: 'down' } } });
    expect(await screen.findByText(/The server failed \(503\)/)).toBeTruthy();
  });
});
