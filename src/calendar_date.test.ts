import { describe, expect, it } from 'vitest';

import { formatCalendarDate, isCalendarDate, parseDateRange } from './calendar_date';

describe('isCalendarDate', () => {
  it.each([
    { text: '2026-11-15', want: true },
    { text: '2028-02-29', want: true },
    { text: '2026-02-29', want: false },
    { text: '2026-13-01', want: false },
    { text: '2026-11-15T10:00', want: false },
    { text: '15-11-2026', want: false },
    { text: '', want: false },
  ])('says "$text" is a date: $want', ({ text, want }) => {
    expect(isCalendarDate(text)).toBe(want);
  });
});

describe('formatCalendarDate', () => {
  it.each([
    { date: '2026-11-01', want: 'Sunday 1 November 2026' },
    { date: '2026-03-29', want: 'Sunday 29 March 2026' },
    { date: 'soon', want: 'soon' },
  ])('writes $date as "$want"', ({ date, want }) => {
    expect(formatCalendarDate(date)).toBe(want);
  });
});

describe('parseDateRange', () => {
  it('reads a range of days', () => {
    expect(parseDateRange('2026-01-01', '2026-06-30')).toEqual({
      ok: true,
      range: { from: '2026-01-01', to: '2026-06-30' },
    });
  });

  it('reads a range of one day', () => {
    expect(parseDateRange('2026-11-15', '2026-11-15')).toMatchObject({ ok: true });
  });

  it.each([
    { from: '', to: '2026-06-30', errors: { from: 'Choose the first day.' } },
    { from: '2026-01-01', to: '', errors: { to: 'Choose the last day.' } },
    {
      from: '2026-07-01',
      to: '2026-06-30',
      errors: { to: 'The last day comes after the first.' },
    },
  ])('refuses $from to $to', ({ from, to, errors }) => {
    expect(parseDateRange(from, to)).toEqual({ ok: false, errors });
  });
});
