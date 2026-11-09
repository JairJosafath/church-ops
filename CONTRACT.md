# church-ops v0.1: the HTTP contract between web, api and integrations-worker

The api serves JSON over HTTP, with snake_case keys. Every route but
`/healthz` and `/readyz` sits behind the scaffold's bearer check
(`app/auth.py`). Locally it runs with `AUTH_DISABLED=true`. Times are ISO 8601
with a UTC offset. Dates are `YYYY-MM-DD`. Lengths are whole seconds. Ids
are integers. Errors follow FastAPI's shape, `{"detail": "..."}`:

- 404: the thing is missing;
- 409: the request conflicts with the state;
- 422: the input is invalid.

The web app calls the api under the prefix `/api` (its dev and preview servers
proxy `/api/*` to the api with the prefix stripped). The worker calls it at
`API_URL`.

The domain guides (`docs/agents/domain/church-ops/`) decide the behaviour.
Each choice below names the topic it comes from.

## Records

```
Person      {id, name, email: str|null}
Team        {id, name, positions: [Position]}
Position    {id, team_id, name}
Song        {id, title, authors: str, ccli: str|null, arrangements: [Arrangement]}
Arrangement {id, song_id, name, key: str, tempo_bpm: int, meter: str,
             length_seconds: int, sequence: str, chart: str}
             key is a key name such as "G", "Bb", "F#m" (1-3 chars, A-G then optional #/b then optional m)
             tempo_bpm 20..300, meter like "4/4" or "6/8"
             sequence e.g. "V1 C V2 C B C"; chart is chords-over-lyrics text
ItemKind    "song" | "reading" | "sermon" | "prayer" | "video" | "announcement" | "header"
Item        {id, service_id, position: int (0-based, contiguous), kind, title,
             length_seconds, starts_at (computed: service.starts_at + sum of the
             lengths before it), arrangement: ItemArrangement|null, key: str|null
             (the item's own key; null = the arrangement's), scene: str|null
             (OBS scene name), lower_third: str|null, off_stream: bool, notes: str}
ItemArrangement {id, song_title, name, key (the effective key: item.key or
             the arrangement's), tempo_bpm, meter, sequence, chart}
Service     {id, title, service_type: str, starts_at, streamed: bool,
             auto_switch: bool, items: [Item], ends_at (computed),
             requests: [Request]}
ServiceSummary {id, title, service_type, starts_at, ends_at, item_count}
RequestStatus "pending" | "accepted" | "declined" | "cancelled"
Request     {id, service_id, service_title, service_starts_at, position: Position,
             team_name, person: Person, status, blocked: bool, created_at,
             answered_at: str|null}
Blockout    {id, person_id, starts_on, ends_on, reason: str}
Devices     {obs: DeviceState, ableton: DeviceState, updated_at: str|null}
DeviceState "ok" | "unreachable" | "unconfigured" | "unknown"
LiveState   {service_id, service_title, auto_switch: bool, streamed: bool,
             current_index: int, version: int, controller: Person,
             current: Item|null, next: Item|null, devices: Devices}
Notification {id, person: Person, kind: "request"|"reminder"|"cancellation"|"change",
             text: str, due_at, sent_at: str|null}
```

Item kinds: songs need an `arrangement_id`. Any other kind must not have
one (422). Items with kind `sermon`, `prayer` or `video` that name pastoral
content default to `off_stream: false`. Off-stream is set on purpose, and the
holding scene is the worker's to choose (streaming-and-obs).

## Routes

People, teams, songs:

- `GET /people` → [Person] sorted by name; `POST /people` {name, email?} → 201 Person
- `GET /teams` → [Team]; `POST /teams` {name} → 201 Team;
  `POST /teams/{team_id}/positions` {name} → 201 Position
- `GET /songs` → [Song] sorted by title; `POST /songs` {title, authors?, ccli?} → 201 Song;
  `GET /songs/{song_id}` → Song;
  `POST /songs/{song_id}/arrangements` {name, key, tempo_bpm, meter?="4/4",
  length_seconds, sequence?="", chart?=""} → 201 Arrangement

Services and their order (services-and-planning: items have lengths, and the
clock is computed from the start time):

- `GET /services` → [ServiceSummary], by starts_at ascending (`?from=YYYY-MM-DD` to start from a date)
- `POST /services` {title, service_type, starts_at, streamed?=true} → 201 Service
- `POST /services/{id}/copy` {starts_at, title?} → 201 Service: a copy of its
  items, with no link back and no requests
- `GET /services/{id}` → Service; `PATCH /services/{id}` {title?, starts_at?, streamed?, auto_switch?} → Service
- `POST /services/{id}/items` {kind, title, length_seconds, arrangement_id?,
  key?, scene?, lower_third?, off_stream?=false, notes?=""} → 201 Item (appended)
- `PATCH /services/{id}/items/{item_id}` (same fields, all optional; `key`
  and `arrangement_id` may be set to null) → Item
- `DELETE /services/{id}/items/{item_id}` → 204 (positions close up)
- `PUT /services/{id}/items/order` {item_ids: [ids]} → [Item]. The list
  must name every item of the service exactly once (else 422).

Scheduling (people-and-teams: a request is an invitation; only an accepted
one schedules; a blockout is the person's word; the scheduler may still send
a request that names the blockout, and the person decides):

- `POST /services/{id}/requests` {position_id, person_id} → 201 Request.
  `blocked` is true when the service's date falls inside one of the person's
  blockouts. It also queues a `request` Notification due now. If a
  pending or accepted request already exists for that person, service and
  position, the answer is 409.
- `GET /requests?person_id=&service_id=&status=` → [Request], newest first
- `POST /requests/{id}/answer` {accept: bool} → Request. A request that is no
  longer pending gives 409. Accepting queues two `reminder` Notifications,
  due 7 days and 1 day before the service (only those still in the future).
- `POST /requests/{id}/cancel` → Request: status `cancelled`, and a
  `cancellation` Notification due now, which always goes (chat-and-notifications).
  Its pending reminders are dropped.
- `GET /people/{id}/blockouts` → [Blockout]; `POST /people/{id}/blockouts`
  {starts_on, ends_on, reason?=""} → 201. ends_on before starts_on gives 422.
  `DELETE /blockouts/{id}` → 204.

Live mode (services-and-planning: one named person per service holds live
control, it can be handed over explicitly, and everyone else follows):

- `POST /services/{id}/live` {controller_id} → 201 LiveState, current_index
  0, version 1. 409 if the service is already live or has no items.
- `GET /services/{id}/live` → LiveState (404 when not live)
- `POST /services/{id}/live/advance` {person_id, to_index} → LiveState.
  Moving to a new index bumps version. 409 when person_id is not the
  controller (detail says who holds control); 422 when to_index is out of range.
- `POST /services/{id}/live/handover` {from_person_id, to_person_id} →
  LiveState. 409 unless from is the controller. version is unchanged, since
  the item didn't move.
- `PUT /services/{id}/live/devices` {obs: DeviceState, ableton: DeviceState} →
  LiveState. The worker reports here.
- `DELETE /services/{id}/live` → 204, which ends live mode.
- `GET /live` → [LiveState] for every service in live mode (the worker polls this)

Notifications (the worker delivers them):

- `GET /notifications/due?limit=50` → [Notification] with due_at ≤ now and
  sent_at null, oldest first
- `POST /notifications/{id}/sent` → Notification. 409 if it was already sent.

## What the worker does with LiveState (sound-and-ableton, streaming-and-obs)

The worker acts only when a service's `version` changes (an item advance),
never on plan edits:

- **OBS** (obs-websocket v5 at `OBS_URL`, password `OBS_PASSWORD`): with
  `auto_switch` on, it takes the current item's scene to program. If the
  current item is `off_stream`, or the service isn't streamed, it shows the
  holding scene `OBS_HOLDING_SCENE` (default "Holding"). With `auto_switch`
  off it only sets preview. Either way it sets preview to the next item's
  scene when there is a next item. It sets the text of the input
  `OBS_LOWER_THIRD_INPUT` (default "Lower third") to the current item's
  lower_third, or empty.
- **Ableton** (OSC over UDP at `ABLETON_OSC_HOST`:`ABLETON_OSC_PORT`, default
  11000): the song to load is the current item when it is a song, else the
  next item when that is a song. It sends `/live/song/set/tempo` with that
  song's tempo, and a `/church-ops/load` with title and key, once per advance.
  It never starts or stops the transport, and sends nothing on a plan edit.
  The band leader starts each song.
- Without `OBS_URL` or `ABLETON_OSC_HOST`, that side is `unconfigured`, and
  the worker logs what it would have sent. It reports the devices' state on
  every poll in which it reached or failed to reach them.
- **Chat**: each due Notification goes through the adapter
  `CHAT_ADAPTER` (`log`, the default, or `matrix`, with `MATRIX_HOMESERVER`,
  `MATRIX_ACCESS_TOKEN` and `MATRIX_ROOM_ID`). The adapter sends the
  m.room.message `"<person name>: <text>"` and then marks it sent. It
  never puts pastoral data in a chat.
