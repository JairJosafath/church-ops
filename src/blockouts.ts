/**
 * Blockouts: the days a person has said they cannot serve. A blockout is the
 * person's word. The planner is warned (the api says who is blocked) and may
 * still ask; the person decides.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
