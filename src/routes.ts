/** The page's routes, kept in the URL's hash so a static server can serve every page. */
export type Route =
  | { readonly page: 'services' }
  | { readonly page: 'service'; readonly serviceId: number }
  | { readonly page: 'live'; readonly serviceId: number }
  | { readonly page: 'songs' }
  | { readonly page: 'people' }
  | { readonly page: 'me' }
  // v0.2 songs and plans
  | { readonly page: 'song'; readonly songId: number }
  | { readonly page: 'rehearse'; readonly serviceId: number }
  | { readonly page: 'song_usage' }
  | { readonly page: 'service_types' }
  // v0.2 scheduling
  | { readonly page: 'matrix' }
  | { readonly page: 'service_teams'; readonly serviceId: number }
  | { readonly page: 'not_found' };

const SERVICE_PATTERN = /^\/services\/([1-9]\d*)(\/live)?$/;

// v0.2 scheduling
const SERVICE_TEAMS_PATTERN = /^\/services\/([1-9]\d*)\/teams$/;

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
    // v0.2 scheduling
    case '/matrix':
      return { page: 'matrix' };
    default: {
      // v0.2 songs and plans
      const songsAndPlans = parseSongsAndPlansRoute(path);
      if (songsAndPlans !== null) {
        return songsAndPlans;
      }
      // v0.2 scheduling
      const teams = SERVICE_TEAMS_PATTERN.exec(path);
      if (teams !== null) {
        return { page: 'service_teams', serviceId: Number(teams[1]) };
      }

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
    // v0.2 songs and plans
    case 'song':
      return `#/songs/${String(route.songId)}`;
    case 'rehearse':
      return `#/services/${String(route.serviceId)}/rehearse`;
    case 'song_usage':
      return '#/reports/songs';
    case 'service_types':
      return '#/service-types';
    // v0.2 scheduling
    case 'matrix':
      return '#/matrix';
    case 'service_teams':
      return `#/services/${String(route.serviceId)}/teams`;
  }
}

// v0.2 songs and plans

const SONG_PATTERN = /^\/songs\/([1-9]\d*)$/;
const REHEARSE_PATTERN = /^\/services\/([1-9]\d*)\/rehearse$/;

/** The pages for songs and plans that a path names, or null. */
function parseSongsAndPlansRoute(path: string): Route | null {
  if (path === '/reports/songs') {
    return { page: 'song_usage' };
  }
  if (path === '/service-types') {
    return { page: 'service_types' };
  }
  const song = SONG_PATTERN.exec(path);
  if (song !== null) {
    return { page: 'song', songId: Number(song[1]) };
  }
  const rehearse = REHEARSE_PATTERN.exec(path);
  return rehearse === null ? null : { page: 'rehearse', serviceId: Number(rehearse[1]) };
}
