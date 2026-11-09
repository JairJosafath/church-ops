/**
 * Blockouts: the days a person has said they cannot serve. A blockout is the
 * person's word. The planner is warned and may still ask; the person decides.
 */

/** A blocked range of days, both ends included, as "YYYY-MM-DD". */
export interface BlockedRange {
  readonly startsOn: string;
  readonly endsOn: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `date` ("YYYY-MM-DD") falls inside one of `blockouts`. */
export function isBlockedOn(blockouts: readonly BlockedRange[], date: string): boolean {
  // ISO dates compare as strings in calendar order.
  return blockouts.some((blockout) => blockout.startsOn <= date && date <= blockout.endsOn);
}

/** What is wrong with a blockout from `startsOn` to `endsOn`, or null. */
export function blockoutRangeError(startsOn: string, endsOn: string): string | null {
  if (!DATE_PATTERN.test(startsOn)) {
    return 'Choose the first day.';
  }
  if (!DATE_PATTERN.test(endsOn)) {
    return 'Choose the last day.';
  }
  return endsOn < startsOn ? 'The last day is before the first.' : null;
}
