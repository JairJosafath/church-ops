/**
 * The Matrix: many plans side by side against the positions, so a scheduler
 * can fill months ahead and see who serves when.
 */
import type { Need, Position, ScheduleRequest, Service } from './api_types';
import { REQUEST_STATUS_LABELS, teamGroups } from './scheduling';

export interface MatrixColumn {
  readonly serviceId: number;
  readonly title: string;
  readonly startsAt: string;
}

/** One position at one plan. */
export interface MatrixCell {
  readonly serviceId: number;
  /** null when the plan does not list the position as needed. */
  readonly need: Need | null;
  /** The requests for it at that plan, but those the planner cancelled. */
  readonly requests: readonly ScheduleRequest[];
  readonly open: number;
}

export interface MatrixRow {
  readonly position: Position;
  readonly cells: readonly MatrixCell[];
}

export interface MatrixTeam {
  readonly teamName: string;
  readonly rows: readonly MatrixRow[];
}

export interface Matrix {
  readonly columns: readonly MatrixColumn[];
  readonly teams: readonly MatrixTeam[];
}

const byName = new Intl.Collator('nl', { sensitivity: 'base' });

/**
 * The plans across, in the order given, and down every position any of them
 * needs or asked someone for, by team and then position, in name order.
 */
export function scheduleMatrix(plans: readonly Service[]): Matrix {
  const slotsByPlan = plans.map((plan) => ({
    plan,
    slots: teamGroups(plan).flatMap((group) =>
      group.slots.map((slot) => ({ teamName: group.teamName, slot })),
    ),
  }));
  const positions = new Map<number, { teamName: string; position: Position }>();
  for (const { slots } of slotsByPlan) {
    for (const { teamName, slot } of slots) {
      if (!positions.has(slot.position.id)) {
        positions.set(slot.position.id, { teamName, position: slot.position });
      }
    }
  }
  const teamNames = [...new Set([...positions.values()].map(({ teamName }) => teamName))].sort(
    byName.compare,
  );
  return {
    columns: plans.map((plan) => ({
      serviceId: plan.id,
      title: plan.title,
      startsAt: plan.startsAt,
    })),
    teams: teamNames.map((teamName) => ({
      teamName,
      rows: [...positions.values()]
        .filter((entry) => entry.teamName === teamName)
        .map(({ position }) => position)
        .sort((a, b) => byName.compare(a.name, b.name))
        .map((position) => ({
          position,
          cells: slotsByPlan.map(({ plan, slots }) => {
            const slot = slots.find((entry) => entry.slot.position.id === position.id)?.slot;
            return {
              serviceId: plan.id,
              need: slot?.need ?? null,
              requests: slot?.requests ?? [],
              open: slot?.need?.open ?? 0,
            };
          }),
        })),
    })),
  };
}

/** What a cell holds, in words: "Anna de Vries (confirmed), 1 open", or "Not needed". */
export function cellSummary(cell: MatrixCell): string {
  const parts = [
    ...cell.requests.map(
      (request) =>
        `${request.person.name} (${REQUEST_STATUS_LABELS[request.status].toLowerCase()})`,
    ),
    ...(cell.open > 0 ? [`${String(cell.open)} open`] : []),
  ];
  return parts.length === 0 ? 'Not needed' : parts.join(', ');
}
