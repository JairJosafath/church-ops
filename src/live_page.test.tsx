// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decodePerson, type Person } from './api_types';
import { LivePage } from './live_page';
import { fakeApi, type FakeApi, type Route } from './test_fetch';
import { itemJson, liveJson, personJson, serviceJson, songItemJson } from './test_fixtures';

const ANNA = decodePerson(personJson(), 'person');
const BEN = decodePerson(personJson({ id: 2, name: 'Ben Bakker' }), 'person');

const SECOND = liveJson({
  current_index: 1,
  version: 2,
  current: songItemJson({ position: 1 }),
  next: itemJson({ id: 102, position: 2, title: 'Sermon', kind: 'sermon' }),
});

function renderPage(me: Person | null, routes: Readonly<Record<string, Route>>): FakeApi {
  const api = fakeApi(routes);
  vi.stubGlobal('fetch', api.fetch);
  render(<LivePage serviceId={20} me={me} people={[ANNA, BEN]} />);
  return api;
}

/** Lets the page's pending requests answer, and its timers run for `ms`. */
async function elapse(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function nowTitle(): string | null | undefined {
  return screen.getByRole('region', { name: 'Now' }).querySelector('.live-title')?.textContent;
}

describe('LivePage for the controller', () => {
  it('shows the current and next item with Next and Back', async () => {
    renderPage(ANNA, { 'GET /api/services/20/live': { json: liveJson() } });
    await elapse(0);
    expect(screen.getByText('You have control.')).toBeTruthy();
    expect(nowTitle()).toBe('Psalm 23');
    expect(screen.getByRole('region', { name: 'Next' }).textContent).toContain('Amazing Grace');
    expect(screen.getByRole('button', { name: '← Back' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next →' }).hasAttribute('disabled')).toBe(false);
  });

  it('moves to the next item and shows it at once', async () => {
    const api = renderPage(ANNA, {
      'GET /api/services/20/live': { json: liveJson() },
      'POST /api/services/20/live/advance': { json: SECOND },
    });
    await elapse(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await elapse(0);
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      person_id: 1,
      to_index: 1,
    });
    expect(nowTitle()).toBe('Amazing Grace');
    expect(screen.getByRole('button', { name: '← Back' }).hasAttribute('disabled')).toBe(false);
  });

  it('hands control to someone else', async () => {
    const api = renderPage(ANNA, {
      'GET /api/services/20/live': { json: liveJson() },
      'POST /api/services/20/live/handover': {
        json: liveJson({ controller: personJson({ id: 2, name: 'Ben Bakker' }) }),
      },
    });
    await elapse(0);
    fireEvent.change(screen.getByLabelText('Hand control to'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    await elapse(0);
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      from_person_id: 1,
      to_person_id: 2,
    });
    expect(screen.getByText('Ben Bakker')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next →' })).toBeNull();
  });

  it('says who holds control when the api refuses an advance', async () => {
    renderPage(ANNA, {
      'GET /api/services/20/live': { json: liveJson() },
      'POST /api/services/20/live/advance': {
        status: 409,
        json: { detail: 'Ben Bakker holds live control' },
      },
    });
    await elapse(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    await elapse(0);
    expect(screen.getByText('Ben Bakker holds live control')).toBeTruthy();
  });
});

describe('LivePage for a follower', () => {
  it('shows who holds control, offers no Next, and follows every second', async () => {
    let state = liveJson();
    const api = renderPage(BEN, { 'GET /api/services/20/live': () => ({ json: state }) });
    await elapse(0);
    expect(screen.getByText('Anna de Vries')).toBeTruthy();
    expect(screen.getByText(/has control/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next →' })).toBeNull();
    expect(screen.queryByRole('button', { name: '← Back' })).toBeNull();
    expect(nowTitle()).toBe('Psalm 23');

    state = SECOND;
    await elapse(999);
    expect(nowTitle()).toBe('Psalm 23');
    await elapse(1);
    expect(nowTitle()).toBe('Amazing Grace');
    expect(api.sentRoutes().filter((route) => route.endsWith('/live'))).toEqual([
      'GET /api/services/20/live',
      'GET /api/services/20/live',
    ]);
  });

  it('shows the state of OBS and Ableton', async () => {
    renderPage(BEN, {
      'GET /api/services/20/live': {
        json: liveJson({
          devices: { obs: 'unreachable', ableton: 'ok', updated_at: '2026-11-15T09:01:00Z' },
        }),
      },
    });
    await elapse(0);
    const devices = screen.getByRole('list', { name: 'Devices' });
    expect(devices.textContent).toContain('OBS: Unreachable');
    expect(devices.textContent).toContain('Ableton: Connected');
    expect(devices.textContent).toContain('Reported 10:01');
  });

  it('keeps following through a failed poll and says so', async () => {
    let fail = true;
    renderPage(BEN, {
      'GET /api/services/20/live': () =>
        fail ? { status: 503, json: { detail: 'down' } } : { json: liveJson() },
    });
    await elapse(0);
    expect(screen.getByText(/The server failed \(503\)/)).toBeTruthy();
    fail = false;
    await elapse(1000);
    expect(nowTitle()).toBe('Psalm 23');
    expect(screen.queryByText(/The server failed/)).toBeNull();
  });

  it('stops polling when the page goes away', async () => {
    const api = renderPage(BEN, { 'GET /api/services/20/live': { json: liveJson() } });
    await elapse(0);
    const sent = api.sent.length;
    cleanup();
    await elapse(5000);
    expect(api.sent).toHaveLength(sent);
  });
});

describe('LivePage before the service is live', () => {
  it('starts live mode with the chosen controller', async () => {
    const api = renderPage(ANNA, {
      'POST /api/services/20/live': { status: 201, json: liveJson() },
    });
    await elapse(0);
    expect(screen.getByText(/This service is not live/)).toBeTruthy();
    expect(screen.getByLabelText('Who holds control')).toHaveProperty('value', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Start live mode' }));
    await elapse(0);
    expect(api.sent.find((request) => request.method === 'POST')?.body).toEqual({
      controller_id: 1,
    });
    expect(screen.getByText('You have control.')).toBeTruthy();
  });
});

// v0.2 scheduling
describe('LivePage timers', () => {
  const PLAN = serviceJson({
    items: [
      itemJson({ id: 100, position: 0, length_seconds: 180 }),
      songItemJson({ position: 1, length_seconds: 300 }),
      itemJson({ id: 102, position: 2, kind: 'sermon', title: 'Sermon', length_seconds: 1500 }),
    ],
    ends_at: '2026-11-15T10:33:00+01:00',
  });

  function timer(): string | null {
    return screen.getByRole('timer').textContent;
  }

  it('counts the current item down, into overtime, and projects the end of the service', async () => {
    vi.setSystemTime(new Date('2026-11-15T09:01:00Z'));
    renderPage(BEN, {
      'GET /api/services/20/live': {
        json: liveJson({ item_started_at: '2026-11-15T09:00:00Z' }),
      },
      'GET /api/services/20': { json: PLAN },
    });
    await elapse(0);
    expect(timer()).toBe('Left2:00');
    expect(
      screen.getByText('Projected end', { selector: 'dt' }).nextElementSibling?.textContent,
    ).toBe('10:33');
    expect(
      screen.getByText('Planned end', { selector: 'dt' }).nextElementSibling?.textContent,
    ).toBe('10:33');
    await elapse(1000);
    expect(timer()).toBe('Left1:59');
    await elapse(179_000);
    expect(timer()).toBe('Over time−1:00');
    expect(
      screen.getByText('Projected end', { selector: 'dt' }).nextElementSibling?.textContent,
    ).toBe('10:34');
  });

  it('shows no countdown when the server does not say when the item started', async () => {
    renderPage(BEN, {
      'GET /api/services/20/live': { json: liveJson() },
      'GET /api/services/20': { json: PLAN },
    });
    await elapse(0);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(
      screen.getByText(/No countdown: the server did not say when this item started/),
    ).toBeTruthy();
  });

  it('still counts down when the plan cannot be loaded, and says why there is no projected end', async () => {
    vi.setSystemTime(new Date('2026-11-15T09:01:00Z'));
    renderPage(BEN, {
      'GET /api/services/20/live': {
        json: liveJson({ item_started_at: '2026-11-15T09:00:00Z' }),
      },
    });
    await elapse(0);
    expect(timer()).toBe('Left2:00');
    expect(screen.getByText(/No projected end: could not load the plan/)).toBeTruthy();
  });
});
