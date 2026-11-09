/**
 * My schedule: the requests sent to one person, as they answer them. Pending
 * ones wait for a yes or a no (with a reason, if they want); confirmed ones
 * can still be withdrawn ("can't make it after all"); the rest is history.
 */
import type { ScheduleRequest } from './api_types';
import { amsterdamDate } from './dutch_time';

export interface MySchedule {
  /** Waiting for an answer, from today on, soonest first. */
  readonly pending: readonly ScheduleRequest[];
  /** Accepted, from today on, soonest first. */
  readonly confirmed: readonly ScheduleRequest[];
  /** Declined, cancelled, or before today, latest first. */
  readonly earlier: readonly ScheduleRequest[];
}

function startOf(request: ScheduleRequest): number {
  return new Date(request.serviceStartsAt).getTime();
}

/** Splits `requests` by what the person can still do about them on `today` ("YYYY-MM-DD", Dutch). */
export function splitSchedule(requests: readonly ScheduleRequest[], today: string): MySchedule {
  const upcoming = (request: ScheduleRequest): boolean =>
    (amsterdamDate(request.serviceStartsAt) ?? today) >= today;
  const soonestFirst = (a: ScheduleRequest, b: ScheduleRequest): number => startOf(a) - startOf(b);
  const pending = requests
    .filter((request) => request.status === 'pending' && upcoming(request))
    .sort(soonestFirst);
  const confirmed = requests
    .filter((request) => request.status === 'accepted' && upcoming(request))
    .sort(soonestFirst);
  const earlier = requests
    .filter((request) => !pending.includes(request) && !confirmed.includes(request))
    .sort((a, b) => soonestFirst(b, a));
  return { pending, confirmed, earlier };
}

/** The longest reason the api takes for a decline or a withdrawal. */
export const REASON_MAX = 500;

/** What is wrong with a decline reason as typed, or null. */
export function reasonError(text: string): string | null {
  // Code points, as the api counts them: an emoji is one character, not two.
  const length = Array.from(text.trim()).length;
  return length > REASON_MAX
    ? `Keep the reason to ${String(REASON_MAX)} characters; it has ${String(length)}.`
    : null;
}
