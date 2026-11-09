/** The service types page's form: a type's name, start time and rehearsal, read for the api. */
import type { ServiceTypeInput } from './api_client';
import type { ServiceType } from './api_types';

export interface ServiceTypeFormFields {
  readonly name: string;
  /** "HH:MM" in Dutch time; "10:00" when blank. */
  readonly startTime: string;
  /** Minutes before the start, or "" for no rehearsal. */
  readonly rehearsalOffset: string;
}

export type ServiceTypeFormErrors = Partial<Record<keyof ServiceTypeFormFields, string>>;

export type ServiceTypeFormResult =
  | { readonly ok: true; readonly serviceType: ServiceTypeInput }
  | { readonly ok: false; readonly errors: ServiceTypeFormErrors };

const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MAX_OFFSET_MINUTES = 24 * 60;

/** Reads the form into a service type, or says what to fix. */
export function parseServiceTypeForm(fields: ServiceTypeFormFields): ServiceTypeFormResult {
  const errors: ServiceTypeFormErrors = {};
  const name = fields.name.trim();
  if (name === '') {
    errors.name = 'Name the service type.';
  }
  const time = TIME_PATTERN.exec(
    fields.startTime.trim() === '' ? '10:00' : fields.startTime.trim(),
  );
  if (time === null) {
    errors.startTime = 'Give a time such as 10:00.';
  }
  const offsetText = fields.rehearsalOffset.trim();
  const offset = /^\d+$/.test(offsetText) ? Number(offsetText) : null;
  if (offsetText !== '' && (offset === null || offset > MAX_OFFSET_MINUTES)) {
    errors.rehearsalOffset = `Give the minutes from 0 to ${String(MAX_OFFSET_MINUTES)}, or leave it blank.`;
  }
  if (time === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    serviceType: {
      name,
      startTime: `${(time[1] ?? '').padStart(2, '0')}:${time[2] ?? ''}`,
      rehearsalOffsetMinutes: offset,
    },
  };
}

/** The form's fields for editing `serviceType`. */
export function serviceTypeFormFields(serviceType: ServiceType): ServiceTypeFormFields {
  return {
    name: serviceType.name,
    startTime: serviceType.startTime,
    rehearsalOffset:
      serviceType.rehearsalOffsetMinutes === null ? '' : String(serviceType.rehearsalOffsetMinutes),
  };
}

/** When a type's teams rehearse, in words. */
export function describeRehearsal(offsetMinutes: number | null): string {
  if (offsetMinutes === null) {
    return 'No rehearsal';
  }
  if (offsetMinutes === 0) {
    return 'Rehearses at the start time';
  }
  return offsetMinutes === 1
    ? 'Rehearses 1 minute before'
    : `Rehearses ${String(offsetMinutes)} minutes before`;
}
