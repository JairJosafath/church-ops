// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodeService, decodeTeam, type Team } from './api_types';
import { PlanTeams } from './plan_teams';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import {
  candidateJson,
  needJson,
  personJson,
  positionJson,
  requestJson,
  serviceJson,
  teamJson,
} from './test_fixtures';
import type { Resource } from './use_resource';

const DRUMS = positionJson({ id: 10, name: 'Drums', member_ids: [1, 2, 3] });
const KEYS = positionJson({ id: 11, name: 'Keys' });
const CAMERA = positionJson({ id: 20, team_id: 6, name: 'Camera' });
const BEN = personJson({ id: 2, name: 'Ben Bakker' });
const CHLOE = personJson({ id: 3, name: 'Chloë Jansen' });

const SERVICE = serviceJson({
  needed: [
    needJson({ position: DRUMS, count: 2, accepted: 1, pending: 0, declined: 1, open: 1 }),
    needJson({ position: CAMERA, team_name: 'Stream', count: 1, open: 1 }),
  ],
  requests: [
    requestJson({ id: 51, position: DRUMS, status: 'accepted' }),
    requestJson({
      id: 52,
      position: DRUMS,
      person: BEN,
      status: 'declined',
      decline_reason: 'Away that weekend',
    }),
  ],
});

const TEAMS: Resource<Team[]> = {
  status: 'ready',
  value: [
    decodeTeam(teamJson({ positions: [DRUMS, KEYS] }), 'team'),
    decodeTeam(teamJson({ id: 6, name: 'Stream', positions: [CAMERA] }), 'team'),
  ],
  error: null,
};

function renderTeams(
  routes: Readonly<Record<string, Route>> = {},
  { focused = false, onChanged = vi.fn() } = {},
): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(
    <PlanTeams
      service={decodeService(SERVICE, 'service')}
      teams={TEAMS}
      onChanged={onChanged}
      focused={focused}
    />,
  );
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('PlanTeams', () => {
  it('lists each needed position by team with its people, their status and open slots', () => {
    renderTeams();
    expect(screen.getByRole('heading', { name: 'Worship band' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Stream' })).toBeTruthy();
    const drums = within(screen.getByRole('list', { name: 'People for Drums' }));
    const rows = drums.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual([
      'Anna de Vries Confirmed',
      'Ben Bakker Declined “Away that weekend”',
      '1 open',
    ]);
    expect(screen.getByText('1 of 2 confirmed · 1 declined')).toBeTruthy();
    const camera = within(screen.getByRole('list', { name: 'People for Camera' }));
    expect(camera.getByText('1 open')).toBeTruthy();
  });

  it('lists who can fill a position with every warning, and asks anyway', async () => {
    const onChanged = vi.fn();
    const api = renderTeams(
      {
        'GET /api/services/20/candidates?position_id=10': {
          json: [
            candidateJson({ person: CHLOE, last_served_on: '2026-10-04', times_served_90_days: 2 }),
            candidateJson({
              person: personJson({ id: 4, name: 'Daan Smit' }),
              blocked: true,
              conflicts: [
                {
                  service_id: 21,
                  service_title: 'Evening service',
                  starts_at: '2026-11-15T18:00:00+01:00',
                  team_name: 'Stream',
                  position_name: 'Camera',
                  status: 'pending',
                },
              ],
            }),
            candidateJson({ person: personJson() }),
          ],
        },
        'POST /api/services/20/requests': {
          status: 201,
          json: requestJson({
            person: personJson({ id: 4, name: 'Daan Smit' }),
            position: DRUMS,
            blocked: true,
          }),
        },
      },
      { onChanged },
    );
    const find = screen.getByRole('button', { name: 'Find people for Drums' });
    expect(find.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(find);
    expect(find.getAttribute('aria-expanded')).toBe('true');
    const listElement = await screen.findByRole('list', { name: 'Who can fill Drums' });
    const list = within(listElement);
    const [chloe, daan, anna] = [...listElement.querySelectorAll<HTMLLIElement>(':scope > li')].map(
      (row) => within(row),
    );
    expect(chloe?.getByText('Last served Sunday 4 October 2026 · 2 times in 90 days')).toBeTruthy();
    expect(chloe?.getByRole('button', { name: 'Ask Chloë Jansen for Drums' })).toBeTruthy();
    expect(daan?.getByText('Blocked out')).toBeTruthy();
    expect(daan?.getByText('Same day: Camera at Evening service, 18:00 (pending)')).toBeTruthy();
    expect(anna?.getByText('Already confirmed for Drums')).toBeTruthy();
    expect(anna?.queryByRole('button')).toBeNull();

    fireEvent.click(list.getByRole('button', { name: 'Ask anyway: Daan Smit for Drums' }));
    expect(
      await screen.findByText(
        'Asked Daan Smit for Drums. The request tells them the date is in their blockout.',
      ),
    ).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      position_id: 10,
      person_id: 4,
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(
      api.sentRoutes().filter((route) => route.startsWith('GET /api/services/20/candidates')),
    ).toHaveLength(2);
  });

  it('says how to add people to a position nobody can fill yet', async () => {
    renderTeams({ 'GET /api/services/20/candidates?position_id=20': { json: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Find people for Camera' }));
    expect(await screen.findByText(/Nobody can fill Camera yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'People' }).getAttribute('href')).toBe('#/people');
  });

  it('says why asking failed and keeps the list', async () => {
    renderTeams({
      'GET /api/services/20/candidates?position_id=20': {
        json: [candidateJson({ person: CHLOE })],
      },
      'POST /api/services/20/requests': {
        status: 409,
        json: { detail: 'Chloë Jansen already has a request for Camera' },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Find people for Camera' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Chloë Jansen for Camera' }));
    expect(await screen.findByText('Chloë Jansen already has a request for Camera')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask Chloë Jansen for Camera' })).toBeTruthy();
  });

  it('edits the needed positions, sending 0 for one no longer needed', async () => {
    const onChanged = vi.fn();
    const api = renderTeams({ 'PUT /api/services/20/needed': { json: SERVICE } }, { onChanged });
    fireEvent.click(screen.getByRole('button', { name: 'Edit needed positions' }));
    const form = within(screen.getByRole('form', { name: 'Needed positions' }));
    expect(form.getByLabelText('Drums')).toHaveProperty('value', '2');
    expect(form.getByLabelText('Keys')).toHaveProperty('value', '');
    fireEvent.change(form.getByLabelText('Keys'), { target: { value: '1' } });
    fireEvent.change(form.getByLabelText('Camera'), { target: { value: '0' } });
    fireEvent.click(form.getByRole('button', { name: 'Save needed positions' }));
    expect(await screen.findByText('Saved the needed positions.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'PUT')?.body).toEqual({
      needed: [
        { position_id: 10, count: 2 },
        { position_id: 11, count: 1 },
        { position_id: 20, count: 0 },
      ],
    });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(screen.queryByRole('form', { name: 'Needed positions' })).toBeNull();
  });

  it('says what to fix instead of sending a count that is no number', () => {
    const api = renderTeams();
    fireEvent.click(screen.getByRole('button', { name: 'Edit needed positions' }));
    const form = within(screen.getByRole('form', { name: 'Needed positions' }));
    fireEvent.change(form.getByLabelText('Keys'), { target: { value: 'two' } });
    fireEvent.click(form.getByRole('button', { name: 'Save needed positions' }));
    expect(form.getByText('A whole number from 0 to 99.')).toBeTruthy();
    expect(api.sent).toEqual([]);
  });

  it('takes the focus when the page was opened at the teams', () => {
    renderTeams({}, { focused: true });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Teams' }));
  });
});
