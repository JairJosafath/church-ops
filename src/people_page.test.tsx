// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePerson } from './api_types';
import { PeoplePage } from './people_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import { personJson, positionJson, teamJson } from './test_fixtures';

function renderPage(routes: Readonly<Record<string, Route>>, onPeopleChanged = vi.fn()): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(
    <PeoplePage
      people={[
        decodePerson(personJson(), 'person'),
        decodePerson(personJson({ id: 2, name: 'Ben Bakker' }), 'person'),
      ]}
      onPeopleChanged={onPeopleChanged}
    />,
  );
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('PeoplePage', () => {
  it('lists teams with their positions, and the people', async () => {
    renderPage({ 'GET /api/teams': { json: [teamJson()] } });
    expect(await screen.findByRole('heading', { name: 'Worship band' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Drums' })).toBeTruthy();
    const people = within(screen.getByRole('region', { name: 'People' }));
    expect(people.getByText('Anna de Vries')).toBeTruthy();
  });

  // v0.2 scheduling
  it('lists who can fill each position', async () => {
    renderPage({
      'GET /api/teams': { json: [teamJson({ positions: [positionJson({ member_ids: [2] })] })] },
    });
    const members = within(await screen.findByRole('list', { name: 'Who can fill Drums' }));
    expect(members.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Ben BakkerRemove',
    ]);
  });

  it('says when nobody can fill a position yet', async () => {
    renderPage({ 'GET /api/teams': { json: [teamJson()] } });
    expect(await screen.findByText('Nobody can fill Drums yet.')).toBeTruthy();
  });

  it('adds a person who can fill a position, offering only those who cannot yet', async () => {
    let added = false;
    const api = renderPage({
      'GET /api/teams': () => ({
        json: [teamJson({ positions: [positionJson({ member_ids: added ? [1, 2] : [1] })] })],
      }),
      'POST /api/positions/10/members': () => {
        added = true;
        return { status: 201, json: positionJson({ member_ids: [1, 2] }) };
      },
    });
    const form = within(
      await screen.findByRole('form', { name: 'Add someone who can fill Drums' }),
    );
    const select = form.getByLabelText('Add to Drums');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a person', 'Ben Bakker']);
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(form.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Ben Bakker can fill Drums now.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ person_id: 2 });
    const members = within(await screen.findByRole('list', { name: 'Who can fill Drums' }));
    expect(await members.findByText('Ben Bakker')).toBeTruthy();
  });

  it('removes a person from a position', async () => {
    const api = renderPage({
      'GET /api/teams': { json: [teamJson({ positions: [positionJson({ member_ids: [1] })] })] },
      'DELETE /api/positions/10/members/1': { status: 204 },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Anna de Vries from Drums' }));
    expect(await screen.findByText('Anna de Vries no longer fills Drums.')).toBeTruthy();
    expect(api.sentRoutes()).toContain('DELETE /api/positions/10/members/1');
  });

  it('creates a team', async () => {
    const api = renderPage({
      'GET /api/teams': { json: [] },
      'POST /api/teams': { status: 201, json: teamJson({ name: 'Sound', positions: [] }) },
    });
    const form = within(await screen.findByRole('form', { name: 'Add a team' }));
    fireEvent.change(form.getByLabelText('Team name'), { target: { value: 'Sound' } });
    fireEvent.click(form.getByRole('button', { name: 'Add team' }));
    expect(await screen.findByText('Added Sound. Now add its positions.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ name: 'Sound' });
  });

  it('adds a position to a team', async () => {
    const api = renderPage({
      'GET /api/teams': { json: [teamJson()] },
      'POST /api/teams/5/positions': { status: 201, json: positionJson({ id: 11, name: 'Bass' }) },
    });
    const form = within(
      await screen.findByRole('form', { name: 'Add a position to Worship band' }),
    );
    fireEvent.change(form.getByLabelText('Position name'), { target: { value: 'Bass' } });
    fireEvent.click(form.getByRole('button', { name: 'Add position' }));
    expect(await screen.findByText('Added Bass to Worship band.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ name: 'Bass' });
  });

  it('creates a person and tells the page the people changed', async () => {
    const onPeopleChanged = vi.fn();
    const api = renderPage(
      {
        'GET /api/teams': { json: [] },
        'POST /api/people': { status: 201, json: personJson({ id: 3, name: 'Chloë Jansen' }) },
      },
      onPeopleChanged,
    );
    const form = within(await screen.findByRole('form', { name: 'New person' }));
    fireEvent.change(form.getByLabelText('Name'), { target: { value: 'Chloë Jansen' } });
    fireEvent.click(form.getByRole('button', { name: 'Add person' }));
    expect(await screen.findByText('Added Chloë Jansen.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'Chloë Jansen',
    });
    expect(onPeopleChanged).toHaveBeenCalledOnce();
  });
});
