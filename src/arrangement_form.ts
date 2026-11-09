/** The song page's arrangement form, read into an arrangement for the api. */
import type { ArrangementInput } from './api_client';
import type { Arrangement } from './api_types';
import { formatLength, parseLength } from './plan_times';
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
  // v0.2 songs and plans
  /** The other keys the team plays it in, as typed: "A, Bb". */
  readonly otherKeys: string;
  readonly notes: string;
  /** A link to a reference recording, or "". */
  readonly audioUrl: string;
}

export type ArrangementFormErrors = Partial<
  Record<'name' | 'key' | 'tempo' | 'meter' | 'length' | 'otherKeys' | 'audioUrl', string>
>;

export type ArrangementFormResult =
  | { readonly ok: true; readonly arrangement: ArrangementInput }
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
  const otherKeys = parseKeyList(fields.otherKeys);
  if (otherKeys === null) {
    errors.otherKeys = 'Give keys such as A, Bb or F#m, separated by commas.';
  }
  const audioText = fields.audioUrl.trim();
  if (audioText !== '' && recordingHref(audioText) === null) {
    errors.audioUrl = 'Give a web link that starts with https://, or leave it blank.';
  }
  if (lengthSeconds === null || otherKeys === null || Object.keys(errors).length > 0) {
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
      keys: [key, ...otherKeys.filter((other) => other !== key)],
      notes: fields.notes.trim(),
      audioUrl: audioText === '' ? null : audioText,
    },
  };
}

// v0.2 songs and plans

/** Reads "A, bb f#m" as ["A", "Bb", "F#m"], once each; null when one is no key. */
function parseKeyList(text: string): string[] | null {
  const keys = text
    .split(/[\s,]+/)
    .filter((part) => part !== '')
    .map(normalizeKey);
  return keys.every(isKeyName) ? [...new Set(keys)] : null;
}

/** The form's fields for editing `arrangement`, or for a new one when it is null. */
export function arrangementFormFields(arrangement: Arrangement | null): ArrangementFormFields {
  if (arrangement === null) {
    return {
      name: '',
      key: '',
      tempo: '',
      meter: '4/4',
      length: '',
      sequence: '',
      chart: '',
      otherKeys: '',
      notes: '',
      audioUrl: '',
    };
  }
  return {
    name: arrangement.name,
    key: arrangement.key,
    tempo: String(arrangement.tempoBpm),
    meter: arrangement.meter,
    length: formatLength(arrangement.lengthSeconds),
    sequence: arrangement.sequence,
    chart: arrangement.chart,
    otherKeys: arrangement.keys.filter((other) => other !== arrangement.key).join(', '),
    notes: arrangement.notes,
    audioUrl: arrangement.audioUrl ?? '',
  };
}

/**
 * The link to a recording, as an `href` that is safe to render: only an
 * absolute http or https URL, never `javascript:` or `data:`; else null.
 */
export function recordingHref(url: string | null): string | null {
  const text = url?.trim() ?? '';
  if (!URL.canParse(text)) {
    return null;
  }
  const parsed = new URL(text);
  return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
}

/** The keys in "A, bb, H" that are keys, as the form's preview offers them: ["A", "Bb"]. */
export function typedKeys(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map(normalizeKey)
        .filter(isKeyName),
    ),
  ];
}
