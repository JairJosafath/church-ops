import { describe, expect, it } from 'vitest';

import {
  amsterdamDate,
  amsterdamLocalToIso,
  formatClock,
  formatServiceDate,
  isoToAmsterdamLocal,
} from './dutch_time';

describe('amsterdamLocalToIso', () => {
  it.each([
    { local: '2026-11-15T10:00', want: '2026-11-15T10:00:00+01:00' },
    { local: '2026-07-05T10:00', want: '2026-07-05T10:00:00+02:00' },
    // The clocks go forward at 02:00 on 29 March 2026 and back at 03:00 on
    // 25 October 2026: a morning service on those days is in the new time.
    { local: '2026-03-29T10:30', want: '2026-03-29T10:30:00+02:00' },
    { local: '2026-10-25T10:30', want: '2026-10-25T10:30:00+01:00' },
    { local: '2026-12-31T23:59', want: '2026-12-31T23:59:00+01:00' },
    { local: '2026-11-15T10:00:30', want: '2026-11-15T10:00:30+01:00' },
  ])('gives $local in Dutch time as $want', ({ local, want }) => {
    expect(amsterdamLocalToIso(local)).toBe(want);
  });

  it.each([
    '',
    'tomorrow',
    '2026-13-01T10:00',
    '2026-02-30T10:00',
    '2026-11-15 10:00',
    '2026-11-15',
  ])('refuses "%s"', (local) => {
    expect(amsterdamLocalToIso(local)).toBeNull();
  });
});

describe('isoToAmsterdamLocal', () => {
  it.each([
    { iso: '2026-11-15T09:00:00Z', want: '2026-11-15T10:00' },
    { iso: '2026-07-05T10:00:00+02:00', want: '2026-07-05T10:00' },
    { iso: 'not a time', want: '' },
  ])('shows $iso as $want', ({ iso, want }) => {
    expect(isoToAmsterdamLocal(iso)).toBe(want);
  });
});

describe('formatClock', () => {
  it.each([
    { iso: '2026-11-15T09:00:00Z', want: '10:00' },
    { iso: '2026-07-05T08:04:00+00:00', want: '10:04' },
    { iso: '2026-11-15T23:30:00Z', want: '00:30' },
    { iso: 'garbage', want: '--:--' },
  ])('shows $iso as $want in Dutch time', ({ iso, want }) => {
    expect(formatClock(iso)).toBe(want);
  });
});

describe('formatServiceDate', () => {
  it.each([
    { iso: '2026-11-15T09:00:00Z', want: 'Sunday 15 November 2026' },
    { iso: '2026-11-14T23:30:00Z', want: 'Sunday 15 November 2026' },
    { iso: 'garbage', want: 'garbage' },
  ])('shows $iso as $want', ({ iso, want }) => {
    expect(formatServiceDate(iso)).toBe(want);
  });
});

describe('amsterdamDate', () => {
  it.each([
    { iso: '2026-11-15T09:00:00Z', want: '2026-11-15' },
    { iso: '2026-11-14T23:30:00Z', want: '2026-11-15' },
    { iso: '2026-07-04T22:30:00+00:00', want: '2026-07-05' },
    { iso: 'garbage', want: null },
  ])('gives the Dutch date of $iso as $want', ({ iso, want }) => {
    expect(amsterdamDate(iso)).toBe(want);
  });
});
