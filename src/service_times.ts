/**
 * A plan's times (services-and-planning): when the teams meet, which is one
 * or more rehearsals and the service itself, each shown in Dutch time.
 */
import type { NewRehearsal } from './api_client';
import type { PlanTime, Service } from './api_types';
import { amsterdamLocalToIso } from './dutch_time';

/**
 * The plan's times by start. An api that does not send times yet (they are
 * new in v0.2) still has the service itself, from its start to its end.
 */
export function planTimesOf(service: Service): PlanTime[] {
  if (service.times.length === 0) {
    return [
      {
        id: 0,
        kind: 'service',
        name: 'Service',
        startsAt: service.startsAt,
        endsAt: service.endsAt,
      },
    ];
  }
  return [...service.times].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export interface RehearsalFormFields {
  readonly name: string;
  /** As a `datetime-local` input gives it, in Dutch time. */
  readonly startsAt: string;
  readonly endsAt: string;
}

export type RehearsalFormErrors = Partial<Record<keyof RehearsalFormFields, string>>;

export type RehearsalFormResult =
  | { readonly ok: true; readonly rehearsal: NewRehearsal }
  | { readonly ok: false; readonly errors: RehearsalFormErrors };

/** Reads the rehearsal form, or says what to fix. */
export function parseRehearsalForm(fields: RehearsalFormFields): RehearsalFormResult {
  const errors: RehearsalFormErrors = {};
  const name = fields.name.trim();
  if (name === '') {
    errors.name = 'Name the rehearsal.';
  }
  const startsAt = amsterdamLocalToIso(fields.startsAt);
  if (startsAt === null) {
    errors.startsAt = 'Choose when it starts.';
  }
  const endsAt = amsterdamLocalToIso(fields.endsAt);
  if (endsAt === null) {
    errors.endsAt = 'Choose when it ends.';
  } else if (startsAt !== null && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    errors.endsAt = 'It ends after it starts.';
  }
  if (startsAt === null || endsAt === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, rehearsal: { name, startsAt, endsAt } };
}
