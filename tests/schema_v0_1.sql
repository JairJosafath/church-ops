-- The schema v0.1 of the api made (app/postgres_store.py at v0.1), to test the upgrade.

CREATE TABLE IF NOT EXISTS people (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    email text
);

CREATE TABLE IF NOT EXISTS teams (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id bigint NOT NULL REFERENCES teams (id),
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS songs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    authors text NOT NULL,
    ccli text
);

CREATE TABLE IF NOT EXISTS arrangements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    song_id bigint NOT NULL REFERENCES songs (id),
    name text NOT NULL,
    key text NOT NULL,
    tempo_bpm integer NOT NULL,
    meter text NOT NULL,
    length_seconds integer NOT NULL,
    sequence text NOT NULL,
    chart text NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    service_type text NOT NULL,
    starts_at timestamptz NOT NULL,
    streamed boolean NOT NULL,
    auto_switch boolean NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id bigint NOT NULL REFERENCES services (id),
    position integer NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    length_seconds integer NOT NULL,
    arrangement_id bigint REFERENCES arrangements (id),
    key text,
    scene text,
    lower_third text,
    off_stream boolean NOT NULL,
    notes text NOT NULL
);

CREATE INDEX IF NOT EXISTS items_by_service ON items (service_id, position)
;

CREATE TABLE IF NOT EXISTS requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id bigint NOT NULL REFERENCES services (id),
    position_id bigint NOT NULL REFERENCES positions (id),
    person_id bigint NOT NULL REFERENCES people (id),
    status text NOT NULL,
    blocked boolean NOT NULL,
    created_at timestamptz NOT NULL,
    answered_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS requests_open
    ON requests (service_id, position_id, person_id)
    WHERE status IN ('pending', 'accepted');

CREATE TABLE IF NOT EXISTS blockouts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    person_id bigint NOT NULL REFERENCES people (id),
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    person_id bigint NOT NULL REFERENCES people (id),
    request_id bigint REFERENCES requests (id),
    kind text NOT NULL,
    text text NOT NULL,
    due_at timestamptz NOT NULL,
    sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS notifications_due ON notifications (due_at, id)
    WHERE sent_at IS NULL;

CREATE TABLE IF NOT EXISTS live (
    service_id bigint PRIMARY KEY REFERENCES services (id),
    controller_id bigint NOT NULL REFERENCES people (id),
    current_index integer NOT NULL,
    version integer NOT NULL,
    obs text NOT NULL,
    ableton text NOT NULL,
    devices_updated_at timestamptz
);
