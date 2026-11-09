# Web

The `web` web app of church-ops, in project church-ops: a page in
React and TypeScript, built with Vite, scaffolded by theos.

## Use it

The page plans, schedules and runs a church's services against the church-ops
api:

- **Services** (`#/services`): list services, create one, or copy a past
  service's items to a new date (a copy, with no link back). A new service
  from a service type takes a date and an optional series, starts at the
  type's start time, and begins as a copy of the type's template.
- **Service types** (`#/service-types`): each kind of service with its start
  time, how long before it the teams rehearse, and its template (the items
  and positions a new plan starts with). A plan page saves the plan as its
  type's template.
- **Plan** (`#/services/<id>`): add, edit, reorder and remove items. Items
  have lengths, not clock times: the plan shows each item's start, computed
  from the service's start, and the service's end, in Dutch time. A song item
  names an arrangement and may set its own key; the plan shows the key it is
  played in. One list, with a view for the band and one for the stream, and
  "Notes for" to show one team's notes. A song item has a song leader; every
  item has notes for everyone and notes per team, and a new song item left
  without notes gets the notes of the last time the song was planned. The
  plan's times list its rehearsals, which can be added and removed, and the
  service.
- **Teams** (`#/services/<id>/teams` opens a plan at it): the positions the
  plan needs and how many of each, each with the people asked, their answer
  (pending, confirmed or declined, with the reason they gave) and the open
  slots. Find people lists who can fill a position, with a badge for each
  warning: blocked out (never with the reason, which stays the person's), a
  request at another service the same day, another position at this plan, a
  decline here; and how often they served lately. A warning never stops the
  scheduler: Ask anyway sends the request, and the person decides.
- **Matrix** (`#/matrix`): the next 12 plans across and the positions down,
  each cell with the people asked and their status, and the open slots.
  Choosing a cell opens that plan's Teams section.
- **Rehearse** (`#/services/<id>/rehearse`): each song of the plan in order,
  in the key the item is played in: arrangement, key, tempo, meter, sequence,
  leader, the notes for a chosen team, the reference recording and the chord
  chart, chords over lyrics. It prints one song to a page.
- **Songs** (`#/songs`): find songs by tag and by words; each shows when it
  was last scheduled and how often it was played in the last 12 months.
- **Song** (`#/songs/<id>`): edit a song's title, authors, CCLI number and
  tags, and each arrangement: keys, tempo, meter, length, sequence, notes, a
  reference recording link and the chart. The chart is ChordPro text written
  in the default key (`[G]Amazing [C]grace`, section labels such as `Verse 1`
  or `Chorus` on their own line, `{c: comments}`), with a preview in any key,
  spelled in that key's sharps or flats.
- **Song usage** (`#/reports/songs`): how often each song was played in the
  services of a range of days, for the CCLI report.
- **People** (`#/people`): teams, their positions, who can fill each
  position (the people a plan's Find people offers), and people.
- **My schedule** (`#/me`): your pending requests (accept, or decline with
  a reason if you want to give one), what you are confirmed for from today on
  (open the plan, rehearse, or withdraw with a reason when you can't make it
  after all), what is earlier or answered, and your blockouts. A blockout's
  reason is yours: a planner sees only that you are away, never why. Works
  at phone width.
- **Live mode** (`#/services/<id>/live`): one named person holds control and
  moves the service on with Next and Back; everyone else follows (the page
  asks every second), sees who holds control, and can be handed it. OBS and
  Ableton show the state the integrations worker reports. The current item
  counts down from its length since it became current, and below zero shows
  how far it ran over; the projected end of the service (that moment, plus
  the lengths of the items after it) stands next to the planned end.

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
  (`song_keys.ts`), ChordPro charts and transposing (`chordpro.ts`), the
  Rehearse view's songs (`rehearsal.ts`), plan times (`service_times.ts`),
  dates (`calendar_date.ts`), reordering (`reorder.ts`), blockouts
  (`blockouts.ts`), live control (`live.ts`), scheduling (`scheduling.ts`,
  `matrix.ts`) and the forms (`item_form.ts`, `arrangement_form.ts`,
  `song_form.ts`, `service_type_form.ts`). Tests sit next to them as `*.test.ts`; component
  tests (`*.test.tsx`) bring their own DOM with jsdom and a fake api
  (`test_fetch.ts`).
- `public/` is copied into the site as is (the icon).
- `vite.config.ts` configures the build and the tests.

Read `AGENTS.md` before changing anything: it is the rulebook, for people and agents.
