/**
 * Chord charts in ChordPro, the text the api stores (CONTRACT.md, v0.2): chords
 * in brackets inline (`[G]Amazing [G7]grace`), section labels on their own
 * line (`Verse 1`, `Chorus:`), and `{c: text}` comments. The chart of record is
 * text so it can follow the item's key (services-and-planning): this module
 * reads it and moves its chords to another key, spelled the way that key is
 * written, so G moved to B flat reads Bb, Eb and F, never A#, D# and F.
 */
import { isKeyName } from './song_keys';

/** A chord and the lyric under it, up to the next chord. */
export interface ChartSegment {
  /** Where the segment starts in its line: a stable key for it. */
  readonly start: number;
  /** The chord over the lyric; null for the lyric before a line's first chord. */
  readonly chord: string | null;
  readonly lyric: string;
}

export type ChartLine =
  | { readonly kind: 'lyrics'; readonly line: number; readonly segments: readonly ChartSegment[] }
  | { readonly kind: 'comment'; readonly line: number; readonly text: string }
  | { readonly kind: 'blank'; readonly line: number };

export interface ChartSection {
  /** "Verse 1", "Chorus"; null for what comes before the first label. */
  readonly label: string | null;
  /** The line it starts on in the text: a stable key for it. */
  readonly line: number;
  readonly lines: readonly ChartLine[];
}

export interface Chart {
  readonly sections: readonly ChartSection[];
}

const SECTION_PATTERN =
  /^(?:verse|chorus|bridge|pre[- ]?chorus|intro|outro|tag|interlude|instrumental)(?:\s*\d+)?\s*:?$/i;

const DIRECTIVE_PATTERN = /^\{\s*([A-Za-z_]+)\s*(?::\s*(.*?))?\s*\}$/;

const COMMENT_DIRECTIVES: ReadonlySet<string> = new Set(['c', 'comment']);

const CHORD_PATTERN = /\[([^[\]]*)\]/g;

function parseSegments(text: string): ChartSegment[] {
  const segments: ChartSegment[] = [];
  let chord: string | null = null;
  let start = 0;
  let lyric = '';
  let from = 0;
  for (const match of text.matchAll(CHORD_PATTERN)) {
    const name = (match[1] ?? '').trim();
    if (name === '') {
      // Empty brackets are text, not a chord.
      continue;
    }
    lyric += text.slice(from, match.index);
    if (chord !== null || lyric !== '') {
      segments.push({ start, chord, lyric });
    }
    chord = name;
    start = match.index;
    lyric = '';
    from = match.index + match[0].length;
  }
  lyric += text.slice(from);
  if (chord !== null || lyric !== '') {
    segments.push({ start, chord, lyric });
  }
  return segments;
}

function parseLine(text: string, line: number): ChartLine | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'blank', line };
  }
  const directive = DIRECTIVE_PATTERN.exec(trimmed);
  if (directive !== null) {
    const name = (directive[1] ?? '').toLowerCase();
    // Other directives ({title}, {key}) say what the song record already says.
    return COMMENT_DIRECTIVES.has(name)
      ? { kind: 'comment', line, text: directive[2] ?? '' }
      : null;
  }
  return { kind: 'lyrics', line, segments: parseSegments(text.trimEnd()) };
}

function trimBlankLines(lines: readonly ChartLine[]): ChartLine[] {
  let first = 0;
  let last = lines.length;
  while (first < last && lines[first]?.kind === 'blank') {
    first += 1;
  }
  while (last > first && lines[last - 1]?.kind === 'blank') {
    last -= 1;
  }
  return lines.slice(first, last);
}

/** Reads ChordPro text into its sections and lines. Never throws: any text is a chart. */
export function parseChart(text: string): Chart {
  const sections: ChartSection[] = [];
  let label: string | null = null;
  let labelLine = 0;
  let lines: ChartLine[] = [];
  const close = (): void => {
    const kept = trimBlankLines(lines);
    if (label !== null || kept.length > 0) {
      sections.push({
        label,
        line: label === null ? (kept[0]?.line ?? 0) : labelLine,
        lines: kept,
      });
    }
  };
  text.split(/\r\n|\n|\r/).forEach((raw, index) => {
    const trimmed = raw.trim();
    if (SECTION_PATTERN.test(trimmed)) {
      close();
      label = trimmed.replace(/\s*:$/, '');
      labelLine = index;
      lines = [];
      return;
    }
    const line = parseLine(raw, index);
    if (line !== null) {
      lines.push(line);
    }
  });
  close();
  return { sections };
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/** The pitch class (C = 0) of each of LETTERS without an accidental. */
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11] as const;

/**
 * The letter step from the tonic for each semitone above it: the scale's own
 * notes, and the chromatic ones as b2, b3, #4, b6 and b7, the way charts
 * spell borrowed chords (Bb and Eb in G, D/F# in C).
 */
const LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;

/** The semitones above the tonic that belong to the scale. */
const MAJOR_DEGREES: ReadonlySet<number> = new Set([0, 2, 4, 5, 7, 9, 11]);
/** Natural minor, with the raised seventh of the dominant chord. */
const MINOR_DEGREES: ReadonlySet<number> = new Set([0, 2, 3, 5, 7, 8, 10, 11]);

/** Names a chart avoids for a note outside the key: B, not Cb. */
const AWKWARD_NAMES: ReadonlySet<string> = new Set(['Cb', 'Fb', 'E#', 'B#']);

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEYS = [
  'Cm',
  'C#m',
  'Dm',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'Bbm',
  'Bm',
] as const;

interface Note {
  readonly letter: number;
  readonly pitch: number;
}

interface Key {
  readonly tonic: Note;
  readonly minor: boolean;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function accidentalOf(text: string): number {
  switch (text) {
    case '#':
      return 1;
    case 'b':
      return -1;
    default:
      return 0;
  }
}

/** Reads a note name such as "F#" or "Bb". */
function parseNote(name: string): Note | null {
  const match = /^([A-G])([#b]?)$/.exec(name);
  if (match === null) {
    return null;
  }
  const letter = LETTERS.findIndex((candidate) => candidate === match[1]);
  const natural = NATURAL_PITCHES[letter];
  return natural === undefined
    ? null
    : { letter, pitch: mod12(natural + accidentalOf(match[2] ?? '')) };
}

function parseKey(key: string): Key | null {
  if (!isKeyName(key)) {
    return null;
  }
  const minor = key.endsWith('m');
  const tonic = parseNote(minor ? key.slice(0, -1) : key);
  return tonic === null ? null : { tonic, minor };
}

function nameOf(letter: number, pitch: number): string {
  const natural = NATURAL_PITCHES[letter] ?? 0;
  const accidental = mod12(pitch - natural + 6) - 6;
  const sign = accidental > 0 ? '#' : 'b';
  return `${LETTERS[letter] ?? ''}${sign.repeat(Math.abs(accidental))}`;
}

/** Whether the key's signature has flats: F, Bb, Eb..., and the minor keys that share them. */
function prefersFlats(key: Key): boolean {
  const major = key.minor
    ? { letter: (key.tonic.letter + 2) % 7, pitch: mod12(key.tonic.pitch + 3) }
    : key.tonic;
  const name = nameOf(major.letter, major.pitch);
  return name === 'F' || name.endsWith('b');
}

/**
 * The name of pitch class `pitch` (C = 0) in `key`: by its scale step from the
 * tonic, so a key with flats gets flats and one with sharps gets sharps; a
 * note outside the key never gets two accidentals or a name like Cb.
 */
export function spellPitch(pitch: number, key: string): string {
  const parsed = parseKey(key);
  const target = mod12(pitch);
  if (parsed === null) {
    return SHARP_NAMES[target] ?? '';
  }
  const offset = mod12(target - parsed.tonic.pitch);
  const letter = (parsed.tonic.letter + (LETTER_STEPS[offset] ?? 0)) % 7;
  const name = nameOf(letter, target);
  const inScale = (parsed.minor ? MINOR_DEGREES : MAJOR_DEGREES).has(offset);
  if (name.length > 2 || (!inScale && AWKWARD_NAMES.has(name))) {
    return (prefersFlats(parsed) ? FLAT_NAMES : SHARP_NAMES)[target] ?? name;
  }
  return name;
}

/** The semitones up from the tonic of `from` to that of `to`, 0 to 11; null when either is no key. */
export function semitonesBetween(from: string, to: string): number | null {
  const start = parseKey(from);
  const end = parseKey(to);
  return start === null || end === null ? null : mod12(end.tonic.pitch - start.tonic.pitch);
}

/** What may follow a chord's root: m7, sus4, add9, maj7, 7(#9), m7b5, 6/9. */
const QUALITY_PATTERN = /^(?:maj|min|dim|aug|sus|add|alt|no|m|M|b|#|\+|-|°|ø|Δ|\d+|\(|\)|,|\/)*$/;

const ROOT_PATTERN = /^([A-G][#b]?)(.*)$/;

function moveNote(name: string, semitones: number, key: string): string | null {
  const note = parseNote(name);
  return note === null ? null : spellPitch(note.pitch + semitones, key);
}

/**
 * Moves `chord` up by `semitones` and spells it in `key`: its root, its
 * quality as written, and the bass of a slash chord. What is no chord
 * ("N.C.", "x2", "Chorus") stays as it is.
 */
export function transposeChord(chord: string, semitones: number, key: string): string {
  const normalized = chord.replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = ROOT_PATTERN.exec(normalized);
  if (match === null) {
    return chord;
  }
  const rest = match[2] ?? '';
  const slash = rest.lastIndexOf('/');
  const bass = slash === -1 ? null : rest.slice(slash + 1);
  const hasBass = bass !== null && parseNote(bass) !== null;
  const quality = hasBass ? rest.slice(0, slash) : rest;
  if (!QUALITY_PATTERN.test(quality)) {
    return chord;
  }
  const root = moveNote(match[1] ?? '', semitones, key) ?? '';
  const movedBass = hasBass ? moveNote(bass, semitones, key) : null;
  return movedBass === null ? `${root}${quality}` : `${root}${quality}/${movedBass}`;
}

/**
 * The chart, written in `from`, with every chord moved to `to`. The lyrics,
 * labels and comments stay as they are. The same chart comes back when the
 * keys are the same or either is no key, so the author's spelling stands.
 */
export function transposeChart(chart: Chart, from: string, to: string): Chart {
  const semitones = semitonesBetween(from, to);
  if (semitones === null || semitones === 0) {
    return chart;
  }
  return {
    sections: chart.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) =>
        line.kind === 'lyrics'
          ? {
              ...line,
              segments: line.segments.map((segment) =>
                segment.chord === null
                  ? segment
                  : { ...segment, chord: transposeChord(segment.chord, semitones, to) },
              ),
            }
          : line,
      ),
    })),
  };
}

/** The twelve keys, by their usual names, in the mode (major or minor) of `key`. */
export function keysInMode(key: string): readonly string[] {
  return parseKey(key)?.minor === true ? MINOR_KEYS : MAJOR_KEYS;
}
