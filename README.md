# Web

The `web` web app of church-ops, in project church-ops: a page in
React and TypeScript, built with Vite, scaffolded by theos.

## Use it

The page plans, schedules and runs a church's services against the church-ops
api:

- **Services** (`#/services`): list services, create one, or copy a past
  service's items to a new date (a copy, with no link back).
- **Plan** (`#/services/<id>`): add, edit, reorder and remove items. Items
  have lengths, not clock times: the plan shows each item's start, computed
  from the service's start, and the service's end, in Dutch time. A song item
  names an arrangement and may set its own key; the plan shows the key it is
  played in. One list, with a view for the band and one for the stream. Send
  requests to people for positions; a person who blocked the date out is
  warned about (never with their reason), and may still be asked.
- **Songs** (`#/songs`): songs and their arrangements (key, tempo, meter,
  length, sequence, chart).
- **People** (`#/people`): teams, their positions, and people.
- **My requests** (`#/me`): accept or decline your pending requests, and add
  or remove your blockouts. Works at phone width.
- **Live mode** (`#/services/<id>/live`): one named person holds control and
  moves the service on with Next and Back; everyone else follows (the page
  asks every second), sees who holds control, and can be handed it. OBS and
  Ableton show the state the integrations worker reports.

"You are", at the top, picks the person this browser acts for, kept in
localStorage. There is no sign-in yet: the api runs with authentication
disabled locally, and anyone can pick anyone.

The app is a static site: `npm run build` writes it to `dist/`, which any web
server can serve as files. Open `index.html` through a server, not from disk.
It calls the api under `/api`; whatever serves the site must pass `/api/*` on
to the api with the prefix stripped.

## Develop

Open the repository in its devcontainer, which has Node 24 and the Go toolchain.

```sh
npm ci               # install the exact packages in package-lock.json
npm run dev          # serve the page with hot reload on http://localhost:5173
npm run preview      # serve the built site from dist/
npm test             # unit tests with vitest; no browser needed
make check           # what CI runs: format, lint, type check, test, build
make dist            # the site in dist/
make help            # every target
```

`npm run dev` and `npm run preview` pass `/api/*` to the api at `API_URL`
(default `http://127.0.0.1:18090`), stripping the `/api` prefix:

```sh
API_URL=http://127.0.0.1:8000 npm run dev
```

## Layout

- `index.html` is the page Vite serves and builds; its `<title>` is the app's
  name, which the page shows in its header.
- `src/main.tsx` mounts the app; `src/app.tsx` is the header, the hash routes
  (`src/routes.ts`) and the footer; `src/*_page.tsx` are the pages.
- `src/api_client.ts` is the one module that calls the api; `src/api_types.ts`
  checks every answer against the contract's shapes (`src/decode.ts`).
- The logic is in modules that import neither React nor the DOM, tested with
  plain vitest: the running clock (`plan_times.ts`, `dutch_time.ts`), keys
  (`song_keys.ts`), reordering (`reorder.ts`), blockouts (`blockouts.ts`),
  live control (`live.ts`) and the forms (`item_form.ts`,
  `arrangement_form.ts`). Tests sit next to them as `*.test.ts`; component
  tests (`*.test.tsx`) bring their own DOM with jsdom and a fake api
  (`test_fetch.ts`).
- `public/` is copied into the site as is (the icon).
- `vite.config.ts` configures the build and the tests.

Read `AGENTS.md` before changing anything: it is the rulebook, for people and agents.
