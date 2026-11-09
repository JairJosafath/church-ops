import { describe, expect, it } from 'vitest';

import { formatCountdown, projectedEnd, secondsAfter, secondsLeft } from './live_timer';

const STARTED = '2026-11-15T09:10:00Z';
const at = (iso: string): number => new Date(iso).getTime();

describe('secondsLeft', () => {
  it.each([
    { now: '2026-11-15T09:10:00Z', want: 300 },
    { now: '2026-11-15T09:10:00.900Z', want: 300 },
    { now: '2026-11-15T09:12:30Z', want: 150 },
    { now: '2026-11-15T09:15:00Z', want: 0 },
    { now: '2026-11-15T09:15:12Z', want: -12 },
    { now: '2026-11-15T10:15:00Z', want: -3600 },
  ])('gives $want seconds of a 5-minute item at $now', ({ now, want }) => {
    expect(secondsLeft(STARTED, 300, at(now))).toBe(want);
  });

  it.each([null, 'soon'])('gives null when the start is %s', (startedAt) => {
    expect(secondsLeft(startedAt, 300, at(STARTED))).toBeNull();
  });
});

describe('formatCountdown', () => {
  it.each([
    { seconds: 300, want: '5:00' },
    { seconds: 9, want: '0:09' },
    { seconds: 0, want: '0:00' },
    { seconds: -12, want: '−0:12' },
    { seconds: -3725, want: '−1:02:05' },
  ])('shows $seconds as $want', ({ seconds, want }) => {
    expect(formatCountdown(seconds)).toBe(want);
  });
});

describe('secondsAfter', () => {
  const items = [
    { position: 2, lengthSeconds: 1500 },
    { position: 0, lengthSeconds: 180 },
    { position: 1, lengthSeconds: 300 },
    { position: 3, lengthSeconds: 0 },
  ];

  it.each([
    { current: 0, want: 1800 },
    { current: 1, want: 1500 },
    { current: 3, want: 0 },
  ])('sums the lengths after item $current: $want', ({ current, want }) => {
    expect(secondsAfter(items, current)).toBe(want);
  });
});

describe('projectedEnd', () => {
  it('ends when the current item ends plus the items after it', () => {
    expect(projectedEnd(STARTED, 300, 1800, at('2026-11-15T09:11:00Z'))?.toISOString()).toBe(
      '2026-11-15T09:45:00.000Z',
    );
  });

  it('moves the end on while the current item runs over', () => {
    expect(projectedEnd(STARTED, 300, 1800, at('2026-11-15T09:17:00Z'))?.toISOString()).toBe(
      '2026-11-15T09:47:00.000Z',
    );
  });

  it('gives null without a start', () => {
    expect(projectedEnd(null, 300, 1800, at(STARTED))).toBeNull();
  });
});
