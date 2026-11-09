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
- `GET /songs`, `POST /songs`, `GET /songs/{song_id}`, `POST /songs/{song_id}/arrangements`:
  songs, by title, and their arrangements.
- `GET /services` (`?from=YYYY-MM-DD`), `POST /services`, `GET /services/{id}`,
  `PATCH /services/{id}`, `POST /services/{id}/copy`: services, by start. A copy has
  the original's items and no requests, and no link back.
- `POST /services/{id}/items`, `PATCH /services/{id}/items/{item_id}`,
  `DELETE /services/{id}/items/{item_id}`, `PUT /services/{id}/items/order`: the
  order. Each item starts at the service's start plus the lengths before it, and
  positions stay 0, 1, 2... through every change. A song names an arrangement and no
  other kind does; a header takes no time.
- `POST /services/{id}/requests`, `GET /requests`, `POST /requests/{id}/answer`,
  `POST /requests/{id}/cancel`: scheduling. A request is an invitation; one on a date
  inside the person's blockout is still sent, with `blocked: true`. A second pending
  or accepted request for the same person, service and position, or an answer to one
  no longer pending, is 409. Accepting queues reminders a week and a day before the
  service (those still to come); cancelling queues a cancellation and drops the
  reminders not yet sent; moving a service's start tells who is scheduled and moves
  their reminders.
- `GET /people/{id}/blockouts`, `POST /people/{id}/blockouts`, `DELETE /blockouts/{id}`:
  the dates a person cannot serve. The reason never appears in a request or message.
- `GET /notifications/due`, `POST /notifications/{id}/sent`: the outbox the worker
  delivers from, oldest first.
- `POST /services/{id}/live`, `GET /services/{id}/live`, `POST /services/{id}/live/advance`,
  `POST /services/{id}/live/handover`, `PUT /services/{id}/live/devices`,
  `DELETE /services/{id}/live`, `GET /live`: live mode. One named person holds
  control and only they advance (409 names who holds it); a handover passes it on.
  `version` goes up when the current item moves, and only then.

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
