import { useCallback, type ReactElement } from 'react';

import { api } from './api_client';
import type { Person } from './api_types';
import { LivePage } from './live_page';
import { MatrixPage } from './matrix_page';
import { MePage } from './me_page';
import { setMeId, useMeId } from './me_store';
import { PeoplePage } from './people_page';
import { routeHref, type Route } from './routes';
import { ServicePage } from './service_page';
import { ServicesPage } from './services_page';
import { SongsPage } from './songs_page';
// v0.2 songs and plans
import { RehearsePage } from './rehearse_page';
import { ServiceTypesPage } from './service_types_page';
import { SongPage } from './song_page';
import { SongUsagePage } from './song_usage_page';
import { useHashRoute } from './use_hash_route';
import { useResource } from './use_resource';

const NAV: readonly { readonly route: Route; readonly label: string }[] = [
  { route: { page: 'services' }, label: 'Services' },
  // v0.2 scheduling
  { route: { page: 'matrix' }, label: 'Matrix' },
  { route: { page: 'songs' }, label: 'Songs' },
  { route: { page: 'people' }, label: 'People' },
  { route: { page: 'me' }, label: 'My schedule' },
];

/**
 * The navigation entry each page sits under. v0.2 songs and plans: a song under Songs;
 * v0.2 scheduling: a plan's Teams section under Services.
 */
function navPageOf(route: Route): Route['page'] {
  switch (route.page) {
    case 'service':
    case 'live':
    case 'rehearse':
    case 'service_types':
    case 'service_teams':
      return 'services';
    case 'song':
    case 'song_usage':
      return 'songs';
    case 'services':
    case 'songs':
    case 'people':
    case 'me':
    case 'not_found':
    case 'matrix':
      return route.page;
  }
}

function isCurrent(navRoute: Route, route: Route): boolean {
  return navRoute.page === navPageOf(route);
}

interface MePickerProps {
  readonly people: readonly Person[];
  readonly meId: number | null;
}

/** "Who are you": the person this browser acts for. No login yet, so it is only a choice. */
function MePicker({ people, meId }: MePickerProps): ReactElement {
  return (
    <div className="me-picker">
      <label htmlFor="me-picker">You are</label>
      <select
        id="me-picker"
        value={meId === null ? '' : String(meId)}
        onChange={(event) => {
          const id = Number(event.target.value);
          setMeId(Number.isSafeInteger(id) && id > 0 ? id : null);
        }}
      >
        <option value="">Choose…</option>
        {people.map((person) => (
          <option key={person.id} value={String(person.id)}>
            {person.name}
          </option>
        ))}
      </select>
    </div>
  );
}

interface AppProps {
  /** The app's name, shown in the header. */
  readonly title: string;
}

/** The page: the header with its navigation and "You are", the current route, and the footer. */
export function App({ title }: AppProps): ReactElement {
  const route = useHashRoute();
  const storedMeId = useMeId();
  const loadPeople = useCallback((signal: AbortSignal) => api.listPeople(signal), []);
  const [peopleResource, reloadPeople] = useResource(loadPeople);
  const people = peopleResource.status === 'ready' ? peopleResource.value : [];
  const me = people.find((person) => person.id === storedMeId) ?? null;

  const page = ((): ReactElement => {
    switch (route.page) {
      case 'services':
        return <ServicesPage />;
      case 'service':
        return <ServicePage key={route.serviceId} serviceId={route.serviceId} people={people} />;
      case 'live':
        return (
          <LivePage key={route.serviceId} serviceId={route.serviceId} me={me} people={people} />
        );
      case 'songs':
        return <SongsPage />;
      case 'people':
        return <PeoplePage people={people} onPeopleChanged={reloadPeople} />;
      case 'me':
        return <MePage me={me} />;
      // v0.2 songs and plans
      case 'song':
        return <SongPage key={route.songId} songId={route.songId} />;
      case 'rehearse':
        return <RehearsePage key={route.serviceId} serviceId={route.serviceId} />;
      case 'song_usage':
        return <SongUsagePage />;
      case 'service_types':
        return <ServiceTypesPage />;
      // v0.2 scheduling
      case 'matrix':
        return <MatrixPage />;
      case 'service_teams':
        return (
          <ServicePage
            key={route.serviceId}
            serviceId={route.serviceId}
            people={people}
            focusTeams
          />
        );
      case 'not_found':
        return (
          <>
            <h1>Page not found</h1>
            <p>
              There is no page here. Go to the{' '}
              <a href={routeHref({ page: 'services' })}>services</a>.
            </p>
          </>
        );
    }
  })();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href={routeHref({ page: 'services' })}>
          {title}
        </a>
        <nav aria-label="Main">
          <ul>
            {NAV.map((entry) => (
              <li key={entry.route.page}>
                <a
                  href={routeHref(entry.route)}
                  aria-current={isCurrent(entry.route, route) ? 'page' : undefined}
                >
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <MePicker people={people} meId={me === null ? null : me.id} />
      </header>
      <main id="main" tabIndex={-1}>
        {peopleResource.status === 'failed' ? (
          <p className="notice error" role="alert">
            Could not load the people. {peopleResource.error}
          </p>
        ) : null}
        {page}
      </main>
      <footer className="site-footer">
        <p>
          No sign-in yet: &ldquo;You are&rdquo; only says whose schedule to show and who holds live
          control, and anyone using this page can choose anyone.
        </p>
      </footer>
    </>
  );
}
