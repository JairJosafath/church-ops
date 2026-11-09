/**
 * The api's JSON, as CONTRACT.md shapes it, for the tests. Each builder
 * takes overrides so a test states only what it is about.
 */

type Json = Record<string, unknown>;

export function personJson(overrides: Json = {}): Json {
  return { id: 1, name: 'Anna de Vries', email: null, ...overrides };
}

export function positionJson(overrides: Json = {}): Json {
  return { id: 10, team_id: 5, name: 'Drums', ...overrides };
}

export function teamJson(overrides: Json = {}): Json {
  return { id: 5, name: 'Worship band', positions: [positionJson()], ...overrides };
}

export function arrangementJson(overrides: Json = {}): Json {
  return {
    id: 7,
    song_id: 3,
    name: 'Default',
    key: 'G',
    tempo_bpm: 72,
    meter: '4/4',
    length_seconds: 300,
    sequence: 'V1 C V2 C B C',
    chart: '[G]Amazing grace',
    ...overrides,
  };
}

export function songJson(overrides: Json = {}): Json {
  return {
    id: 3,
    title: 'Amazing Grace',
    authors: 'John Newton',
    ccli: '22025',
    arrangements: [arrangementJson()],
    ...overrides,
  };
}

export function itemJson(overrides: Json = {}): Json {
  return {
    id: 100,
    service_id: 20,
    position: 0,
    kind: 'reading',
    title: 'Psalm 23',
    length_seconds: 180,
    starts_at: '2026-11-15T10:00:00+01:00',
    arrangement: null,
    key: null,
    scene: null,
    lower_third: null,
    off_stream: false,
    notes: '',
    ...overrides,
  };
}

export function songItemJson(overrides: Json = {}): Json {
  return itemJson({
    id: 101,
    kind: 'song',
    title: 'Amazing Grace',
    length_seconds: 300,
    arrangement: {
      id: 7,
      song_title: 'Amazing Grace',
      name: 'Default',
      key: 'Bb',
      tempo_bpm: 72,
      meter: '4/4',
      sequence: 'V1 C V2 C B C',
      chart: '[G]Amazing grace',
    },
    key: 'Bb',
    ...overrides,
  });
}

export function requestJson(overrides: Json = {}): Json {
  return {
    id: 50,
    service_id: 20,
    service_title: 'Sunday morning',
    service_starts_at: '2026-11-15T10:00:00+01:00',
    position: positionJson(),
    team_name: 'Worship band',
    person: personJson(),
    status: 'pending',
    blocked: false,
    created_at: '2026-11-01T12:00:00+01:00',
    answered_at: null,
    ...overrides,
  };
}

export function serviceJson(overrides: Json = {}): Json {
  return {
    id: 20,
    title: 'Sunday morning',
    service_type: 'Sunday morning',
    starts_at: '2026-11-15T10:00:00+01:00',
    streamed: true,
    auto_switch: false,
    items: [],
    ends_at: '2026-11-15T10:00:00+01:00',
    requests: [],
    ...overrides,
  };
}

export function serviceSummaryJson(overrides: Json = {}): Json {
  return {
    id: 20,
    title: 'Sunday morning',
    service_type: 'Sunday morning',
    starts_at: '2026-11-15T10:00:00+01:00',
    ends_at: '2026-11-15T11:15:00+01:00',
    item_count: 9,
    ...overrides,
  };
}

export function blockoutJson(overrides: Json = {}): Json {
  return {
    id: 60,
    person_id: 1,
    starts_on: '2026-11-15',
    ends_on: '2026-11-15',
    reason: 'Family visit',
    ...overrides,
  };
}

export function liveJson(overrides: Json = {}): Json {
  return {
    service_id: 20,
    service_title: 'Sunday morning',
    auto_switch: true,
    streamed: true,
    current_index: 0,
    version: 1,
    controller: personJson(),
    current: itemJson(),
    next: songItemJson({ position: 1, starts_at: '2026-11-15T10:03:00+01:00' }),
    devices: { obs: 'ok', ableton: 'unconfigured', updated_at: null },
    ...overrides,
  };
}

// v0.2 songs and plans

export function planTimeJson(overrides: Json = {}): Json {
  return {
    id: 31,
    kind: 'rehearsal',
    name: 'Band rehearsal',
    starts_at: '2026-11-12T19:30:00+01:00',
    ends_at: '2026-11-12T21:30:00+01:00',
    ...overrides,
  };
}

export function serviceTypeJson(overrides: Json = {}): Json {
  return {
    id: 4,
    name: 'Sunday morning',
    start_time: '10:00',
    rehearsal_offset_minutes: 90,
    template: {
      items: [
        {
          kind: 'header',
          title: 'Worship',
          length_seconds: 0,
          arrangement_id: null,
          key: null,
          scene: null,
          lower_third: null,
          off_stream: false,
          notes: '',
        },
        {
          kind: 'sermon',
          title: 'Sermon',
          length_seconds: 1800,
          arrangement_id: null,
          key: null,
          scene: 'Pulpit',
          lower_third: null,
          off_stream: false,
          notes: '',
        },
      ],
      needed: [{ position_id: 10, count: 1 }],
    },
    ...overrides,
  };
}

export function songUsageJson(overrides: Json = {}): Json {
  return {
    song_id: 3,
    title: 'Amazing Grace',
    authors: 'John Newton',
    ccli: '22025',
    count: 4,
    ...overrides,
  };
}

// v0.2 scheduling

export function needJson(overrides: Json = {}): Json {
  return {
    position: positionJson(),
    team_name: 'Worship band',
    count: 1,
    accepted: 0,
    pending: 0,
    declined: 0,
    open: 1,
    ...overrides,
  };
}

export function candidateJson(overrides: Json = {}): Json {
  return {
    person: personJson(),
    blocked: false,
    also_asked: [],
    conflicts: [],
    declined_here: false,
    last_served_on: null,
    times_served_90_days: 0,
    ...overrides,
  };
}
