/**
 * The api's records (CONTRACT.md), as the page uses them: camelCase, read
 * only, and checked field by field when they arrive.
 */
import {
  arrayOf,
  decodeBoolean,
  decodeInteger,
  decodeObject,
  decodeString,
  field,
  fieldOr,
  nullable,
  oneOf,
} from './decode';

export interface Person {
  readonly id: number;
  readonly name: string;
  readonly email: string | null;
}

export interface Position {
  readonly id: number;
  readonly teamId: number;
  readonly name: string;
  // v0.2 scheduling
  /** The people who can fill it. */
  readonly memberIds: readonly number[];
}

export interface Team {
  readonly id: number;
  readonly name: string;
  readonly positions: readonly Position[];
}

export interface Arrangement {
  readonly id: number;
  readonly songId: number;
  readonly name: string;
  /** The arrangement's default key. */
  readonly key: string;
  readonly tempoBpm: number;
  readonly meter: string;
  readonly lengthSeconds: number;
  readonly sequence: string;
  /** ChordPro, written in the default key. */
  readonly chart: string;
  // v0.2 songs and plans
  /** The keys the team plays it in, the default key first. */
  readonly keys: readonly string[];
  readonly notes: string;
  /** A link to a reference recording. */
  readonly audioUrl: string | null;
}

export interface Song {
  readonly id: number;
  readonly title: string;
  readonly authors: string;
  readonly ccli: string | null;
  readonly arrangements: readonly Arrangement[];
  // v0.2 songs and plans
  readonly tags: readonly string[];
  /** "YYYY-MM-DD", or null when no service has played it. */
  readonly lastScheduledOn: string | null;
  readonly timesUsed12Months: number;
}

export const ITEM_KINDS = [
  'song',
  'reading',
  'sermon',
  'prayer',
  'video',
  'announcement',
  'header',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

/** The arrangement a song item plays, with the key it is played in. */
export interface ItemArrangement {
  readonly id: number;
  readonly songTitle: string;
  readonly name: string;
  /** The effective key: the item's own, else the arrangement's. */
  readonly key: string;
  readonly tempoBpm: number;
  readonly meter: string;
  readonly sequence: string;
  readonly chart: string;
}

export interface Item {
  readonly id: number;
  readonly serviceId: number;
  readonly position: number;
  readonly kind: ItemKind;
  readonly title: string;
  readonly lengthSeconds: number;
  readonly startsAt: string;
  readonly arrangement: ItemArrangement | null;
  /** The item's own key; null plays the arrangement's. */
  readonly key: string | null;
  readonly scene: string | null;
  readonly lowerThird: string | null;
  readonly offStream: boolean;
  readonly notes: string;
  // v0.2 songs and plans
  /** Who leads the song; songs only. */
  readonly songLeader: Person | null;
  readonly teamNotes: readonly TeamNote[];
}

export const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** An invitation to fill a position at a service; only an accepted one schedules. */
export interface ScheduleRequest {
  readonly id: number;
  readonly serviceId: number;
  readonly serviceTitle: string;
  readonly serviceStartsAt: string;
  readonly position: Position;
  readonly teamName: string;
  readonly person: Person;
  readonly status: RequestStatus;
  /** Whether the service's date is inside one of the person's blockouts. */
  readonly blocked: boolean;
  readonly createdAt: string;
  readonly answeredAt: string | null;
  // v0.2 scheduling
  /** The person's other pending or accepted requests at the same service. */
  readonly alsoAsked: readonly AlsoAsked[];
  /** Why the person declined; "" when they gave no reason. */
  readonly declineReason: string;
}

export interface Service {
  readonly id: number;
  readonly title: string;
  readonly serviceType: string;
  readonly startsAt: string;
  readonly streamed: boolean;
  readonly autoSwitch: boolean;
  readonly items: readonly Item[];
  readonly endsAt: string;
  readonly requests: readonly ScheduleRequest[];
  // v0.2 songs and plans
  readonly serviceTypeId: number | null;
  readonly series: string;
  /** Rehearsals and the service itself, by start. */
  readonly times: readonly PlanTime[];
  // v0.2 scheduling
  /** The positions the plan needs filled, with how far each is filled. */
  readonly needed: readonly Need[];
}

export interface ServiceSummary {
  readonly id: number;
  readonly title: string;
  readonly serviceType: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly itemCount: number;
  // v0.2 songs and plans
  readonly serviceTypeId: number | null;
  readonly series: string;
}

export interface Blockout {
  readonly id: number;
  readonly personId: number;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly reason: string;
}

export const DEVICE_STATES = ['ok', 'unreachable', 'unconfigured', 'unknown'] as const;

export type DeviceState = (typeof DEVICE_STATES)[number];

export interface Devices {
  readonly obs: DeviceState;
  readonly ableton: DeviceState;
  readonly updatedAt: string | null;
}

/** A service in live mode: its current item, who controls it, and the devices. */
export interface LiveState {
  readonly serviceId: number;
  readonly serviceTitle: string;
  readonly autoSwitch: boolean;
  readonly streamed: boolean;
  readonly currentIndex: number;
  readonly version: number;
  readonly controller: Person;
  readonly current: Item | null;
  readonly next: Item | null;
  readonly devices: Devices;
  // v0.2 scheduling
  /** When the current item became current; null from an api that does not say. */
  readonly itemStartedAt: string | null;
}

const decodeNullableString = nullable(decodeString);

export function decodePerson(value: unknown, path: string): Person {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    name: field(o, 'name', decodeString, path),
    email: field(o, 'email', decodeNullableString, path),
  };
}

export function decodePosition(value: unknown, path: string): Position {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    teamId: field(o, 'team_id', decodeInteger, path),
    name: field(o, 'name', decodeString, path),
    // v0.2 scheduling: new in v0.2, so an older api's missing field reads as nobody.
    memberIds: fieldOr(o, 'member_ids', arrayOf(decodeInteger), [], path),
  };
}

export function decodeTeam(value: unknown, path: string): Team {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    name: field(o, 'name', decodeString, path),
    positions: field(o, 'positions', arrayOf(decodePosition), path),
  };
}

export function decodeArrangement(value: unknown, path: string): Arrangement {
  const o = decodeObject(value, path);
  const key = field(o, 'key', decodeString, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    songId: field(o, 'song_id', decodeInteger, path),
    name: field(o, 'name', decodeString, path),
    key,
    tempoBpm: field(o, 'tempo_bpm', decodeInteger, path),
    meter: field(o, 'meter', decodeString, path),
    lengthSeconds: field(o, 'length_seconds', decodeInteger, path),
    sequence: field(o, 'sequence', decodeString, path),
    chart: field(o, 'chart', decodeString, path),
    // v0.2 songs and plans: new in the contract, so read leniently. Missing,
    // the keys are the default key alone, there are no notes and no recording.
    keys: fieldOr(o, 'keys', arrayOf(decodeString), [key], path),
    notes: fieldOr(o, 'notes', decodeString, '', path),
    audioUrl: fieldOr(o, 'audio_url', decodeNullableString, null, path),
  };
}

export function decodeSong(value: unknown, path: string): Song {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    title: field(o, 'title', decodeString, path),
    authors: field(o, 'authors', decodeString, path),
    ccli: field(o, 'ccli', decodeNullableString, path),
    arrangements: field(o, 'arrangements', arrayOf(decodeArrangement), path),
    // v0.2 songs and plans: new in the contract, so read leniently. Missing,
    // the song has no tags and has never been scheduled.
    tags: fieldOr(o, 'tags', arrayOf(decodeString), [], path),
    lastScheduledOn: fieldOr(o, 'last_scheduled_on', decodeNullableString, null, path),
    timesUsed12Months: fieldOr(o, 'times_used_12_months', decodeInteger, 0, path),
  };
}

function decodeItemArrangement(value: unknown, path: string): ItemArrangement {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    songTitle: field(o, 'song_title', decodeString, path),
    name: field(o, 'name', decodeString, path),
    key: field(o, 'key', decodeString, path),
    tempoBpm: field(o, 'tempo_bpm', decodeInteger, path),
    meter: field(o, 'meter', decodeString, path),
    sequence: field(o, 'sequence', decodeString, path),
    chart: field(o, 'chart', decodeString, path),
  };
}

export function decodeItem(value: unknown, path: string): Item {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    serviceId: field(o, 'service_id', decodeInteger, path),
    position: field(o, 'position', decodeInteger, path),
    kind: field(o, 'kind', oneOf(ITEM_KINDS), path),
    title: field(o, 'title', decodeString, path),
    lengthSeconds: field(o, 'length_seconds', decodeInteger, path),
    startsAt: field(o, 'starts_at', decodeString, path),
    arrangement: field(o, 'arrangement', nullable(decodeItemArrangement), path),
    key: field(o, 'key', decodeNullableString, path),
    scene: field(o, 'scene', decodeNullableString, path),
    lowerThird: field(o, 'lower_third', decodeNullableString, path),
    offStream: field(o, 'off_stream', decodeBoolean, path),
    notes: field(o, 'notes', decodeString, path),
    // v0.2 songs and plans: new in the contract, so read leniently. Missing,
    // nobody leads the song and no team has a note.
    songLeader: fieldOr(o, 'song_leader', nullable(decodePerson), null, path),
    teamNotes: fieldOr(o, 'team_notes', arrayOf(decodeTeamNote), [], path),
  };
}

export function decodeScheduleRequest(value: unknown, path: string): ScheduleRequest {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    serviceId: field(o, 'service_id', decodeInteger, path),
    serviceTitle: field(o, 'service_title', decodeString, path),
    serviceStartsAt: field(o, 'service_starts_at', decodeString, path),
    position: field(o, 'position', decodePosition, path),
    teamName: field(o, 'team_name', decodeString, path),
    person: field(o, 'person', decodePerson, path),
    status: field(o, 'status', oneOf(REQUEST_STATUSES), path),
    blocked: field(o, 'blocked', decodeBoolean, path),
    createdAt: field(o, 'created_at', decodeString, path),
    answeredAt: field(o, 'answered_at', decodeNullableString, path),
    // v0.2 scheduling: new in v0.2, so an older api's missing fields read as empty.
    alsoAsked: fieldOr(o, 'also_asked', arrayOf(decodeAlsoAsked), [], path),
    declineReason: fieldOr(o, 'decline_reason', decodeString, '', path),
  };
}

export function decodeService(value: unknown, path: string): Service {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    title: field(o, 'title', decodeString, path),
    serviceType: field(o, 'service_type', decodeString, path),
    startsAt: field(o, 'starts_at', decodeString, path),
    streamed: field(o, 'streamed', decodeBoolean, path),
    autoSwitch: field(o, 'auto_switch', decodeBoolean, path),
    items: field(o, 'items', arrayOf(decodeItem), path),
    endsAt: field(o, 'ends_at', decodeString, path),
    requests: field(o, 'requests', arrayOf(decodeScheduleRequest), path),
    // v0.2 songs and plans: new in the contract, so read leniently. Missing,
    // the plan has no type, no series and no times but its own (planTimes).
    serviceTypeId: fieldOr(o, 'service_type_id', nullable(decodeInteger), null, path),
    series: fieldOr(o, 'series', decodeString, '', path),
    times: fieldOr(o, 'times', arrayOf(decodePlanTime), [], path),
    // v0.2 scheduling: new in v0.2, so an older api's missing field reads as none needed.
    needed: fieldOr(o, 'needed', arrayOf(decodeNeed), [], path),
  };
}

export function decodeServiceSummary(value: unknown, path: string): ServiceSummary {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    title: field(o, 'title', decodeString, path),
    serviceType: field(o, 'service_type', decodeString, path),
    startsAt: field(o, 'starts_at', decodeString, path),
    endsAt: field(o, 'ends_at', decodeString, path),
    itemCount: field(o, 'item_count', decodeInteger, path),
    // v0.2 songs and plans: new in the contract, so read leniently.
    serviceTypeId: fieldOr(o, 'service_type_id', nullable(decodeInteger), null, path),
    series: fieldOr(o, 'series', decodeString, '', path),
  };
}

export function decodeBlockout(value: unknown, path: string): Blockout {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    personId: field(o, 'person_id', decodeInteger, path),
    startsOn: field(o, 'starts_on', decodeString, path),
    endsOn: field(o, 'ends_on', decodeString, path),
    reason: field(o, 'reason', decodeString, path),
  };
}

function decodeDevices(value: unknown, path: string): Devices {
  const o = decodeObject(value, path);
  return {
    obs: field(o, 'obs', oneOf(DEVICE_STATES), path),
    ableton: field(o, 'ableton', oneOf(DEVICE_STATES), path),
    updatedAt: field(o, 'updated_at', decodeNullableString, path),
  };
}

export function decodeLiveState(value: unknown, path: string): LiveState {
  const o = decodeObject(value, path);
  return {
    serviceId: field(o, 'service_id', decodeInteger, path),
    serviceTitle: field(o, 'service_title', decodeString, path),
    autoSwitch: field(o, 'auto_switch', decodeBoolean, path),
    streamed: field(o, 'streamed', decodeBoolean, path),
    currentIndex: field(o, 'current_index', decodeInteger, path),
    version: field(o, 'version', decodeInteger, path),
    controller: field(o, 'controller', decodePerson, path),
    current: field(o, 'current', nullable(decodeItem), path),
    next: field(o, 'next', nullable(decodeItem), path),
    devices: field(o, 'devices', decodeDevices, path),
    // v0.2 scheduling: new in v0.2, so an older api's missing field reads as unknown.
    itemStartedAt: fieldOr(o, 'item_started_at', decodeNullableString, null, path),
  };
}

// v0.2 scheduling

/** Another pending or accepted request of the same person at the same service. */
export interface AlsoAsked {
  readonly position: Position;
  readonly teamName: string;
  readonly status: RequestStatus;
}

/** A position a plan needs, and how far it is filled: open = count - accepted - pending. */
export interface Need {
  readonly position: Position;
  readonly teamName: string;
  readonly count: number;
  readonly accepted: number;
  readonly pending: number;
  readonly declined: number;
  readonly open: number;
}

/** A pending or accepted request of a candidate at another service on the same day. */
export interface Conflict {
  readonly serviceId: number;
  readonly serviceTitle: string;
  readonly startsAt: string;
  readonly teamName: string;
  readonly positionName: string;
  readonly status: RequestStatus;
}

/**
 * A member of a position, as the scheduler sees them when filling it at one
 * plan: the warnings to weigh, and how often they served. Warnings never
 * refuse; the scheduler decides and the person answers.
 */
export interface Candidate {
  readonly person: Person;
  /** Only whether they are blocked out: the reason stays the person's. */
  readonly blocked: boolean;
  readonly alsoAsked: readonly AlsoAsked[];
  readonly conflicts: readonly Conflict[];
  /** Whether the person declined a request at this plan. */
  readonly declinedHere: boolean;
  /** "YYYY-MM-DD", or null when they have not served. */
  readonly lastServedOn: string | null;
  readonly timesServed90Days: number;
}

function decodeAlsoAsked(value: unknown, path: string): AlsoAsked {
  const o = decodeObject(value, path);
  return {
    position: field(o, 'position', decodePosition, path),
    teamName: field(o, 'team_name', decodeString, path),
    status: field(o, 'status', oneOf(REQUEST_STATUSES), path),
  };
}

function decodeNeed(value: unknown, path: string): Need {
  const o = decodeObject(value, path);
  return {
    position: field(o, 'position', decodePosition, path),
    teamName: field(o, 'team_name', decodeString, path),
    count: field(o, 'count', decodeInteger, path),
    accepted: field(o, 'accepted', decodeInteger, path),
    pending: field(o, 'pending', decodeInteger, path),
    declined: field(o, 'declined', decodeInteger, path),
    open: field(o, 'open', decodeInteger, path),
  };
}

function decodeConflict(value: unknown, path: string): Conflict {
  const o = decodeObject(value, path);
  return {
    serviceId: field(o, 'service_id', decodeInteger, path),
    serviceTitle: field(o, 'service_title', decodeString, path),
    startsAt: field(o, 'starts_at', decodeString, path),
    teamName: field(o, 'team_name', decodeString, path),
    positionName: field(o, 'position_name', decodeString, path),
    status: field(o, 'status', oneOf(REQUEST_STATUSES), path),
  };
}

export function decodeCandidate(value: unknown, path: string): Candidate {
  const o = decodeObject(value, path);
  return {
    person: field(o, 'person', decodePerson, path),
    blocked: field(o, 'blocked', decodeBoolean, path),
    alsoAsked: field(o, 'also_asked', arrayOf(decodeAlsoAsked), path),
    conflicts: field(o, 'conflicts', arrayOf(decodeConflict), path),
    declinedHere: field(o, 'declined_here', decodeBoolean, path),
    lastServedOn: field(o, 'last_served_on', decodeNullableString, path),
    timesServed90Days: field(o, 'times_served_90_days', decodeInteger, path),
  };
}

// v0.2 songs and plans

/** A note on an item for one team: what the band, the vocals or the stream should know. */
export interface TeamNote {
  readonly teamId: number;
  readonly teamName: string;
  readonly note: string;
}

export const PLAN_TIME_KINDS = ['rehearsal', 'service'] as const;

export type PlanTimeKind = (typeof PLAN_TIME_KINDS)[number];

/** When the teams meet: a rehearsal, or the service itself (id 0, read only). */
export interface PlanTime {
  readonly id: number;
  readonly kind: PlanTimeKind;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

/** An item of a service type's template: what a new plan of that type starts with. */
export interface TemplateItem {
  readonly kind: ItemKind;
  readonly title: string;
  readonly lengthSeconds: number;
  readonly arrangementId: number | null;
  readonly key: string | null;
}

export interface NeededPosition {
  readonly positionId: number;
  readonly count: number;
}

export interface ServiceTemplate {
  readonly items: readonly TemplateItem[];
  readonly needed: readonly NeededPosition[];
}

/** A recurring kind of gathering, with its usual start, rehearsal and order. */
export interface ServiceType {
  readonly id: number;
  readonly name: string;
  /** "HH:MM", Dutch time. */
  readonly startTime: string;
  /** How long before the start the teams rehearse; null for no rehearsal. */
  readonly rehearsalOffsetMinutes: number | null;
  readonly template: ServiceTemplate;
}

/** How often a song was played in a date range, for the CCLI report. */
export interface SongUsage {
  readonly songId: number;
  readonly title: string;
  readonly authors: string;
  readonly ccli: string | null;
  readonly count: number;
}

function decodeTeamNote(value: unknown, path: string): TeamNote {
  const o = decodeObject(value, path);
  return {
    teamId: field(o, 'team_id', decodeInteger, path),
    teamName: field(o, 'team_name', decodeString, path),
    note: field(o, 'note', decodeString, path),
  };
}

export function decodePlanTime(value: unknown, path: string): PlanTime {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    kind: field(o, 'kind', oneOf(PLAN_TIME_KINDS), path),
    name: field(o, 'name', decodeString, path),
    startsAt: field(o, 'starts_at', decodeString, path),
    endsAt: field(o, 'ends_at', decodeString, path),
  };
}

function decodeTemplateItem(value: unknown, path: string): TemplateItem {
  const o = decodeObject(value, path);
  return {
    kind: field(o, 'kind', oneOf(ITEM_KINDS), path),
    title: field(o, 'title', decodeString, path),
    lengthSeconds: field(o, 'length_seconds', decodeInteger, path),
    arrangementId: field(o, 'arrangement_id', nullable(decodeInteger), path),
    key: field(o, 'key', decodeNullableString, path),
  };
}

function decodeNeededPosition(value: unknown, path: string): NeededPosition {
  const o = decodeObject(value, path);
  return {
    positionId: field(o, 'position_id', decodeInteger, path),
    count: field(o, 'count', decodeInteger, path),
  };
}

function decodeServiceTemplate(value: unknown, path: string): ServiceTemplate {
  const o = decodeObject(value, path);
  return {
    items: field(o, 'items', arrayOf(decodeTemplateItem), path),
    needed: field(o, 'needed', arrayOf(decodeNeededPosition), path),
  };
}

export function decodeServiceType(value: unknown, path: string): ServiceType {
  const o = decodeObject(value, path);
  return {
    id: field(o, 'id', decodeInteger, path),
    name: field(o, 'name', decodeString, path),
    startTime: field(o, 'start_time', decodeString, path),
    rehearsalOffsetMinutes: field(o, 'rehearsal_offset_minutes', nullable(decodeInteger), path),
    template: field(o, 'template', decodeServiceTemplate, path),
  };
}

export function decodeSongUsage(value: unknown, path: string): SongUsage {
  const o = decodeObject(value, path);
  return {
    songId: field(o, 'song_id', decodeInteger, path),
    title: field(o, 'title', decodeString, path),
    authors: field(o, 'authors', decodeString, path),
    ccli: field(o, 'ccli', decodeNullableString, path),
    count: field(o, 'count', decodeInteger, path),
  };
}
