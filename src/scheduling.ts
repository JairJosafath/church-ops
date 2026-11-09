/**
 * Scheduling the team from the plan. A request is an invitation: the
 * scheduler sees each warning (a blockout and its reason, another request the
 * same day or at the same plan, a decline here) and may still ask; the person
 * answers, and only an accepted request schedules them.
 */
import type {
  Candidate,
  Need,
  Position,
  RequestStatus,
  ScheduleRequest,
  Service,
} from './api_types';
import type { NeededCount } from './api_client';
import { formatClock, formatServiceDate } from './dutch_time';

/** How a request's status reads to the team. */
export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  pending: 'Pending',
  accepted: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

/** A position at a plan: what the plan needs of it, and whom it asked. */
export interface PositionSlot {
  readonly position: Position;
  /** null when someone was asked but the plan does not list the position as needed. */
  readonly need: Need | null;
  /** The requests for it, in the api's order, but those the planner cancelled. */
  readonly requests: readonly ScheduleRequest[];
}

export interface TeamGroup {
  readonly teamName: string;
  readonly slots: readonly PositionSlot[];
}

/**
 * The plan's positions by team: the needed ones in the order the api gives,
 * then any other position someone was asked for, so no request disappears.
 */
export function teamGroups(service: Service): TeamGroup[] {
  const live = service.requests.filter((request) => request.status !== 'cancelled');
  const slots: { teamName: string; slot: PositionSlot }[] = service.needed.map((need) => ({
    teamName: need.teamName,
    slot: {
      position: need.position,
      need,
      requests: live.filter((request) => request.position.id === need.position.id),
    },
  }));
  for (const request of live) {
    if (!slots.some(({ slot }) => slot.position.id === request.position.id)) {
      slots.push({
        teamName: request.teamName,
        slot: {
          position: request.position,
          need: null,
          requests: live.filter((other) => other.position.id === request.position.id),
        },
      });
    }
  }
  const groups: { teamName: string; slots: PositionSlot[] }[] = [];
  for (const { teamName, slot } of slots) {
    const group = groups.find((candidate) => candidate.teamName === teamName);
    if (group === undefined) {
      groups.push({ teamName, slots: [slot] });
    } else {
      group.slots.push(slot);
    }
  }
  return groups;
}

/** How far a needed position is filled: "1 of 2 confirmed · 1 pending". */
export function needSummary(need: Need): string {
  return [
    `${String(need.accepted)} of ${String(need.count)} confirmed`,
    ...(need.pending > 0 ? [`${String(need.pending)} pending`] : []),
    ...(need.declined > 0 ? [`${String(need.declined)} declined`] : []),
  ].join(' · ');
}

/** The person's pending or accepted request for the position at the plan, if any. */
export function askedFor(
  service: Service,
  personId: number,
  positionId: number,
): ScheduleRequest | null {
  return (
    service.requests.find(
      (request) =>
        request.person.id === personId &&
        request.position.id === positionId &&
        (request.status === 'pending' || request.status === 'accepted'),
    ) ?? null
  );
}

export interface Badge {
  readonly label: string;
  readonly tone: 'warning' | 'error';
}

/**
 * The warnings about asking `candidate` for the position `positionId`. None
 * of them refuses: the scheduler weighs them, and the person decides.
 */
export function candidateBadges(candidate: Candidate, positionId: number): Badge[] {
  const status = (value: RequestStatus): string => REQUEST_STATUS_LABELS[value].toLowerCase();
  return [
    ...(candidate.blocked
      ? [
          {
            // Only that they are unavailable: the reason a person gives for a
            // blockout stays theirs (the owner's choice, people-and-teams).
            label: 'Blocked out',
            tone: 'error' as const,
          },
        ]
      : []),
    ...candidate.conflicts.map((conflict) => ({
      label: `Same day: ${conflict.positionName} at ${conflict.serviceTitle}, ${formatClock(conflict.startsAt)} (${status(conflict.status)})`,
      tone: 'warning' as const,
    })),
    ...candidate.alsoAsked
      .filter((other) => other.position.id !== positionId)
      .map((other) => ({
        label: `Also asked here: ${other.position.name} (${status(other.status)})`,
        tone: 'warning' as const,
      })),
    ...(candidate.declinedHere
      ? [{ label: 'Declined at this plan', tone: 'warning' as const }]
      : []),
  ];
}

/** How often the candidate served lately, so nobody is asked every week. */
export function servedText(candidate: Candidate): string {
  if (candidate.lastServedOn === null) {
    return 'Has not served yet';
  }
  const times = candidate.timesServed90Days;
  const recent =
    times === 0
      ? 'not in the last 90 days'
      : `${times === 1 ? 'once' : `${String(times)} times`} in 90 days`;
  return `Last served ${formatServiceDate(candidate.lastServedOn)} · ${recent}`;
}

/** The most people one position may need at one plan. */
export const MAX_COUNT = 99;

/** Reads a needed count as typed: blank is 0; null when it is no whole number to MAX_COUNT. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 0;
  }
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const count = Number(trimmed);
  return count > MAX_COUNT ? null : count;
}

/**
 * What to send to set the plan's needed positions to `counts` (position id to
 * count): every position wanted, a 0 for each one no longer needed, and the
 * plan's other needed positions as they are.
 */
export function neededChanges(
  needed: readonly Need[],
  counts: ReadonlyMap<number, number>,
): NeededCount[] {
  const wasNeeded = new Set(needed.map((need) => need.position.id));
  const changes = [...counts]
    .filter(([positionId, count]) => count > 0 || wasNeeded.has(positionId))
    .map(([positionId, count]) => ({ positionId, count }));
  const kept = needed
    .filter((need) => !counts.has(need.position.id))
    .map((need) => ({ positionId: need.position.id, count: need.count }));
  return [...changes, ...kept];
}
