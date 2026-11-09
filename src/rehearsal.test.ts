import { describe, expect, it } from 'vitest';

import { decodeItem, decodeSong, type Item } from './api_types';
import type { Chart } from './chordpro';
import { rehearsalSongs, teamNotesFor } from './rehearsal';
import { arrangementJson, itemJson, songItemJson, songJson } from './test_fixtures';

const CHART = 'Verse 1\n[G]Amazing [C]grace';

function songItem(overrides: Record<string, unknown>): Item {
  return decodeItem(
    songItemJson({
      arrangement: {
        id: 7,
        song_title: 'Amazing Grace',
        name: 'Default',
        key: 'Bb',
        tempo_bpm: 72,
        meter: '4/4',
        sequence: 'V1 C V2 C',
        chart: CHART,
      },
      key: 'Bb',
      ...overrides,
    }),
    'item',
  );
}

const SONGS = [
  decodeSong(
    songJson({
      arrangements: [arrangementJson({ key: 'G', chart: CHART, audio_url: 'https://e.org/a.mp3' })],
    }),
    'song',
  ),
];

function chordsOf(chart: Chart): string[] {
  return chart.sections.flatMap((section) =>
    section.lines.flatMap((line) =>
      line.kind === 'lyrics'
        ? line.segments.flatMap((segment) => (segment.chord === null ? [] : [segment.chord]))
        : [],
    ),
  );
}

describe('rehearsalSongs', () => {
  it('gives the song items in plan order, and nothing else', () => {
    const items = [
      songItem({ id: 103, position: 3, title: 'Second song' }),
      decodeItem(itemJson({ id: 100, position: 0 }), 'item'),
      songItem({ id: 101, position: 1, title: 'First song' }),
      decodeItem(itemJson({ id: 102, position: 2, kind: 'header', title: 'Word' }), 'item'),
    ];
    expect(rehearsalSongs(items, SONGS).map((song) => song.item.title)).toEqual([
      'First song',
      'Second song',
    ]);
  });

  it('moves the chart from the key it is written in to the item’s key', () => {
    const [song] = rehearsalSongs([songItem({})], SONGS);
    expect(song?.writtenIn).toBe('G');
    expect(song?.key).toBe('Bb');
    expect(chordsOf(song?.chart ?? { sections: [] })).toEqual(['Bb', 'Eb']);
    expect(song?.arrangement?.audioUrl).toBe('https://e.org/a.mp3');
  });

  it('leaves the chart as written when the item plays the arrangement’s key', () => {
    const item = songItem({
      key: null,
      arrangement: {
        id: 7,
        song_title: 'Amazing Grace',
        name: 'Default',
        key: 'G',
        tempo_bpm: 72,
        meter: '4/4',
        sequence: '',
        chart: CHART,
      },
    });
    const [song] = rehearsalSongs([item], []);
    expect(song?.writtenIn).toBe('G');
    expect(chordsOf(song?.chart ?? { sections: [] })).toEqual(['G', 'C']);
  });

  it('says it does not know the written key when the item has its own and the songs are missing', () => {
    const [song] = rehearsalSongs([songItem({})], null);
    expect(song?.writtenIn).toBeNull();
    expect(chordsOf(song?.chart ?? { sections: [] })).toEqual(['G', 'C']);
  });
});

describe('teamNotesFor', () => {
  const item = songItem({
    team_notes: [
      { team_id: 5, team_name: 'Worship band', note: 'Keys alone' },
      { team_id: 6, team_name: 'Stream', note: 'Lyrics from verse 1' },
    ],
  });

  it.each([
    { teamId: null, want: ['Worship band: Keys alone', 'Stream: Lyrics from verse 1'] },
    { teamId: 6, want: ['Stream: Lyrics from verse 1'] },
    { teamId: 9, want: [] },
  ])('gives the notes for team $teamId', ({ teamId, want }) => {
    expect(teamNotesFor(item, teamId).map((note) => `${note.teamName}: ${note.note}`)).toEqual(
      want,
    );
  });
});
