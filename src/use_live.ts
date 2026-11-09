import { useCallback, useEffect, useRef, useState } from 'react';

import { api, describeError, isAbort } from './api_client';
import type { LiveState } from './api_types';

/** How often a live page asks for the live state, in milliseconds. */
export const LIVE_POLL_MS = 1000;

export type LiveView =
  | { readonly status: 'loading' }
  | { readonly status: 'not_live' }
  | { readonly status: 'live'; readonly state: LiveState };

export interface LiveConnection {
  readonly view: LiveView;
  /** Why the last poll failed, while polling goes on; null when it worked. */
  readonly pollError: string | null;
  /** Shows the state an action answered with (null: live mode ended). */
  readonly apply: (state: LiveState | null) => void;
}

function viewOf(state: LiveState | null): LiveView {
  return state === null ? { status: 'not_live' } : { status: 'live', state };
}

/**
 * Follows a service's live mode: asks for it every second, one request at a
 * time, and stops when the page goes away. A poll that was sent before an
 * action answered is dropped, so the page never jumps back to an older item.
 */
export function useLive(serviceId: number): LiveConnection {
  const [view, setView] = useState<LiveView>({ status: 'loading' });
  const [pollError, setPollError] = useState<string | null>(null);
  const actions = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll(): Promise<void> {
      const actionsBefore = actions.current;
      try {
        const state = await api.getLive(serviceId, controller.signal);
        if (actions.current === actionsBefore) {
          setView(viewOf(state));
        }
        setPollError(null);
      } catch (error) {
        if (controller.signal.aborted || isAbort(error)) {
          return;
        }
        setPollError(`${describeError(error)} The page keeps trying every second.`);
      }
      timer = setTimeout(() => {
        void poll();
      }, LIVE_POLL_MS);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [serviceId]);

  const apply = useCallback((state: LiveState | null) => {
    actions.current += 1;
    setView(viewOf(state));
  }, []);

  return { view, pollError, apply };
}
