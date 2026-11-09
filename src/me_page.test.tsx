// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePerson } from './api_types';
import { MePage } from './me_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import { blockoutJson, personJson, requestJson } from './test_fixtures';

const ANNA = decodePerson(personJson(), 'person');

function renderPage(routes: Readonly<Record<string, Route>>): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(<MePage me={ANNA} />);
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe('MePage', () => {
  it.each([
    {
      button: 'Accept',
      accept: true,
      status: 'accepted',
      said: 'Accepted: Drums at Sunday morning.',
    },
    {
      button: 'Decline',
      accept: false,
      status: 'declined',
      said: 'Declined: Drums at Sunday morning.',
    },
  ])(
    'answers a pending request with one tap on $button',
    async ({ button, accept, status, said }) => {
      let answered = false;
      const api = renderPage({
        'GET /api/requests?person_id=1': () => ({
          json: [requestJson(answered ? { status } : {})],
        }),
        'GET /api/people/1/blockouts': { json: [] },
        'POST /api/requests/50/answer': () => {
          answered = true;
          return { json: requestJson({ status }) };
        },
      });
      fireEvent.click(
        await screen.findByRole('button', { name: `${button} Drums at Sunday morning` }),
      );
      expect(await screen.findByText(said)).toBeTruthy();
      expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ accept });
      expect(await screen.findByText('Nothing to answer.')).toBeTruthy();
    },
  );

  it('tells the person when a request falls in their blockout', async () => {
    renderPage({
      'GET /api/requests?person_id=1': { json: [requestJson({ blocked: true })] },
      'GET /api/people/1/blockouts': { json: [] },
    });
    expect(await screen.findByText(/This date is in one of your blockouts/)).toBeTruthy();
  });

  it('says why an answer failed and keeps the buttons', async () => {
    renderPage({
      'GET /api/requests?person_id=1': { json: [requestJson()] },
      'GET /api/people/1/blockouts': { json: [] },
      'POST /api/requests/50/answer': {
        status: 409,
        json: { detail: 'This request was cancelled' },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Drums at Sunday morning' }));
    expect(await screen.findByText('This request was cancelled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept Drums at Sunday morning' })).toBeTruthy();
  });

  it('adds a one-day blockout', async () => {
    const api = renderPage({
      'GET /api/requests?person_id=1': { json: [] },
      'GET /api/people/1/blockouts': { json: [] },
      'POST /api/people/1/blockouts': { status: 201, json: blockoutJson() },
    });
    const form = within(await screen.findByRole('form', { name: 'Add a blockout' }));
    fireEvent.change(form.getByLabelText('First day'), { target: { value: '2026-11-22' } });
    fireEvent.click(form.getByRole('button', { name: 'Add blockout' }));
    expect(await screen.findByText('Added the blockout.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      starts_on: '2026-11-22',
      ends_on: '2026-11-22',
      reason: '',
    });
  });

  it('refuses a blockout that ends before it starts', async () => {
    const api = renderPage({
      'GET /api/requests?person_id=1': { json: [] },
      'GET /api/people/1/blockouts': { json: [] },
    });
    const form = within(await screen.findByRole('form', { name: 'Add a blockout' }));
    fireEvent.change(form.getByLabelText('First day'), { target: { value: '2026-11-22' } });
    fireEvent.change(form.getByLabelText('Last day', { exact: false }), {
      target: { value: '2026-11-20' },
    });
    fireEvent.click(form.getByRole('button', { name: 'Add blockout' }));
    expect(form.getByText('The last day is before the first.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/people/1/blockouts');
  });

  it('removes a blockout', async () => {
    const api = renderPage({
      'GET /api/requests?person_id=1': { json: [] },
      'GET /api/people/1/blockouts': { json: [blockoutJson()] },
      'DELETE /api/blockouts/60': { status: 204 },
    });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove the blockout from 2026-11-15 to 2026-11-15',
      }),
    );
    expect(await screen.findByText('Removed the blockout.')).toBeTruthy();
    expect(api.sentRoutes()).toContain('DELETE /api/blockouts/60');
  });
});

describe('MePage without a chosen person', () => {
  it('asks who you are', () => {
    render(<MePage me={null} />);
    expect(screen.getByText(/Choose who you are/)).toBeTruthy();
  });
});
