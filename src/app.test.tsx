// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { setMeId } from './me_store';
import { fakeApi } from './test_fetch';
import { personJson, requestJson } from './test_fixtures';

beforeEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  setMeId(null);
  window.location.hash = '#/me';
  vi.stubGlobal(
    'fetch',
    fakeApi({
      'GET /api/people': { json: [personJson(), personJson({ id: 2, name: 'Ben Bakker' })] },
      'GET /api/requests?person_id=2': { json: [requestJson()] },
      'GET /api/people/2/blockouts': { json: [] },
    }).fetch,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('shows the requests of the person chosen as "You are", and remembers the choice', async () => {
    render(<App title="church-ops" />);
    expect(screen.getByText(/Choose who you are/)).toBeTruthy();
    await screen.findByRole('option', { name: 'Ben Bakker' });
    fireEvent.change(screen.getByLabelText('You are'), { target: { value: '2' } });
    expect(await screen.findByText('For Ben Bakker.')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Accept Drums at Sunday morning' }),
    ).toBeTruthy();
    expect(window.localStorage.getItem('church-ops.me')).toBe('2');
  });

  it('marks the current page in the navigation and says there is no sign-in yet', () => {
    render(<App title="church-ops" />);
    expect(screen.getByRole('link', { name: 'My requests' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByText(/No sign-in yet/)).toBeTruthy();
  });

  it('works when the browser blocks storage', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    render(<App title="church-ops" />);
    await screen.findByRole('option', { name: 'Ben Bakker' });
    fireEvent.change(screen.getByLabelText('You are'), { target: { value: '2' } });
    expect(await screen.findByText('For Ben Bakker.')).toBeTruthy();
  });

  it('shows a page for an unknown route', () => {
    window.location.hash = '#/nowhere';
    render(<App title="church-ops" />);
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
});
