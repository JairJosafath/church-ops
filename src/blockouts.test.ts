import { describe, expect, it } from 'vitest';

import { blockoutRangeError, isBlockedOn } from './blockouts';

const BLOCKOUTS = [
  { startsOn: '2026-11-15', endsOn: '2026-11-15' },
  { startsOn: '2026-12-20', endsOn: '2027-01-03' },
];

describe('isBlockedOn', () => {
  it.each([
    { date: '2026-11-15', want: true },
    { date: '2026-11-14', want: false },
    { date: '2026-11-16', want: false },
    { date: '2026-12-20', want: true },
    { date: '2026-12-27', want: true },
    { date: '2027-01-03', want: true },
    { date: '2027-01-04', want: false },
  ])('says $date is blocked: $want', ({ date, want }) => {
    expect(isBlockedOn(BLOCKOUTS, date)).toBe(want);
  });

  it('blocks nothing without blockouts', () => {
    expect(isBlockedOn([], '2026-11-15')).toBe(false);
  });
});

describe('blockoutRangeError', () => {
  it.each([
    { startsOn: '2026-11-15', endsOn: '2026-11-15', want: null },
    { startsOn: '2026-11-15', endsOn: '2026-11-22', want: null },
    { startsOn: '2026-11-22', endsOn: '2026-11-15', want: 'The last day is before the first.' },
    { startsOn: '', endsOn: '2026-11-15', want: 'Choose the first day.' },
    { startsOn: '2026-11-15', endsOn: '', want: 'Choose the last day.' },
    { startsOn: '15-11-2026', endsOn: '2026-11-15', want: 'Choose the first day.' },
  ])('checks $startsOn to $endsOn', ({ startsOn, endsOn, want }) => {
    expect(blockoutRangeError(startsOn, endsOn)).toBe(want);
  });
});
