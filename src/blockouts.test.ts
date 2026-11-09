import { describe, expect, it } from 'vitest';

import { blockoutRangeError } from './blockouts';

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
