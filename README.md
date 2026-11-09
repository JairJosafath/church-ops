# Integrations worker

The `integrations-worker` worker of church-ops, in project church-ops: a
long-running process in Python 3.12 or later, managed with [uv](https://docs.astral.sh/uv/)
and scaffolded by theos.

## Run it

```sh
uv run python -m app   # the image runs python -m app; Ctrl-C stops it
```

It does a round of work every 10 seconds and logs to stderr, one line per event.
SIGTERM or SIGINT lets the round in progress finish, then the worker exits 0 within a
tenth of a second. A round that raises is logged with its traceback, and the wait
before the next one doubles with each failure in a row, up to 5 minutes. On
Kubernetes, SIGTERM is how a pod is stopped, so a round must finish within the pod's
grace period (30 seconds unless the Deployment says otherwise).

## Develop

Open the repository in its devcontainer (`.devcontainer/`), which installs uv and runs
`uv sync` for you. Anywhere else, [install uv](https://docs.astral.sh/uv/getting-started/installation/) first.

```sh
uv sync                          # create .venv from pyproject.toml and uv.lock
uv run python -m app             # run it; Ctrl-C stops it
uv run pytest                    # unit tests
make check                       # what CI runs: lint, formatting, types, tests and the build
make help                        # every target
```

`uv.lock` pins every package; commit it with `pyproject.toml` whenever `uv add` changes them.

## Layout

- `app/worker.py` is the worker: `main`, the `[project.scripts]` entry point in
  `pyproject.toml`, sets up logging and the SIGTERM and SIGINT handlers and calls `run`,
  which does a round of `work`, then waits, until a stop is asked. Put the work of a
  round in `work`, or pass `run` your own; make a round safe to redo, since a crash
  repeats it. Tests call `run` with a fake `Stop`, and one sends a real SIGTERM.
- `app/backoff.py` holds the waits: `INTERVAL_SECONDS` between rounds, doubled per
  failure in a row up to `MAX_SECONDS`.
- `app/*.py` are the program's modules; `app/__main__.py` runs it as `python -m app`.
- `tests/` holds the pytest tests, one file per module.

Read `AGENTS.md` before changing anything: it is the rulebook, for people and agents.
