import { useCallback, useEffect, useState } from 'react';

import { describeError, isAbort } from './api_client';

/** Loads a value; aborts when `signal` fires. */
export type Loader<T> = (signal: AbortSignal) => Promise<T>;

/**
 * A value from the api: loading, ready (with the error of a failed reload,
 * if any, while the last value stays on the page), or failed.
 */
export type Resource<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T; readonly error: string | null }
  | { readonly status: 'failed'; readonly error: string };

interface Loaded<T> {
  readonly load: Loader<T>;
  readonly resource: Resource<T>;
}

/**
 * Loads with `load`, and again whenever `load` changes (pass a `useCallback`)
 * or `reload` is called. A stale answer is aborted and dropped, and a value
 * loaded by an earlier `load` is never shown for a later one.
 */
export function useResource<T>(load: Loader<T>): readonly [Resource<T>, () => void] {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setLoaded({ load, resource: { status: 'ready', value, error: null } });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted || isAbort(error)) {
          return;
        }
        const message = describeError(error);
        setLoaded((previous) =>
          previous?.load === load && previous.resource.status === 'ready'
            ? { load, resource: { ...previous.resource, error: message } }
            : { load, resource: { status: 'failed', error: message } },
        );
      },
    );
    return () => {
      controller.abort();
    };
  }, [load, generation]);

  const reload = useCallback(() => {
    setGeneration((previous) => previous + 1);
  }, []);

  return [loaded?.load === load ? loaded.resource : { status: 'loading' }, reload];
}
