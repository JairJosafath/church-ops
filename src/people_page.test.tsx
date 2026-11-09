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
      people={[decodePerson(personJson(), 'person')]}
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
    expect(screen.getByText('Drums')).toBeTruthy();
    expect(screen.getByText('Anna de Vries')).toBeTruthy();
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
