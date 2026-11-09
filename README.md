# API

`api` is a service in the church-ops software system
(project `church-ops`). theos scaffolded it once; from here on the code is yours.

It is a [uv](https://docs.astral.sh/uv/) project with [FastAPI](https://fastapi.tiangolo.com/),
[ruff](https://docs.astral.sh/ruff/) and [pytest](https://docs.pytest.org/).

## Run it

Open the repository in its devcontainer (`.devcontainer/`), which installs uv and runs
`uv sync` for you. Anywhere else, [install uv](https://docs.astral.sh/uv/getting-started/installation/) first.

```sh
uv sync                                   # create .venv from pyproject.toml and uv.lock
uv run uvicorn app.main:app --reload      # http://localhost:8000, API docs at /docs
```

`uv.lock` pins every package; commit it with `pyproject.toml` whenever `uv add` changes them.

## Check it

```sh
make check   # what CI runs: lint, formatting, types, tests and the build
make help    # every target
```

## Endpoints

- `GET /` returns the container and software system names.
- `GET /me` returns the `sub` of the caller's token.
- `GET /healthz` returns `{"status": "ok"}` while the process is up; it needs no token.
- `GET /readyz` returns 200 while the database answers `SELECT 1`, 503 when it doesn't.
  `app/db.py` opens a psycopg connection pool on `DATABASE_URL`; libpq reads the
  password from `PGPASSWORD`. In the devcontainer `DATABASE_URL` names its Postgres,
  and `tests/test_main.py` runs `/readyz` against it; elsewhere that test is skipped.
  It needs no token.

## Records

The routes below keep their records in Postgres when `DATABASE_URL` is set: start-up
creates the tables that are missing (`app/postgres_store.py`) and leaves existing ones
as they are, and fails when the database gives no connection within 30 seconds.
Without `DATABASE_URL` they are kept in memory and lost when the process ends, which
start-up logs as a warning. The routes take and give JSON, as `/docs` shows; times
carry a UTC offset and the api gives them at Amsterdam's (`app/local_time.py`).
Errors are `{"detail": "..."}`: 404 for a missing record, 409 for a request that
conflicts with the records, 422 for invalid input.

- `GET /people`, `POST /people`: people, by name.
- `GET /teams`, `POST /teams`, `POST /teams/{team_id}/positions`: teams and their positions.
  A position lists its `member_ids`, the people who can fill it:
  `POST /positions/{id}/members` (409 when they are one already) and
  `DELETE /positions/{id}/members/{person_id}` (404 when they are not).
- `GET /songs` (`?tag=` and `?q=`), `POST /songs`, `GET /songs/{song_id}`,
  `PATCH /songs/{song_id}` {title?, authors?, ccli?, tags?}: songs, by title, with their
  arrangements. A song has `tags`, each kept once (ignoring case); `tag` (repeatable)
  keeps the songs with every tag named, ignoring case, and `q` those with the words in
  the title, authors or CCLI number. `last_scheduled_on` is the date of the latest
  service it is planned in, past or to come, and `times_used_12_months` counts its song
  items in services in the 365 days up to now.
- `POST /songs/{song_id}/arrangements`, `PATCH /songs/{song_id}/arrangements/{id}`: how
  the church plays a song. Besides its default `key`, an arrangement lists the `keys`
  the team plays it in, the default first (a new default keeps the old one among them
  unless `keys` is given too), the band's `notes`, and an `audio_url` to a reference
  recording (http or https, or null). `chart` is ChordPro text, kept as it is: chords in
  brackets inline, section labels on their own line, `{c: ...}` comments; clients
  transpose and render it. PATCH takes every field.
- `GET /reports/song-usage?from=YYYY-MM-DD&to=YYYY-MM-DD`: for CCLI reporting, each
  song's count of song items in the services on those dates (Amsterdam's, both
  included), most used first; songs not used are left out.
- `GET /service-types`, `POST /service-types` {name, start_time?="10:00",
  rehearsal_offset_minutes?=null}, `PATCH /service-types/{id}`: the recurring kinds of
  gathering, by name. `start_time` is HH:MM in Amsterdam. `PUT /service-types/{id}/template`
  {items, needed} replaces the type's template (items as `POST /services/{id}/items`
  takes them, and the positions it needs; a count of 0 is left out), and
  `POST /service-types/{id}/template/from-service` {service_id} makes a plan's items and
  needed positions the template. A change to a type or its template changes no service
  already planned.
- `GET /services` (`?from=YYYY-MM-DD`), `POST /services`, `GET /services/{id}`,
  `PATCH /services/{id}`, `POST /services/{id}/copy`: services, by start. A copy has
  the original's items, needed positions, type and series, and its rehearsals moved by
  as much as its start; it has no requests, and no link back. `POST /services` with a
  `service_type_id` copies that type's template into the new plan, takes the type's name
  as `service_type` (and as `title` when none is given), and may give a `date` instead of
  `starts_at`, to start at the type's `start_time` in Amsterdam. With a type that has a
  `rehearsal_offset_minutes`, the plan gets a "Rehearsal" starting that long before the
  service and ending when the service starts or after two hours, whichever is first. A
  service names its `service_type_id` (null when none) and `series` (empty when none,
  which `POST` and `PATCH` may set).
- `POST /services/{id}/times` {kind: "rehearsal", name, starts_at, ends_at},
  `DELETE /services/{id}/times/{time_id}`: a service's rehearsals. A service lists its
  `times` by start, with its own time (id 0, kind "service", from its start to its end,
  named for it), which cannot be deleted (409); moving the service does not move its
  rehearsals.
- `POST /services/{id}/items`, `PATCH /services/{id}/items/{item_id}`,
  `DELETE /services/{id}/items/{item_id}`, `PUT /services/{id}/items/order`: the
  order. Each item starts at the service's start plus the lengths before it, and
  positions stay 0, 1, 2... through every change. A song names an arrangement and no
  other kind does; a header takes no time. A new `prayer` item without `off_stream`
  is off stream, as pastoral moments are until put on stream on purpose; every other
  kind is on stream. An `off_stream` given always wins, and existing items keep theirs.
  A song may name its `song_leader_id` (no other kind may); every item has
  `team_notes`, one note per team (`[{team_id, note}]` in, with `team_name` out, by team
  name). On PATCH the teams named get their note, an empty note removes one, and the
  others stay. A song added without `notes`, or without `team_notes`, copies them from
  the song's most recent item in an earlier service, as the team wrote them last time.
- `POST /services/{id}/requests`, `GET /requests`, `POST /requests/{id}/answer`,
  `POST /requests/{id}/cancel`: scheduling. A request is an invitation; one on a date
  inside the person's blockout is still sent, with `blocked: true`. A second pending
  or accepted request for the same person, service and position, or an answer to one
  no longer pending, is 409. Accepting queues reminders a week and a day before the
  service (those still to come); cancelling queues a cancellation and drops the
  reminders not yet sent; moving a service's start tells who is scheduled and moves
  their reminders. Every request also gives `also_asked`: the person's other pending
  or accepted requests at the same service (position, team and status, newest first),
  as they are when it is read, so a planner sees who is already asked or serving
  there; it is empty when there are none. A request may name its `scheduler_id`, the
  person sending it. A decline may give a `reason` (at most 500 characters, kept as the
  request's `decline_reason`, never put in a message); a reason with an accept is 422.
  `POST /requests/{id}/withdraw` {reason?} declines an accepted request after all
  ("can't make it after all"), drops its reminders and queues a `change` notification
  to the scheduler on record; with none on record, no one is told and the plan shows
  it. Withdrawing a request that is not accepted is 409.
- `PUT /services/{id}/needed` {needed: [{position_id, count}]}: how many people a service
  needs per position. The positions named are set, count 0 removes one, and those left
  out keep theirs. A service lists its `needed` by team and position, each with the
  `accepted`, `pending` and `declined` requests for it and how many are still `open`
  (count less accepted and pending, never below 0); a withdrawn request is declined, a
  cancelled one is not counted.
- `GET /services/{id}/candidates?position_id=`: the position's members to ask, each with
  what the scheduler should weigh: `blocked` (only that they are unavailable: the reason
  a person gives for a blockout stays theirs and is never shown to anyone else),
  `also_asked` (their open requests at
  this service), `conflicts` (their open requests at other services on the same date in
  Amsterdam), `declined_here` (they declined a request at this service),
  `last_served_on` and `times_served_90_days` (the earlier services they accepted a
  request at, the latter in the 90 days before this one). Those without a warning come
  first, then the least served, then by name. A warning never refuses a request.
- `GET /people/{id}/blockouts`, `POST /people/{id}/blockouts`, `DELETE /blockouts/{id}`:
  the dates a person cannot serve. The reason never appears in a request or message; the
  scheduler sees it only among the candidates.
- `GET /notifications/due`, `POST /notifications/{id}/sent`: the outbox the worker
  delivers from, oldest first.
- `POST /services/{id}/live`, `GET /services/{id}/live`, `POST /services/{id}/live/advance`,
  `POST /services/{id}/live/handover`, `PUT /services/{id}/live/devices`,
  `DELETE /services/{id}/live`, `GET /live`: live mode. One named person holds
  control and only they advance (409 names who holds it); a handover passes it on.
  `version` goes up when the current item moves, and only then. `item_started_at` is
  when the current item became current, and `recorded` lists each `{item_id,
  started_at}` in order (going back included) since live mode started, so clients count
  down the item's length and project the end; ending live mode forgets them. A service
  that went live before the upgrade has `item_started_at` null until its next advance.

`tests/` runs every test of these routes twice: on the in-memory store, and on
Postgres when `TEST_DATABASE_URL` names a database, in a schema of its own that the
run drops at the end.

## Logs

`app/logs.py` writes logs to stdout as JSON, one object per line: one line per
request (`method`, `path` without its query string, `status`, `durationMs` and
`requestId`), and whatever the app and uvicorn log. The request id is the caller's
`X-Request-Id` when it looks like an id, else a new one, and the response echoes it.
Request bodies, header values and query strings are never logged. `LOG_LEVEL` sets
the level (`INFO` when unset); uvicorn's own access log is off.

## Auth

Every route but the probes takes a bearer JWT (`Authorization: Bearer <token>`);
without a valid one it answers 401 with `WWW-Authenticate: Bearer`. `app/auth.py`
verifies it against your OpenID Connect issuer:

- `OIDC_ISSUER`: the issuer's URL. The app reads its keys from the JWKS that
  `$OIDC_ISSUER/.well-known/openid-configuration` names, on the first request, and
  answers 503 while the issuer can't be reached.
- `OIDC_AUDIENCE`: the `aud` a token must carry.

Only RS256 and ES256 tokens pass, and `iss`, `aud` and `exp` must be there and right.
A route reads the token's claims with `Depends(auth.verified_claims)`, as `/me` does.
Add new routes to the `api` router in `app/main.py`, so they are protected too;
routes on `app` itself are open.

With `OIDC_ISSUER` unset the app refuses to start, unless `AUTH_DISABLED=true` turns
verification off on purpose: the devcontainer sets it, and then every route is open.
Never set it in production. The tests sign their tokens with a key they make.

## Connectors

- postgres
