/** The page's routes, kept in the URL's hash so a static server can serve every page. */
export type Route =
  | { readonly page: 'services' }
  | { readonly page: 'service'; readonly serviceId: number }
  | { readonly page: 'live'; readonly serviceId: number }
  | { readonly page: 'songs' }
  | { readonly page: 'people' }
  | { readonly page: 'me' }
  | { readonly page: 'not_found' };

const SERVICE_PATTERN = /^\/services\/([1-9]\d*)(\/live)?$/;

/** The route a location hash ("#/services/12/live") names. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/(.)\/$/, '$1');
  switch (path) {
    case '':
    case '/':
    case '/services':
      return { page: 'services' };
    case '/songs':
      return { page: 'songs' };
    case '/people':
      return { page: 'people' };
    case '/me':
      return { page: 'me' };
    default: {
      const match = SERVICE_PATTERN.exec(path);
      if (match === null) {
        return { page: 'not_found' };
      }
      const serviceId = Number(match[1]);
      return match[2] === undefined ? { page: 'service', serviceId } : { page: 'live', serviceId };
    }
  }
}

/** The hash link to `route`; an unknown page links to the services. */
export function routeHref(route: Route): string {
  switch (route.page) {
    case 'services':
    case 'not_found':
      return '#/services';
    case 'service':
      return `#/services/${String(route.serviceId)}`;
    case 'live':
      return `#/services/${String(route.serviceId)}/live`;
    case 'songs':
      return '#/songs';
    case 'people':
      return '#/people';
    case 'me':
      return '#/me';
  }
}
