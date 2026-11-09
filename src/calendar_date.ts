/**
 * Calendar dates ("YYYY-MM-DD"), which the api uses for days rather than
 * moments: when a song was last scheduled, the range of a report. A date has
 * no time zone, so it is read and written as the day it names.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function dateAt(text: string): Date | null {
  const match = DATE_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const [, year, month, day] = match;
  const instant = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return instant.getUTCMonth() === Number(month) - 1 && instant.getUTCDate() === Number(day)
    ? instant
    : null;
}

/** Whether `text` is a real day written "YYYY-MM-DD". */
export function isCalendarDate(text: string): boolean {
  return dateAt(text) !== null;
}

/** The day in words ("Sunday 1 November 2026"), or `text` itself when it is no date. */
export function formatCalendarDate(text: string): string {
  const instant = dateAt(text);
  return instant === null ? text : DATE_FORMAT.format(instant).replace(',', '');
}

export interface DateRange {
  readonly from: string;
  readonly to: string;
}

export type DateRangeResult =
  | { readonly ok: true; readonly range: DateRange }
  | { readonly ok: false; readonly errors: Partial<Record<'from' | 'to', string>> };

/** Reads a range of days, both included, as date inputs give them, or says what to fix. */
export function parseDateRange(from: string, to: string): DateRangeResult {
  const errors: Partial<Record<'from' | 'to', string>> = {};
  if (!isCalendarDate(from)) {
    errors.from = 'Choose the first day.';
  }
  if (!isCalendarDate(to)) {
    errors.to = 'Choose the last day.';
  } else if (errors.from === undefined && to < from) {
    errors.to = 'The last day comes after the first.';
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, range: { from, to } };
}
