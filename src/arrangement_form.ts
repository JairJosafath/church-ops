/** The songs page's arrangement form, read into an arrangement for the api. */
import type { NewArrangement } from './api_client';
import { parseLength } from './plan_times';
import { isKeyName, normalizeKey } from './song_keys';

export interface ArrangementFormFields {
  readonly name: string;
  readonly key: string;
  readonly tempo: string;
  /** "4/4" when blank. */
  readonly meter: string;
  readonly length: string;
  readonly sequence: string;
  readonly chart: string;
}

export type ArrangementFormErrors = Partial<
  Record<'name' | 'key' | 'tempo' | 'meter' | 'length', string>
>;

export type ArrangementFormResult =
  | { readonly ok: true; readonly arrangement: NewArrangement }
  | { readonly ok: false; readonly errors: ArrangementFormErrors };

const MIN_TEMPO = 20;
const MAX_TEMPO = 300;

/** Reads the form into an arrangement, or says what to fix. */
export function parseArrangementForm(fields: ArrangementFormFields): ArrangementFormResult {
  const errors: ArrangementFormErrors = {};
  const name = fields.name.trim();
  if (name === '') {
    errors.name = 'Name the arrangement.';
  }
  const key = normalizeKey(fields.key);
  if (!isKeyName(key)) {
    errors.key = 'Use a key such as G, Bb or F#m.';
  }
  const tempoText = fields.tempo.trim();
  const tempoBpm = /^\d+$/.test(tempoText) ? Number(tempoText) : Number.NaN;
  if (!(tempoBpm >= MIN_TEMPO && tempoBpm <= MAX_TEMPO)) {
    errors.tempo = `Give a tempo from ${String(MIN_TEMPO)} to ${String(MAX_TEMPO)} BPM.`;
  }
  const meter = fields.meter.trim() === '' ? '4/4' : fields.meter.trim();
  if (!/^\d{1,2}\/\d{1,2}$/.test(meter)) {
    errors.meter = 'Give a meter such as 4/4 or 6/8.';
  }
  const lengthSeconds = parseLength(fields.length);
  if (lengthSeconds === null) {
    errors.length = 'Give a length such as 4:30, or minutes.';
  }
  if (lengthSeconds === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    arrangement: {
      name,
      key,
      tempoBpm,
      meter,
      lengthSeconds,
      sequence: fields.sequence.trim(),
      chart: fields.chart,
    },
  };
}
