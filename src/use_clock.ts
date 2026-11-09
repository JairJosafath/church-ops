import { useSyncExternalStore } from 'react';

/** How often a page that shows a running timer reads the clock, in milliseconds. */
const TICK_MS = 1000;

function subscribe(onTick: () => void): () => void {
  const timer = setInterval(onTick, TICK_MS);
  return () => {
    clearInterval(timer);
  };
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * The time now, in whole seconds since 1970, read from the clock every
 * second while a component uses it, so rendering itself never reads the clock.
 */
export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, currentSecond);
}
