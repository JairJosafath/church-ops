/**
 * The plan's running clock. Items have lengths, not clock times: each item
 * starts when the lengths before it have run from the service's start, so an
 * overrun moves everything after it. A header has length 0 and takes no time.
 */

/** When each item starts, when the service ends, and its total length. */
export interface PlanClock {
  readonly itemStarts: readonly Date[];
  readonly endsAt: Date;
  readonly totalSeconds: number;
}

/**
 * The clock of a service that starts at `startsAt` (ISO 8601) with items of
 * `lengths` seconds, in order; null when `startsAt` is not a time.
 */
export function planClock(startsAt: string, lengths: readonly number[]): PlanClock | null {
  const start = new Date(startsAt).getTime();
  if (Number.isNaN(start)) {
    return null;
  }
  const itemStarts: Date[] = [];
  let elapsed = 0;
  for (const length of lengths) {
    itemStarts.push(new Date(start + elapsed * 1000));
    elapsed += length;
  }
  return { itemStarts, endsAt: new Date(start + elapsed * 1000), totalSeconds: elapsed };
}

/** A length as the plan shows it: "4:30", or "1:02:05" from an hour. */
export function formatLength(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${rest}`
    : `${String(minutes)}:${rest}`;
}

const LENGTH_PATTERN = /^(?:(?:(\d+):)?(\d+):([0-5]\d)|(\d+))$/;

/**
 * Reads a length as a planner types it: "4:30", "1:02:05", or a whole
 * number of minutes ("5"). Returns seconds, or null when it is no length.
 */
export function parseLength(text: string): number | null {
  const match = LENGTH_PATTERN.exec(text.trim());
  if (match === null) {
    return null;
  }
  const [, hours, minutes, seconds, wholeMinutes] = match;
  if (wholeMinutes !== undefined) {
    return Number(wholeMinutes) * 60;
  }
  if (hours !== undefined && Number(minutes) > 59) {
    return null;
  }
  return Number(hours ?? '0') * 3600 + Number(minutes) * 60 + Number(seconds);
}
