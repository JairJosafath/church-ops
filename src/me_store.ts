/**
 * Who the person at this browser says they are. There is no login yet: this
 * is a choice kept in localStorage so My requests and live control know whom
 * to act for, and it is only as trustworthy as the person who made it.
 */
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'church-ops.me';

const listeners = new Set<() => void>();

/** The chosen person's id; undefined until first read from storage. */
let meId: number | null | undefined;

function readStored(): number | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored !== null && /^[1-9]\d*$/.test(stored) ? Number(stored) : null;
  } catch {
    // Storage is blocked (a private window, a strict setting): nobody is chosen yet.
    return null;
  }
}

function getMeId(): number | null {
  meId ??= readStored();
  return meId;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Chooses who this browser acts for; null forgets the choice. */
export function setMeId(id: number | null): void {
  meId = id;
  try {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // Storage is blocked: the choice holds for this page until it reloads.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** The id of the person this browser acts for, or null when none is chosen. */
export function useMeId(): number | null {
  return useSyncExternalStore(subscribe, getMeId);
}
