import { useCallback, useState } from 'react';

import { describeError } from './api_client';

export interface ActionMessage {
  readonly text: string;
  readonly tone: 'info' | 'error';
}

export interface Action {
  /** Whether an action is running; its buttons are disabled meanwhile. */
  readonly busy: boolean;
  /** What the last action did, or why it failed. */
  readonly message: ActionMessage | null;
  /**
   * Runs `act`, which resolves to the message to show, and tells whether it
   * worked. A failure is shown on the page, never thrown.
   */
  readonly run: (act: () => Promise<string>) => Promise<boolean>;
}

/** Runs the changes a user asks for, one at a time, and says how they went. */
export function useAction(): Action {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const run = useCallback(async (act: () => Promise<string>): Promise<boolean> => {
    setBusy(true);
    try {
      setMessage({ text: await act(), tone: 'info' });
      return true;
    } catch (error) {
      setMessage({ text: describeError(error), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, message, run };
}
