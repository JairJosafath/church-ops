import { describe, expect, it } from 'vitest';

import { decodeLiveState, type DeviceState } from './api_types';
import { backIndex, deviceBadge, liveRole, nextIndex } from './live';
import { liveJson } from './test_fixtures';

const live = (overrides: Record<string, unknown> = {}) =>
  decodeLiveState(liveJson(overrides), 'live');

describe('liveRole', () => {
  it.each([
    { meId: 1, want: 'controller' },
    { meId: 2, want: 'follower' },
    { meId: null, want: 'follower' },
  ])('makes person $meId the $want', ({ meId, want }) => {
    expect(liveRole(live(), meId)).toBe(want);
  });
});

describe('nextIndex and backIndex', () => {
  it.each([
    { name: 'the first item', overrides: { current_index: 0 }, next: 1, back: null },
    { name: 'a middle item', overrides: { current_index: 3 }, next: 4, back: 2 },
    { name: 'the last item', overrides: { current_index: 5, next: null }, next: null, back: 4 },
    { name: 'the only item', overrides: { current_index: 0, next: null }, next: null, back: null },
  ])('moves on from $name to $next and back to $back', ({ overrides, next, back }) => {
    const state = live(overrides);
    expect(nextIndex(state)).toBe(next);
    expect(backIndex(state)).toBe(back);
  });
});

describe('deviceBadge', () => {
  it.each<{ state: DeviceState; label: string; tone: string }>([
    { state: 'ok', label: 'Connected', tone: 'ok' },
    { state: 'unreachable', label: 'Unreachable', tone: 'error' },
    { state: 'unconfigured', label: 'Not set up', tone: 'neutral' },
    { state: 'unknown', label: 'No report yet', tone: 'warning' },
  ])('shows $state as $label', ({ state, label, tone }) => {
    expect(deviceBadge(state)).toEqual({ label, tone });
  });
});
