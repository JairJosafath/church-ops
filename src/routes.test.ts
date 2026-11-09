import { describe, expect, it } from 'vitest';

import { parseRoute, routeHref, type Route } from './routes';

describe('parseRoute', () => {
  it.each<{ hash: string; want: Route }>([
    { hash: '', want: { page: 'services' } },
    { hash: '#', want: { page: 'services' } },
    { hash: '#/', want: { page: 'services' } },
    { hash: '#/services', want: { page: 'services' } },
    { hash: '#/services/', want: { page: 'services' } },
    { hash: '#/services/12', want: { page: 'service', serviceId: 12 } },
    { hash: '#/services/12/live', want: { page: 'live', serviceId: 12 } },
    { hash: '#/songs', want: { page: 'songs' } },
    { hash: '#/people', want: { page: 'people' } },
    { hash: '#/me', want: { page: 'me' } },
    { hash: '#/services/abc', want: { page: 'not_found' } },
    { hash: '#/services/0', want: { page: 'not_found' } },
    { hash: '#/services/1e3', want: { page: 'not_found' } },
    { hash: '#/services/12/edit', want: { page: 'not_found' } },
    { hash: '#/nowhere', want: { page: 'not_found' } },
  ])('reads "$hash"', ({ hash, want }) => {
    expect(parseRoute(hash)).toEqual(want);
  });
});

describe('routeHref', () => {
  it.each<{ route: Route; want: string }>([
    { route: { page: 'services' }, want: '#/services' },
    { route: { page: 'service', serviceId: 3 }, want: '#/services/3' },
    { route: { page: 'live', serviceId: 3 }, want: '#/services/3/live' },
    { route: { page: 'songs' }, want: '#/songs' },
    { route: { page: 'people' }, want: '#/people' },
    { route: { page: 'me' }, want: '#/me' },
    { route: { page: 'not_found' }, want: '#/services' },
  ])('links to $want', ({ route, want }) => {
    expect(routeHref(route)).toBe(want);
    if (route.page !== 'not_found') {
      expect(parseRoute(want)).toEqual(route);
    }
  });
});
