// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePerson } from './api_types';
import { MePage } from './me_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import { blockoutJson, personJson, requestJson } from './test_fixtures';

const ANNA = decodePerson(personJson(), 'person');

function renderPage(routes: Readonly<Record<string, Route>>): FakeApi {
  const api = fakeApi({ 'GET /api/people/1/blockouts': { json: [] }, ...routes });
  vi.stubGlobal('fetch', api.fetch);
  render(<MePage me={ANNA} />);
  return api;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MePage', () => {
  it('accepts a pending request with one tap', async () => {
    let answered = false;
    const api = renderPage({
      'GET /api/requests?person_id=1': () => ({
        json: [requestJson(answered ? { status: 'accepted' } : {})],
      }),
      'POST /api/requests/50/answer': () => {
        answered = true;
        return { json: requestJson({ status: 'accepted' }) };
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Drums at Sunday morning' }));
    expect(await screen.findByText('Accepted: Drums at Sunday morning.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ accept: true });
    expect(await screen.findByText('Nothing to answer.')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Confirmed' })).getByText('Worship band: Drums'),
    ).toBeTruthy();
  });

  it.each([
    { reason: 'Away that weekend', body: { accept: false, reason: 'Away that weekend' } },
    { reason: '   ', body: { accept: false } },
  ])('declines with the reason "$reason"', async ({ reason, body }) => {
    const api = renderPage({
      'GET /api/requests?person_id=1': { json: [requestJson()] },
      'POST /api/requests/50/answer': {
        json: requestJson({ status: 'declined', decline_reason: reason.trim() }),
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline Drums at Sunday morning' }));
    expect(api.sentRoutes()).not.toContain('POST /api/requests/50/answer');
    const form = within(screen.getByRole('form', { name: 'Decline Drums at Sunday morning' }));
    fireEvent.change(form.getByLabelText('Reason'), { target: { value: reason } });
    fireEvent.click(form.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Declined: Drums at Sunday morning.')).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual(body);
  });

  it('keeps a request pending when the person thinks better of declining', async () => {
    renderPage({ 'GET /api/requests?person_id=1': { json: [requestJson()] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline Drums at Sunday morning' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('form', { name: 'Decline Drums at Sunday morning' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept Drums at Sunday morning' })).toBeTruthy();
  });

  it('refuses a reason longer than the api takes', async () => {
    const api = renderPage({ 'GET /api/requests?person_id=1': { json: [requestJson()] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline Drums at Sunday morning' }));
    const form = within(screen.getByRole('form', { name: 'Decline Drums at Sunday morning' }));
    fireEvent.change(form.getByLabelText('Reason'), { target: { value: 'x'.repeat(501) } });
    fireEvent.click(form.getByRole('button', { name: 'Decline' }));
    expect(form.getByText('Keep the reason to 500 characters; it has 501.')).toBeTruthy();
    expect(api.sentRoutes()).not.toContain('POST /api/requests/50/answer');
  });

  it('tells the person when a request falls in their blockout', async () => {
    renderPage({ 'GET /api/requests?person_id=1': { json: [requestJson({ blocked: true })] } });
    expect(await screen.findByText(/This date is in one of your blockouts/)).toBeTruthy();
  });

  it('says why an answer failed and keeps the buttons', async () => {
    renderPage({
      'GET /api/requests?person_id=1': { json: [requestJson()] },
      'POST /api/requests/50/answer': {
        status: 409,
        json: { detail: 'This request was cancelled' },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Accept Drums at Sunday morning' }));
    expect(await screen.findByText('This request was cancelled')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept Drums at Sunday morning' })).toBeTruthy();
  });

  it('links a confirmed request to its plan and its rehearse page', async () => {
    renderPage({
      'GET /api/requests?person_id=1': { json: [requestJson({ status: 'accepted' })] },
    });
    const confirmed = within(await screen.findByRole('region', { name: 'Confirmed' }));
    expect(
      (
        await confirmed.findByRole('link', { name: 'Open the plan of Sunday morning' })
      ).getAttribute('href'),
    ).toBe('#/services/20');
    expect(
      confirmed.getByRole('link', { name: 'Rehearse for Sunday morning' }).getAttribute('href'),
    ).toBe('#/services/20/rehearse');
  });

  it('withdraws from a confirmed request with a reason', async () => {
    let withdrawn = false;
    const api = renderPage({
      'GET /api/requests?person_id=1': () => ({
        json: [
          requestJson(
            withdrawn ? { status: 'declined', decline_reason: 'Ill' } : { status: 'accepted' },
          ),
        ],
      }),
      'POST /api/requests/50/withdraw': () => {
        withdrawn = true;
        return { json: requestJson({ status: 'declined', decline_reason: 'Ill' }) };
      },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Withdraw from Drums at Sunday morning' }),
    );
    const form = within(
      screen.getByRole('form', { name: 'Withdraw from Drums at Sunday morning' }),
    );
    fireEvent.change(form.getByLabelText('Reason'), { target: { value: 'Ill' } });
    fireEvent.click(form.getByRole('button', { name: 'Withdraw' }));
    expect(
      await screen.findByText('Withdrew from Drums at Sunday morning. The plan shows it.'),
    ).toBeTruthy();
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({ reason: 'Ill' });
    const earlier = within(await screen.findByRole('region', { name: 'Earlier and answered' }));
    expect(earlier.getByText('You declined')).toBeTruthy();
    expect(earlier.getByText('“Ill”')).toBeTruthy();
  });

  it('puts a confirmed request for a past service with the earlier ones', async () => {
    renderPage({
      'GET /api/requests?person_id=1': {
        json: [requestJson({ status: 'accepted', service_starts_at: '2026-11-01T10:00:00+01:00' })],
      },
    });
    const earlier = within(await screen.findByRole('region', { name: 'Earlier and answered' }));
    expect(earlier.getByText('You accepted')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Confirmed' })).getByText(
        'Nothing confirmed from today on.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Withdraw/ })).toBeNull();
  });

  it('tells the person a blockout’s reason stays theirs', async () => {
    renderPage({ 'GET /api/requests?person_id=1': { json: [] } });
    const form = within(await screen.findByRole('form', { name: 'Add a blockout' }));
    expect(form.getByText(/a planner only sees that you are away, never why/)).toBeTruthy();
  });

  it('adds a one-day blockout', async () => {
    const api = renderPage({
      'GET /api/requests?person_id=1': { json: [] },
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
    const api = renderPage({ 'GET /api/requests?person_id=1': { json: [] } });
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
    expect(screen.getByRole('heading', { name: 'My schedule' })).toBeTruthy();
    expect(screen.getByText(/Choose who you are/)).toBeTruthy();
  });
});
