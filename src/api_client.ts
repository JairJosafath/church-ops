/**
 * The one way the page talks to the api: a typed function per route of
 * CONTRACT.md, under the prefix `/api`. Requests are JSON in snake_case;
 * every answer is checked by a decoder before the page sees it.
 */
import {
  decodeArrangement,
  decodeBlockout,
  decodeCandidate,
  decodeItem,
  decodeLiveState,
  decodePerson,
  decodePosition,
  decodeScheduleRequest,
  decodeService,
  decodeServiceSummary,
  decodeSong,
  decodeTeam,
  type Arrangement,
  type Blockout,
  type Candidate,
  type Item,
  type ItemKind,
  type LiveState,
  type Person,
  type Position,
  type ScheduleRequest,
  type Service,
  type ServiceSummary,
  type Song,
  type Team,
  // v0.2 songs and plans
  decodePlanTime,
  decodeServiceType,
  decodeSongUsage,
  type PlanTime,
  type ServiceType,
  type SongUsage,
} from './api_types';
import { arrayOf, DecodeError, isRecord, type Decoder } from './decode';

/** An answer from the api that is not a success, with its `detail`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${String(status)}: ${detail}`);
    this.name = 'ApiError';
  }
}

/** `fetch`, or a stand-in for it in tests. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface NewService {
  readonly title: string;
  readonly serviceType: string;
  /** ISO 8601 with a UTC offset. */
  readonly startsAt: string;
  readonly streamed: boolean;
}

export interface ServiceCopy {
  readonly startsAt: string;
  /** The copy's title; null keeps the original's. */
  readonly title: string | null;
}

/** An item as the plan page edits it; null clears an optional field. */
export interface ItemInput {
  readonly kind: ItemKind;
  readonly title: string;
  readonly lengthSeconds: number;
  readonly arrangementId: number | null;
  readonly key: string | null;
  readonly scene: string | null;
  readonly lowerThird: string | null;
  readonly offStream: boolean;
  /** Left blank on a new song item, the api copies the notes of the last time it was planned. */
  readonly notes: string;
  // v0.2 songs and plans
  /** Who leads the song; songs only. */
  readonly songLeaderId: number | null;
  /** A note per team; an empty note removes that team's note. */
  readonly teamNotes: readonly TeamNoteInput[];
}

export interface NewSong {
  readonly title: string;
  readonly authors: string;
  readonly ccli: string | null;
  // v0.2 songs and plans
  readonly tags: readonly string[];
}

/** Every field of an arrangement, as PATCH takes it. */
export type ArrangementInput = Omit<Arrangement, 'id' | 'songId'>;

/** The fields POST takes for a new arrangement (v0.1); the rest are edited after. */
export type NewArrangement = Pick<
  ArrangementInput,
  'name' | 'key' | 'tempoBpm' | 'meter' | 'lengthSeconds' | 'sequence' | 'chart'
>;

export type NewBlockout = Omit<Blockout, 'id' | 'personId'>;

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

// v0.2 scheduling
/** How many people a plan needs in a position; a count of 0 removes the need. */
export interface NeededCount {
  readonly positionId: number;
  readonly count: number;
}

/** Every route of the api the page uses. */
export interface ApiClient {
  listPeople(signal?: AbortSignal): Promise<Person[]>;
  createPerson(name: string, email: string | null): Promise<Person>;
  listTeams(signal?: AbortSignal): Promise<Team[]>;
  createTeam(name: string): Promise<Team>;
  createPosition(teamId: number, name: string): Promise<Position>;
  listSongs(signal?: AbortSignal): Promise<Song[]>;
  createSong(song: NewSong): Promise<Song>;
  createArrangement(songId: number, arrangement: NewArrangement): Promise<Arrangement>;
  listServices(signal?: AbortSignal): Promise<ServiceSummary[]>;
  createService(service: NewService): Promise<Service>;
  copyService(serviceId: number, copy: ServiceCopy): Promise<Service>;
  getService(serviceId: number, signal?: AbortSignal): Promise<Service>;
  createItem(serviceId: number, item: ItemInput): Promise<Item>;
  updateItem(serviceId: number, itemId: number, item: ItemInput): Promise<Item>;
  deleteItem(serviceId: number, itemId: number): Promise<void>;
  reorderItems(serviceId: number, itemIds: readonly number[]): Promise<Item[]>;
  createRequest(serviceId: number, positionId: number, personId: number): Promise<ScheduleRequest>;
  listRequestsFor(personId: number, signal?: AbortSignal): Promise<ScheduleRequest[]>;
  answerRequest(requestId: number, accept: boolean): Promise<ScheduleRequest>;
  listBlockouts(personId: number, signal?: AbortSignal): Promise<Blockout[]>;
  createBlockout(personId: number, blockout: NewBlockout): Promise<Blockout>;
  deleteBlockout(blockoutId: number): Promise<void>;
  startLive(serviceId: number, controllerId: number): Promise<LiveState>;
  /** The service's live state, or null when it is not live. */
  getLive(serviceId: number, signal?: AbortSignal): Promise<LiveState | null>;
  advanceLive(serviceId: number, personId: number, toIndex: number): Promise<LiveState>;
  handOver(serviceId: number, fromPersonId: number, toPersonId: number): Promise<LiveState>;
  endLive(serviceId: number): Promise<void>;
  // v0.2 songs and plans
  getSong(songId: number, signal?: AbortSignal): Promise<Song>;
  /** The songs with `filter.tag` whose title or authors match `filter.query`. */
  findSongs(filter: SongFilter, signal?: AbortSignal): Promise<Song[]>;
  updateSong(songId: number, change: SongChange): Promise<Song>;
  updateArrangement(
    songId: number,
    arrangementId: number,
    arrangement: ArrangementInput,
  ): Promise<Arrangement>;
  /** How often each song was played between `from` and `to` ("YYYY-MM-DD"), most first. */
  songUsage(from: string, to: string, signal?: AbortSignal): Promise<SongUsage[]>;
  listServiceTypes(signal?: AbortSignal): Promise<ServiceType[]>;
  createServiceType(serviceType: ServiceTypeInput): Promise<ServiceType>;
  updateServiceType(serviceTypeId: number, serviceType: ServiceTypeInput): Promise<ServiceType>;
  /** Makes the plan's items and needed positions the type's template. */
  saveTemplateFromService(serviceTypeId: number, serviceId: number): Promise<ServiceType>;
  /** A new plan from its type's template, on a date, at the type's start time. */
  createServiceOfType(plan: NewServiceOfType): Promise<Service>;
  addRehearsal(serviceId: number, rehearsal: NewRehearsal): Promise<PlanTime>;
  removeTime(serviceId: number, timeId: number): Promise<void>;
  // v0.2 scheduling
  addPositionMember(positionId: number, personId: number): Promise<Position>;
  removePositionMember(positionId: number, personId: number): Promise<void>;
  setNeeded(serviceId: number, needed: readonly NeededCount[]): Promise<Service>;
  listCandidates(serviceId: number, positionId: number, signal?: AbortSignal): Promise<Candidate[]>;
  /** The services from `from` ("YYYY-MM-DD") on, by start. */
  listServicesFrom(from: string, signal?: AbortSignal): Promise<ServiceSummary[]>;
  /** Declines a pending request; `reason` "" gives none. */
  declineRequest(requestId: number, reason: string): Promise<ScheduleRequest>;
  /** Declines a request the person had accepted; `reason` "" gives none. */
  withdrawRequest(requestId: number, reason: string): Promise<ScheduleRequest>;
}

/** FastAPI's `detail`: a string, or for a 422 a list of `{msg}` per field. */
function detailOf(body: unknown, fallback: string): string {
  if (!isRecord(body)) {
    return fallback;
  }
  const detail = body['detail'];
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((entry: unknown) =>
      isRecord(entry) && typeof entry['msg'] === 'string' ? [entry['msg']] : [],
    );
    return messages.length > 0 ? messages.join('; ') : fallback;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    if (response.ok) {
      throw new DecodeError('response', 'JSON', { cause: error });
    }
    // An error page that is not JSON: the status says enough.
    return null;
  }
}

function itemBody(item: ItemInput, forCreate: boolean): Record<string, unknown> {
  const optional: Record<string, unknown> = {
    arrangement_id: item.arrangementId,
    key: item.key,
    scene: item.scene,
    lower_third: item.lowerThird,
    // v0.2 songs and plans: a song leader is for songs only, so another kind
    // never sends one.
    ...(item.kind === 'song' ? { song_leader_id: item.songLeaderId } : {}),
  };
  if (forCreate) {
    // A new item leaves out what it does not have (only a song names an
    // arrangement, and the api refuses one on any other kind). v0.2 songs and
    // plans: it leaves out blank notes too, so a new song item gets the notes
    // the team wrote the last time it was planned.
    const teamNotes = item.teamNotes.filter((entry) => entry.note !== '');
    return {
      kind: item.kind,
      title: item.title,
      length_seconds: item.lengthSeconds,
      off_stream: item.offStream,
      ...(item.notes === '' ? {} : { notes: item.notes }),
      ...(teamNotes.length === 0 ? {} : { team_notes: teamNotes.map(teamNoteBody) }),
      ...Object.fromEntries(Object.entries(optional).filter(([, value]) => value !== null)),
    };
  }
  // An edit sends null to clear a field, and an empty note to remove a team's note.
  return {
    kind: item.kind,
    title: item.title,
    length_seconds: item.lengthSeconds,
    off_stream: item.offStream,
    notes: item.notes,
    team_notes: item.teamNotes.map(teamNoteBody),
    ...optional,
  };
}

// v0.2 songs and plans

export interface TeamNoteInput {
  readonly teamId: number;
  readonly note: string;
}

export interface SongFilter {
  /** Only songs with this tag; null for every tag. */
  readonly tag: string | null;
  /** Words to search for; "" for all. */
  readonly query: string;
}

export interface SongChange {
  readonly title: string;
  readonly authors: string;
  readonly ccli: string | null;
  readonly tags: readonly string[];
}

export type ServiceTypeInput = Pick<ServiceType, 'name' | 'startTime' | 'rehearsalOffsetMinutes'>;

export interface NewServiceOfType {
  readonly serviceTypeId: number;
  readonly serviceTypeName: string;
  readonly title: string;
  /** "YYYY-MM-DD"; the plan starts at the type's start time that day. */
  readonly date: string;
  readonly series: string;
  readonly streamed: boolean;
}

export interface NewRehearsal {
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

function teamNoteBody(entry: TeamNoteInput): Record<string, unknown> {
  return { team_id: entry.teamId, note: entry.note };
}

function songQuery(filter: SongFilter): string {
  const params = new URLSearchParams();
  if (filter.tag !== null) {
    params.set('tag', filter.tag);
  }
  if (filter.query.trim() !== '') {
    params.set('q', filter.query.trim());
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

function serviceTypeBody(serviceType: ServiceTypeInput): Record<string, unknown> {
  return {
    name: serviceType.name,
    start_time: serviceType.startTime,
    rehearsal_offset_minutes: serviceType.rehearsalOffsetMinutes,
  };
}

/** A client of the api at `base`, which calls `fetchLike` for each request. */
export function createApiClient(fetchLike: FetchLike, base: string): ApiClient {
  async function send(
    method: Method,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const init: RequestInit =
      body === undefined
        ? { method, headers: { Accept: 'application/json' }, signal: signal ?? null }
        : {
            method,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: signal ?? null,
          };
    const response = await fetchLike(`${base}${path}`, init);
    const json = await readJson(response);
    if (!response.ok) {
      throw new ApiError(response.status, detailOf(json, response.statusText || 'Request failed'));
    }
    return json;
  }

  async function call<T>(
    decode: Decoder<T>,
    method: Method,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    return decode(await send(method, path, body, signal), `${method} ${path}`);
  }

  const service = (serviceId: number): string => `/services/${String(serviceId)}`;

  return {
    listPeople: (signal) => call(arrayOf(decodePerson), 'GET', '/people', undefined, signal),
    createPerson: (name, email) =>
      call(decodePerson, 'POST', '/people', email === null ? { name } : { name, email }),
    listTeams: (signal) => call(arrayOf(decodeTeam), 'GET', '/teams', undefined, signal),
    createTeam: (name) => call(decodeTeam, 'POST', '/teams', { name }),
    createPosition: (teamId, name) =>
      call(decodePosition, 'POST', `/teams/${String(teamId)}/positions`, { name }),
    listSongs: (signal) => call(arrayOf(decodeSong), 'GET', '/songs', undefined, signal),
    createSong: (song) =>
      call(decodeSong, 'POST', '/songs', {
        title: song.title,
        authors: song.authors,
        ...(song.ccli === null ? {} : { ccli: song.ccli }),
        // v0.2 songs and plans: sent only when there are tags, as a v0.1 api takes none.
        ...(song.tags.length === 0 ? {} : { tags: song.tags }),
      }),
    createArrangement: (songId, arrangement) =>
      call(decodeArrangement, 'POST', `/songs/${String(songId)}/arrangements`, {
        name: arrangement.name,
        key: arrangement.key,
        tempo_bpm: arrangement.tempoBpm,
        meter: arrangement.meter,
        length_seconds: arrangement.lengthSeconds,
        sequence: arrangement.sequence,
        chart: arrangement.chart,
      }),
    listServices: (signal) =>
      call(arrayOf(decodeServiceSummary), 'GET', '/services', undefined, signal),
    createService: (newService) =>
      call(decodeService, 'POST', '/services', {
        title: newService.title,
        service_type: newService.serviceType,
        starts_at: newService.startsAt,
        streamed: newService.streamed,
      }),
    copyService: (serviceId, copy) =>
      call(decodeService, 'POST', `${service(serviceId)}/copy`, {
        starts_at: copy.startsAt,
        ...(copy.title === null ? {} : { title: copy.title }),
      }),
    getService: (serviceId, signal) =>
      call(decodeService, 'GET', service(serviceId), undefined, signal),
    createItem: (serviceId, item) =>
      call(decodeItem, 'POST', `${service(serviceId)}/items`, itemBody(item, true)),
    updateItem: (serviceId, itemId, item) =>
      call(
        decodeItem,
        'PATCH',
        `${service(serviceId)}/items/${String(itemId)}`,
        itemBody(item, false),
      ),
    deleteItem: async (serviceId, itemId) => {
      await send('DELETE', `${service(serviceId)}/items/${String(itemId)}`);
    },
    reorderItems: (serviceId, itemIds) =>
      call(arrayOf(decodeItem), 'PUT', `${service(serviceId)}/items/order`, { item_ids: itemIds }),
    createRequest: (serviceId, positionId, personId) =>
      call(decodeScheduleRequest, 'POST', `${service(serviceId)}/requests`, {
        position_id: positionId,
        person_id: personId,
      }),
    listRequestsFor: (personId, signal) =>
      call(
        arrayOf(decodeScheduleRequest),
        'GET',
        `/requests?person_id=${String(personId)}`,
        undefined,
        signal,
      ),
    answerRequest: (requestId, accept) =>
      call(decodeScheduleRequest, 'POST', `/requests/${String(requestId)}/answer`, { accept }),
    listBlockouts: (personId, signal) =>
      call(
        arrayOf(decodeBlockout),
        'GET',
        `/people/${String(personId)}/blockouts`,
        undefined,
        signal,
      ),
    createBlockout: (personId, blockout) =>
      call(decodeBlockout, 'POST', `/people/${String(personId)}/blockouts`, {
        starts_on: blockout.startsOn,
        ends_on: blockout.endsOn,
        reason: blockout.reason,
      }),
    deleteBlockout: async (blockoutId) => {
      await send('DELETE', `/blockouts/${String(blockoutId)}`);
    },
    startLive: (serviceId, controllerId) =>
      call(decodeLiveState, 'POST', `${service(serviceId)}/live`, { controller_id: controllerId }),
    getLive: async (serviceId, signal) => {
      try {
        return await call(decodeLiveState, 'GET', `${service(serviceId)}/live`, undefined, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    advanceLive: (serviceId, personId, toIndex) =>
      call(decodeLiveState, 'POST', `${service(serviceId)}/live/advance`, {
        person_id: personId,
        to_index: toIndex,
      }),
    handOver: (serviceId, fromPersonId, toPersonId) =>
      call(decodeLiveState, 'POST', `${service(serviceId)}/live/handover`, {
        from_person_id: fromPersonId,
        to_person_id: toPersonId,
      }),
    endLive: async (serviceId) => {
      await send('DELETE', `${service(serviceId)}/live`);
    },
    // v0.2 songs and plans
    getSong: (songId, signal) =>
      call(decodeSong, 'GET', `/songs/${String(songId)}`, undefined, signal),
    findSongs: (filter, signal) =>
      call(arrayOf(decodeSong), 'GET', `/songs${songQuery(filter)}`, undefined, signal),
    updateSong: (songId, change) =>
      call(decodeSong, 'PATCH', `/songs/${String(songId)}`, {
        title: change.title,
        authors: change.authors,
        ccli: change.ccli,
        tags: change.tags,
      }),
    updateArrangement: (songId, arrangementId, arrangement) =>
      call(
        decodeArrangement,
        'PATCH',
        `/songs/${String(songId)}/arrangements/${String(arrangementId)}`,
        {
          name: arrangement.name,
          key: arrangement.key,
          tempo_bpm: arrangement.tempoBpm,
          meter: arrangement.meter,
          length_seconds: arrangement.lengthSeconds,
          sequence: arrangement.sequence,
          chart: arrangement.chart,
          keys: arrangement.keys,
          notes: arrangement.notes,
          audio_url: arrangement.audioUrl,
        },
      ),
    songUsage: (from, to, signal) =>
      call(
        arrayOf(decodeSongUsage),
        'GET',
        `/reports/song-usage?${new URLSearchParams({ from, to }).toString()}`,
        undefined,
        signal,
      ),
    listServiceTypes: (signal) =>
      call(arrayOf(decodeServiceType), 'GET', '/service-types', undefined, signal),
    createServiceType: (serviceType) =>
      call(decodeServiceType, 'POST', '/service-types', serviceTypeBody(serviceType)),
    updateServiceType: (serviceTypeId, serviceType) =>
      call(
        decodeServiceType,
        'PATCH',
        `/service-types/${String(serviceTypeId)}`,
        serviceTypeBody(serviceType),
      ),
    saveTemplateFromService: (serviceTypeId, serviceId) =>
      call(
        decodeServiceType,
        'POST',
        `/service-types/${String(serviceTypeId)}/template/from-service`,
        { service_id: serviceId },
      ),
    createServiceOfType: (plan) =>
      call(decodeService, 'POST', '/services', {
        title: plan.title,
        service_type: plan.serviceTypeName,
        service_type_id: plan.serviceTypeId,
        date: plan.date,
        series: plan.series,
        streamed: plan.streamed,
      }),
    addRehearsal: (serviceId, rehearsal) =>
      call(decodePlanTime, 'POST', `${service(serviceId)}/times`, {
        kind: 'rehearsal',
        name: rehearsal.name,
        starts_at: rehearsal.startsAt,
        ends_at: rehearsal.endsAt,
      }),
    removeTime: async (serviceId, timeId) => {
      await send('DELETE', `${service(serviceId)}/times/${String(timeId)}`);
    },
    // v0.2 scheduling
    addPositionMember: (positionId, personId) =>
      call(decodePosition, 'POST', `/positions/${String(positionId)}/members`, {
        person_id: personId,
      }),
    removePositionMember: async (positionId, personId) => {
      await send('DELETE', `/positions/${String(positionId)}/members/${String(personId)}`);
    },
    setNeeded: (serviceId, needed) =>
      call(decodeService, 'PUT', `${service(serviceId)}/needed`, {
        needed: needed.map((need) => ({ position_id: need.positionId, count: need.count })),
      }),
    listCandidates: (serviceId, positionId, signal) =>
      call(
        arrayOf(decodeCandidate),
        'GET',
        `${service(serviceId)}/candidates?position_id=${String(positionId)}`,
        undefined,
        signal,
      ),
    listServicesFrom: (from, signal) =>
      call(
        arrayOf(decodeServiceSummary),
        'GET',
        `/services?from=${encodeURIComponent(from)}`,
        undefined,
        signal,
      ),
    declineRequest: (requestId, reason) =>
      call(decodeScheduleRequest, 'POST', `/requests/${String(requestId)}/answer`, {
        accept: false,
        ...(reason === '' ? {} : { reason }),
      }),
    withdrawRequest: (requestId, reason) =>
      call(
        decodeScheduleRequest,
        'POST',
        `/requests/${String(requestId)}/withdraw`,
        reason === '' ? {} : { reason },
      ),
  };
}

/** The page's client, through the dev and preview servers' `/api` proxy. */
export const api: ApiClient = createApiClient((url, init) => fetch(url, init), '/api');

/** Whether `error` is a request the page itself aborted. */
export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** What a user reads when a request failed: what happened and what to do. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return `The server failed (${String(error.status)}). Try again in a moment.`;
    }
    switch (error.status) {
      case 404:
        return `${error.detail}. It may have been removed: reload the page.`;
      case 422:
        return `The server refused this: ${error.detail}. Correct it and try again.`;
      default:
        return error.detail;
    }
  }
  if (error instanceof DecodeError) {
    return `The server answered in a shape this page does not understand (${error.path}). Reload the page; if it keeps happening, the page and the api are out of step.`;
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Try again.';
}
