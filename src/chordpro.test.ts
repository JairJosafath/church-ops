import { describe, expect, it } from 'vitest';

import {
  keysInMode,
  parseChart,
  semitonesBetween,
  spellPitch,
  transposeChart,
  transposeChord,
  type Chart,
} from './chordpro';

/** The chart's chords, section by section, as "label: chord chord". */
function chordsOf(chart: Chart): string[] {
  return chart.sections.map((section) => {
    const chords = section.lines.flatMap((line) =>
      line.kind === 'lyrics'
        ? line.segments.flatMap((segment) => (segment.chord === null ? [] : [segment.chord]))
        : [],
    );
    return `${section.label ?? '-'}: ${chords.join(' ')}`;
  });
}

describe('parseChart', () => {
  it('reads chords in brackets inline, each over the lyric that follows it', () => {
    const chart = parseChart('[G]Amazing [G7]grace, how [C]sweet the [G]sound');
    expect(chart.sections).toHaveLength(1);
    expect(chart.sections[0]?.label).toBeNull();
    expect(chart.sections[0]?.lines).toEqual([
      {
        kind: 'lyrics',
        line: 0,
        segments: [
          { start: 0, chord: 'G', lyric: 'Amazing ' },
          { start: 11, chord: 'G7', lyric: 'grace, how ' },
          { start: 26, chord: 'C', lyric: 'sweet the ' },
          { start: 39, chord: 'G', lyric: 'sound' },
        ],
      },
    ]);
  });

  it('keeps the lyric before the first chord, and a chord in the middle of a word', () => {
    const chart = parseChart('That saved a [D]wretch like [G]me, A[C]mazing');
    expect(chart.sections[0]?.lines[0]).toMatchObject({
      segments: [
        { chord: null, lyric: 'That saved a ' },
        { chord: 'D', lyric: 'wretch like ' },
        { chord: 'G', lyric: 'me, A' },
        { chord: 'C', lyric: 'mazing' },
      ],
    });
  });

  it('reads a line of chords alone', () => {
    expect(parseChart('[G] [C] [D]').sections[0]?.lines[0]).toMatchObject({
      segments: [
        { chord: 'G', lyric: ' ' },
        { chord: 'C', lyric: ' ' },
        { chord: 'D', lyric: '' },
      ],
    });
  });

  it.each([
    'Verse 1',
    'Verse 1:',
    'verse',
    'VERSE 2:',
    'Chorus',
    'Chorus 2',
    'Bridge:',
    'Pre-Chorus',
    'Pre Chorus 1:',
    'Intro',
    'Outro:',
    'Tag',
    'Interlude',
    'Instrumental',
    '  Chorus  ',
  ])('reads "%s" on its own line as a section label', (label) => {
    const chart = parseChart(`${label}\n[G]Amazing grace`);
    expect(chart.sections).toHaveLength(1);
    expect(chart.sections[0]?.label).toBe(label.trim().replace(/:$/, ''));
  });

  it.each(['Verse one', 'Chorus of angels', 'Versed', 'Bridge: [G]over', 'The Chorus'])(
    'reads "%s" as a lyric, not a label',
    (text) => {
      expect(parseChart(text).sections[0]?.label).toBeNull();
    },
  );

  it('splits the chart into its sections, without the blank lines around them', () => {
    const chart = parseChart(
      [
        '{c: Capo 2}',
        '',
        'Verse 1',
        '[G]Amazing grace',
        '[G]How sweet',
        '',
        'Chorus:',
        '[C]My chains are gone',
        '',
        '',
      ].join('\n'),
    );
    expect(chart.sections.map((section) => section.label)).toEqual([null, 'Verse 1', 'Chorus']);
    expect(chart.sections.map((section) => section.lines.map((line) => line.kind))).toEqual([
      ['comment'],
      ['lyrics', 'lyrics'],
      ['lyrics'],
    ]);
  });

  it('keeps a blank line inside a section, where it separates two stanzas', () => {
    const chart = parseChart('Verse 1\n[G]One\n\n[C]Two');
    expect(chart.sections[0]?.lines.map((line) => line.kind)).toEqual([
      'lyrics',
      'blank',
      'lyrics',
    ]);
  });

  it.each([
    { text: '{c: Capo 2}', want: 'Capo 2' },
    { text: '{comment: Softly, keys only}', want: 'Softly, keys only' },
    { text: '{ c :Build }', want: 'Build' },
    { text: '{C: Loud}', want: 'Loud' },
  ])('reads the comment in $text', ({ text, want }) => {
    expect(parseChart(text).sections[0]?.lines).toEqual([{ kind: 'comment', line: 0, text: want }]);
  });

  it('leaves out directives it does not show', () => {
    const chart = parseChart('{title: Amazing Grace}\n{key: G}\n[G]Amazing grace');
    expect(chart.sections[0]?.lines.map((line) => line.kind)).toEqual(['lyrics']);
  });

  it('reads an unclosed bracket and empty brackets as text, never a chord', () => {
    expect(parseChart('Grace [G and []love').sections[0]?.lines[0]).toMatchObject({
      segments: [{ chord: null, lyric: 'Grace [G and []love' }],
    });
  });

  it('reads Windows line ends, non-ASCII lyrics and an empty chart', () => {
    expect(parseChart('Couplet\r\n[D]Groot is Uw [G]trouw, o Heer, één').sections).toEqual([
      {
        label: null,
        line: 0,
        lines: [
          {
            kind: 'lyrics',
            line: 0,
            segments: [{ start: 0, chord: null, lyric: 'Couplet' }],
          },
          {
            kind: 'lyrics',
            line: 1,
            segments: [
              { start: 0, chord: 'D', lyric: 'Groot is Uw ' },
              { start: 15, chord: 'G', lyric: 'trouw, o Heer, één' },
            ],
          },
        ],
      },
    ]);
    expect(parseChart('').sections).toEqual([]);
    expect(parseChart('\n\n  \n').sections).toEqual([]);
  });

  it('reads a long chart', () => {
    const verse = 'Verse 1\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\n\n';
    const chart = parseChart(verse.repeat(2000));
    expect(chart.sections).toHaveLength(2000);
  });
});

describe('semitonesBetween', () => {
  it.each([
    { from: 'G', to: 'Bb', want: 3 },
    { from: 'G', to: 'G', want: 0 },
    { from: 'G', to: 'F', want: 10 },
    { from: 'Bb', to: 'A#', want: 0 },
    { from: 'Em', to: 'Gm', want: 3 },
    { from: 'C', to: 'B', want: 11 },
    { from: 'G', to: 'X', want: null },
    { from: '', to: 'G', want: null },
  ])('counts $want from $from up to $to', ({ from, to, want }) => {
    expect(semitonesBetween(from, to)).toBe(want);
  });
});

describe('spellPitch', () => {
  const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  it.each([
    { key: 'C', want: 'C Db D Eb E F F# G Ab A Bb B' },
    { key: 'G', want: 'G Ab A Bb B C C# D Eb E F F#' },
    { key: 'D', want: 'D Eb E F F# G G# A Bb B C C#' },
    { key: 'E', want: 'E F F# G G# A A# B C C# D D#' },
    { key: 'F', want: 'F Gb G Ab A Bb B C Db D Eb E' },
    { key: 'Bb', want: 'Bb B C Db D Eb E F Gb G Ab A' },
    { key: 'Eb', want: 'Eb E F Gb G Ab A Bb B C Db D' },
    { key: 'Db', want: 'Db D Eb E F Gb G Ab A Bb B C' },
    { key: 'F#', want: 'F# G G# A A# B C C# D D# E E#' },
    { key: 'Gb', want: 'Gb G Ab A Bb Cb C Db D Eb E F' },
    { key: 'Am', want: 'A Bb B C C# D D# E F F# G G#' },
    { key: 'Em', want: 'E F F# G G# A A# B C C# D D#' },
    { key: 'Dm', want: 'D Eb E F F# G G# A Bb B C C#' },
    { key: 'Cm', want: 'C Db D Eb E F F# G Ab A Bb B' },
    { key: 'F#m', want: 'F# G G# A A# B C C# D D# E E#' },
  ])('spells the twelve notes from the tonic of $key', ({ key, want }) => {
    const tonic = semitonesBetween('C', key) ?? 0;
    expect(ALL.map((offset) => spellPitch((tonic + offset) % 12, key)).join(' ')).toBe(want);
  });

  it('never spells a note with two accidentals', () => {
    const spelled = ['C#', 'G#m', 'A#', 'Cb', 'E#', 'Fb'].flatMap((key) =>
      ALL.map((pitch) => spellPitch(pitch, key)),
    );
    expect(spelled.filter((name) => /##|bb$|b{2}/.test(name.slice(1)))).toEqual([]);
  });
});

describe('transposeChord', () => {
  it.each([
    { chord: 'G', semitones: 3, key: 'Bb', want: 'Bb' },
    { chord: 'C', semitones: 3, key: 'Bb', want: 'Eb' },
    { chord: 'D', semitones: 3, key: 'Bb', want: 'F' },
    { chord: 'Em7', semitones: 3, key: 'Bb', want: 'Gm7' },
    { chord: 'D/F#', semitones: 3, key: 'Bb', want: 'F/A' },
    { chord: 'C/E', semitones: 3, key: 'Bb', want: 'Eb/G' },
    { chord: 'Am7', semitones: 3, key: 'Bb', want: 'Cm7' },
    { chord: 'Bm7b5', semitones: 3, key: 'Bb', want: 'Dm7b5' },
    { chord: 'Gsus4', semitones: 2, key: 'A', want: 'Asus4' },
    { chord: 'Cadd9', semitones: 2, key: 'A', want: 'Dadd9' },
    { chord: 'Bb', semitones: 2, key: 'A', want: 'C' },
    { chord: 'D/F#', semitones: 2, key: 'A', want: 'E/G#' },
    { chord: 'Eb', semitones: 2, key: 'A', want: 'F' },
    { chord: 'C6/9', semitones: 2, key: 'D', want: 'D6/9' },
    { chord: 'G', semitones: 0, key: 'G', want: 'G' },
    { chord: 'A#', semitones: 0, key: 'Bb', want: 'Bb' },
    { chord: 'F#m', semitones: 4, key: 'Bb', want: 'Bbm' },
    { chord: 'C#m', semitones: 6, key: 'Bb', want: 'Gm' },
    { chord: 'B♭maj7', semitones: 2, key: 'D', want: 'Cmaj7' },
    { chord: 'F♯m', semitones: 1, key: 'G', want: 'Gm' },
    { chord: 'G/B', semitones: -2, key: 'F', want: 'F/A' },
    { chord: 'Em', semitones: 3, key: 'Gm', want: 'Gm' },
    { chord: 'B7', semitones: 3, key: 'Gm', want: 'D7' },
    { chord: 'B/D#', semitones: 0, key: 'Em', want: 'B/D#' },
    { chord: 'B/D#', semitones: 5, key: 'Am', want: 'E/G#' },
  ])('moves $chord by $semitones into $key as $want', ({ chord, semitones, key, want }) => {
    expect(transposeChord(chord, semitones, key)).toBe(want);
  });

  it.each(['N.C.', 'x2', '|', '(G)', '', 'H7', '/', 'Chorus', 'Bridge x2'])(
    'leaves "%s", which is no chord, as it is',
    (chord) => {
      expect(transposeChord(chord, 3, 'Bb')).toBe(chord);
    },
  );
});

describe('transposeChart', () => {
  const CHART = parseChart(
    [
      'Verse 1',
      '{c: Capo 3 [G]}',
      '[G]Amazing [G7]grace, how [C]sweet the [G]sound',
      'That saved a [D/F#]wretch like [Em]me',
      'Chorus',
      '[C]My chains are [G/B]gone [Am7] [D]',
    ].join('\n'),
  );

  it('moves every chord from G to Bb, spelled in flats', () => {
    expect(chordsOf(transposeChart(CHART, 'G', 'Bb'))).toEqual([
      'Verse 1: Bb Bb7 Eb Bb F/A Gm',
      'Chorus: Eb Bb/D Cm7 F',
    ]);
  });

  it('moves every chord from G to A, spelled in sharps', () => {
    expect(chordsOf(transposeChart(CHART, 'G', 'A'))).toEqual([
      'Verse 1: A A7 D A E/G# F#m',
      'Chorus: D A/C# Bm7 E',
    ]);
  });

  it('keeps the lyrics and comments as they are', () => {
    const moved = transposeChart(CHART, 'G', 'Bb');
    expect(moved.sections[0]?.lines[0]).toEqual({ kind: 'comment', line: 1, text: 'Capo 3 [G]' });
    expect(
      moved.sections[0]?.lines[1]?.kind === 'lyrics'
        ? moved.sections[0].lines[1].segments.map((segment) => segment.lyric).join('')
        : null,
    ).toBe('Amazing grace, how sweet the sound');
  });

  it.each([
    { from: 'G', to: 'G' },
    { from: 'G', to: 'X' },
    { from: '', to: 'Bb' },
  ])('leaves the chart as written from "$from" to "$to"', ({ from, to }) => {
    expect(transposeChart(CHART, from, to)).toBe(CHART);
  });
});

describe('keysInMode', () => {
  it.each([
    { key: 'G', want: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
    {
      key: 'Em',
      want: ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'],
    },
    { key: 'nonsense', want: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
  ])('offers the twelve keys in the mode of $key', ({ key, want }) => {
    expect(keysInMode(key)).toEqual(want);
  });
});
