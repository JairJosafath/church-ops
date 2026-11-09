import { describe, expect, it } from 'vitest';

import { decodeSong } from './api_types';
import { formatTimesUsed, parseSongForm, parseTags, songFormFields } from './song_form';
import { songJson } from './test_fixtures';

describe('parseTags', () => {
  it.each([
    { text: 'hymn, grace', want: ['hymn', 'grace'] },
    { text: ' Advent ,, christmas , ', want: ['Advent', 'christmas'] },
    { text: 'hymn, Hymn, HYMN', want: ['hymn'] },
    { text: 'opwekking 123, Psalmen', want: ['opwekking 123', 'Psalmen'] },
    { text: '', want: [] },
  ])('reads "$text" as $want', ({ text, want }) => {
    expect(parseTags(text)).toEqual(want);
  });
});

describe('parseSongForm', () => {
  it('reads the song, with no CCLI number when it is blank', () => {
    expect(
      parseSongForm({
        title: ' Amazing Grace ',
        authors: ' John Newton ',
        ccli: ' ',
        tags: 'hymn',
      }),
    ).toEqual({
      ok: true,
      song: { title: 'Amazing Grace', authors: 'John Newton', ccli: null, tags: ['hymn'] },
    });
  });

  it('refuses a song without a title', () => {
    expect(parseSongForm({ title: '  ', authors: '', ccli: '', tags: '' })).toEqual({
      ok: false,
      errors: { title: 'Give the song a title.' },
    });
  });

  it('fills the form from a song, so saving it unchanged changes nothing', () => {
    const song = decodeSong(songJson({ tags: ['hymn', 'grace'] }), 'song');
    const fields = songFormFields(song);
    expect(fields.tags).toBe('hymn, grace');
    expect(parseSongForm(fields)).toEqual({
      ok: true,
      song: {
        title: 'Amazing Grace',
        authors: 'John Newton',
        ccli: '22025',
        tags: ['hymn', 'grace'],
      },
    });
  });
});

describe('formatTimesUsed', () => {
  it.each([
    { count: 0, want: 'Not at all' },
    { count: 1, want: 'Once' },
    { count: 6, want: '6 times' },
  ])('writes $count as "$want"', ({ count, want }) => {
    expect(formatTimesUsed(count)).toBe(want);
  });
});
