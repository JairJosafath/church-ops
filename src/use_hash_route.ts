import { useSyncExternalStore } from 'react';

import { parseRoute, routeHref, type Route } from './routes';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function currentHash(): string {
  return window.location.hash;
}

/** The route the location's hash names, following every change to it. */
export function useHashRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash));
}

/** Goes to `route`, as following a link to it would. */
export function navigate(route: Route): void {
  window.location.hash = routeHref(route);
}
