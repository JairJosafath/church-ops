/**
 * Times in the church's own time zone. The api stores every time with a UTC
 * offset; the page shows and takes them in Dutch time, so a service in the
 * week the clocks change starts when people think it does.
 */

const ZONE = 'Europe/Amsterdam';

const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const CLOCK_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function wallTimeAt(instant: Date): WallTime {
  const parts = new Map(PARTS_FORMAT.formatToParts(instant).map((part) => [part.type, part.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.get(type) ?? 'NaN');
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

function wallTimeAsUtcMs(wall: WallTime): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
}

/** The Dutch offset from UTC at `instant`, in minutes (60 in winter, 120 in summer). */
function offsetMinutesAt(instant: Date): number {
  return Math.round((wallTimeAsUtcMs(wallTimeAt(instant)) - instant.getTime()) / 60_000);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function parseInstant(iso: string): Date | null {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? null : instant;
}

/**
 * Reads a wall time in the Netherlands, as a `datetime-local` input gives it
 * ("2026-11-15T10:00"), and returns it as ISO 8601 with the Dutch offset of
 * that day ("2026-11-15T10:00:00+01:00"), or null when it is no such time.
 */
export function amsterdamLocalToIso(local: string): string | null {
  const match = LOCAL_PATTERN.exec(local);
  if (match === null) {
    return null;
  }
  const [, year, month, day, hour, minute, second] = match;
  const wall: WallTime = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second ?? '0'),
  };
  const asUtc = wallTimeAsUtcMs(wall);
  const check = new Date(asUtc);
  if (
    check.getUTCMonth() !== wall.month - 1 ||
    check.getUTCDate() !== wall.day ||
    check.getUTCHours() !== wall.hour ||
    check.getUTCMinutes() !== wall.minute
  ) {
    return null;
  }
  // The offset depends on the instant, which depends on the offset: guess
  // with the offset at the wall time read as UTC, then correct once.
  let offset = offsetMinutesAt(check);
  offset = offsetMinutesAt(new Date(asUtc - offset * 60_000));
  const instant = new Date(asUtc - offset * 60_000);
  const shown = wallTimeAt(instant);
  return (
    `${pad(shown.year, 4)}-${pad(shown.month)}-${pad(shown.day)}` +
    `T${pad(shown.hour)}:${pad(shown.minute)}:${pad(shown.second)}` +
    formatOffset(offsetMinutesAt(instant))
  );
}

/** The Dutch wall time of `iso` in the form a `datetime-local` input takes, or "". */
export function isoToAmsterdamLocal(iso: string): string {
  const instant = parseInstant(iso);
  if (instant === null) {
    return '';
  }
  const wall = wallTimeAt(instant);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`;
}

/** The Dutch clock time of `instant` ("10:04"), or "--:--" when it is not a time. */
export function formatClock(instant: string | Date): string {
  const parsed = typeof instant === 'string' ? parseInstant(instant) : instant;
  return parsed === null || Number.isNaN(parsed.getTime()) ? '--:--' : CLOCK_FORMAT.format(parsed);
}

/** The Dutch date of `iso` in words ("Sunday 15 November 2026"), or `iso` itself. */
export function formatServiceDate(iso: string): string {
  const instant = parseInstant(iso);
  return instant === null ? iso : DATE_FORMAT.format(instant).replace(',', '');
}

/** The Dutch calendar date of `iso` as "YYYY-MM-DD", or null when it is not a time. */
export function amsterdamDate(iso: string): string | null {
  const instant = parseInstant(iso);
  if (instant === null) {
    return null;
  }
  const wall = wallTimeAt(instant);
  return `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}`;
}
