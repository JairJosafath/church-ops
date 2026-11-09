/**
 * Live timers: the current item counts down from its length since it became
 * current, and runs into overtime below zero; the service's end is projected
 * from there with the lengths of the items still to come.
 */
import { formatLength } from './plan_times';

function startOf(itemStartedAt: string | null): number | null {
  if (itemStartedAt === null) {
    return null;
  }
  const start = new Date(itemStartedAt).getTime();
  return Number.isNaN(start) ? null : start;
}

/**
 * Whole seconds left of an item of `lengthSeconds` that became current at
 * `itemStartedAt`, at `nowMs`; negative once it runs over, null without a start.
 */
export function secondsLeft(
  itemStartedAt: string | null,
  lengthSeconds: number,
  nowMs: number,
): number | null {
  const start = startOf(itemStartedAt);
  return start === null ? null : lengthSeconds - Math.floor((nowMs - start) / 1000);
}

/** A countdown as the band reads it: "4:30", or "−0:12" once it runs over. */
export function formatCountdown(seconds: number): string {
  return seconds < 0 ? `−${formatLength(-seconds)}` : formatLength(seconds);
}

/** The lengths, in seconds, of the items after the one at `currentPosition`. */
export function secondsAfter(
  items: readonly { readonly position: number; readonly lengthSeconds: number }[],
  currentPosition: number,
): number {
  return items
    .filter((item) => item.position > currentPosition)
    .reduce((total, item) => total + item.lengthSeconds, 0);
}

/**
 * When the service ends if the rest runs to plan: the current item's end, or
 * now once it ran over, plus `afterSeconds` for the items after it.
 */
export function projectedEnd(
  itemStartedAt: string | null,
  lengthSeconds: number,
  afterSeconds: number,
  nowMs: number,
): Date | null {
  const start = startOf(itemStartedAt);
  if (start === null) {
    return null;
  }
  return new Date(Math.max(nowMs, start + lengthSeconds * 1000) + afterSeconds * 1000);
}
