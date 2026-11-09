import { describe, expect, it } from 'vitest';

import { formatLength, parseLength, planClock } from './plan_times';

describe('planClock', () => {
  it('starts each item after the lengths before it and ends after the last', () => {
    const clock = planClock('2026-11-15T10:00:00+01:00', [300, 0, 240, 1800]);
    expect(clock?.itemStarts.map((start) => start.toISOString())).toEqual([
      '2026-11-15T09:00:00.000Z',
      '2026-11-15T09:05:00.000Z',
      '2026-11-15T09:05:00.000Z',
      '2026-11-15T09:09:00.000Z',
    ]);
    expect(clock?.endsAt.toISOString()).toBe('2026-11-15T09:39:00.000Z');
    expect(clock?.totalSeconds).toBe(2340);
  });

  it('ends at the start when there are no items', () => {
    const clock = planClock('2026-11-15T10:00:00+01:00', []);
    expect(clock?.itemStarts).toEqual([]);
    expect(clock?.endsAt.toISOString()).toBe('2026-11-15T09:00:00.000Z');
    expect(clock?.totalSeconds).toBe(0);
  });

  it('runs on across the clock change by elapsed time', () => {
    // 01:30 in summer time; two hours later it is 02:30 in winter time.
    const clock = planClock('2026-10-25T01:30:00+02:00', [7200]);
    expect(clock?.endsAt.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });

  it('gives nothing for a start that is not a time', () => {
    expect(planClock('soon', [60])).toBeNull();
  });
});

describe('formatLength', () => {
  it.each([
    { seconds: 0, want: '0:00' },
    { seconds: 59, want: '0:59' },
    { seconds: 270, want: '4:30' },
    { seconds: 3600, want: '1:00:00' },
    { seconds: 3725, want: '1:02:05' },
  ])('shows $seconds s as $want', ({ seconds, want }) => {
    expect(formatLength(seconds)).toBe(want);
  });
});

describe('parseLength', () => {
  it.each([
    { text: '4:30', want: 270 },
    { text: ' 4:30 ', want: 270 },
    { text: '0:00', want: 0 },
    { text: '5', want: 300 },
    { text: '0', want: 0 },
    { text: '1:02:05', want: 3725 },
    { text: '90:00', want: 5400 },
    { text: '', want: null },
    { text: '4:75', want: null },
    { text: '4:5', want: null },
    { text: '-1', want: null },
    { text: '1.5', want: null },
    { text: 'vier', want: null },
    { text: '١:٠٠', want: null },
  ])('reads "$text" as $want seconds', ({ text, want }) => {
    expect(parseLength(text)).toBe(want);
  });
});
