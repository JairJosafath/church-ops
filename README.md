# Integrations worker

The `integrations-worker` worker of church-ops, in project church-ops: a
long-running process in Python 3.12 or later, managed with [uv](https://docs.astral.sh/uv/)
and scaffolded by theos.

It follows live mode on the api and drives the stream computer's OBS and the band's
Ableton Live from it, and it delivers the api's due notifications to a chat.

## What it does

Every `POLL_SECONDS` it does a round:

- **Live mode.** It reads every service in live mode (`GET /live`) and acts only when a
  service's `version` changes, which an item advance does and a plan edit never does.
  A service it first sees at version 1 (live mode just started) counts as an advance; one
  it first sees later, as after a restart, is followed from its next advance, so a
  restart never reloads the song the band is playing.
  - **OBS** (obs-websocket 5): with `auto_switch` on, the current item's scene goes to
    program, or the holding scene when the item is off stream or the service is not
    streamed. With it off, program is left to the operator. Either way the next item's
    scene goes to preview (the holding scene, held the same way, so an operator's take
    never puts an off-stream moment on air), and the lower third's text becomes the
    current item's `lower_third`, or empty when it has none or is off stream. A scene
    OBS does not have is not asked for and is logged; a preview while studio mode is off
    is refused by OBS, logged, and the rest still goes. It never starts or stops the
    stream or the recording.
  - **Ableton** (OSC over UDP): the song to load is the current item when it is a song,
    else the next item when that is a song. It sends `/church-ops/load` with the title and
    key, then `/live/song/set/tempo` with the arrangement's tempo, once per advance, and
    not again for a song it just loaded. It never starts or stops the transport: the band
    leader starts each song.
  - A device it cannot reach is logged and reported `unreachable`; what it missed is not
    sent again, since a late message could land mid-song. Without `OBS_URL` or
    `ABLETON_OSC_HOST` that side is `unconfigured`, and the worker logs what it would have
    sent. The devices' state goes to the api (`PUT /services/{id}/live/devices`) on every
    poll that reached them, and whenever the api's record differs.
- **Notifications.** Each due notification (`GET /notifications/due`) goes through the
  chat adapter as `"<person name>: <text>"`, then is marked sent
  (`POST /notifications/{id}/sent`). One that fails is logged and tried again on the next
  poll. Matrix posts it with the notification's id as the transaction id, so a retry
  after a failed mark posts it once. A round spends at most 10 seconds delivering.

A round that fails on the api is logged on one line, and the wait before the next one
doubles with each failure in a row, from `POLL_SECONDS` up to 30 seconds. SIGTERM or
SIGINT lets the round in progress finish, then the worker exits 0 within a tenth of a
second. Each network call waits at most 5 seconds, so a round stays well inside a pod's
30-second grace period.

## Settings

Read once, at start-up, from the environment. A blank variable counts as unset. A wrong
setting stops the start with exit code 1 and a line that names it. The OBS password and
the Matrix token never appear in a log.

| Variable | Default | Meaning |
| --- | --- | --- |
| `API_URL` | (required) | The api's base URL, `http://` or `https://`. |
| `POLL_SECONDS` | `1` | Seconds between rounds when they succeed. |
| `OBS_URL` | unset: OBS unconfigured | obs-websocket's URL, such as `ws://10.0.0.5:4455`. On the church's network; no proxy is used. |
| `OBS_PASSWORD` | empty | obs-websocket's password (a secret). |
| `OBS_HOLDING_SCENE` | `Holding` | The scene shown for off-stream items and unstreamed services. |
| `OBS_LOWER_THIRD_INPUT` | `Lower third` | The text input whose text is the caption. |
| `ABLETON_OSC_HOST` | unset: Ableton unconfigured | The music computer's host name or IPv4 address. |
| `ABLETON_OSC_PORT` | `11000` | The UDP port of Live's OSC control surface (AbletonOSC's default). |
| `CHAT_ADAPTER` | `log` | `log` logs each notification; `matrix` posts it to a room. |
| `MATRIX_HOMESERVER` | (required for `matrix`) | The homeserver's base URL, such as `https://matrix.example.org`. |
| `MATRIX_ACCESS_TOKEN` | (required for `matrix`) | The bot's access token (a secret). |
| `MATRIX_ROOM_ID` | (required for `matrix`) | The room's id, such as `!abc:example.org`; the bot must be a member. |

## Run it

```sh
API_URL=http://localhost:8000 uv run python -m app   # the image runs python -m app; Ctrl-C stops it
```

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
The one runtime package is [websockets](https://websockets.readthedocs.io/), for
obs-websocket; everything else is the standard library.

## Layout

- `app/worker.py` is the worker: `main`, the `[project.scripts]` entry point in
  `pyproject.toml`, reads the settings, sets up logging and the SIGTERM and SIGINT
  handlers, makes the clients (`connections`) and calls `run`, which does a round, then
  waits, until a stop is asked. Tests call `run` with a fake `Stop`, and one sends a real
  SIGTERM.
- `app/config.py` reads the settings; `app/backoff.py` holds the waits.
- `app/live.py` is the decision, with no network: what OBS and Ableton do on an advance.
- `app/follower.py` follows live mode with it, drives the devices and reports them.
- `app/obs.py` speaks obs-websocket 5; `app/osc.py` encodes OSC; `app/ableton.py` sends
  a song's load and tempo.
- `app/api.py` calls the api over `app/http_client.py`; `app/records.py` parses what it
  answers.
- `app/chat.py` holds the chat adapters; `app/outbox.py` delivers the due notifications.
- `app/__main__.py` runs it as `python -m app`.
- `tests/` holds the pytest tests, one file per module, with fakes of OBS, the api, the
  homeserver and the UDP socket: no test touches the network.

Read `AGENTS.md` before changing anything: it is the rulebook, for people and agents.
