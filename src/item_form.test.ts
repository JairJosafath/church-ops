import { describe, expect, it } from 'vitest';

import { decodeItem } from './api_types';
import { itemFormFields, parseItemForm, type ItemFormFields } from './item_form';
import { itemJson, personJson, songItemJson } from './test_fixtures';

const SONG: ItemFormFields = {
  kind: 'song',
  title: ' Amazing Grace ',
  length: '5:00',
  arrangementId: '7',
  key: '',
  scene: '',
  lowerThird: '',
  offStream: false,
  notes: '',
  songLeaderId: '',
  teamNotes: {},
};

describe('parseItemForm', () => {
  it('reads a song that plays its arrangement in its default key', () => {
    expect(parseItemForm(SONG)).toEqual({
      ok: true,
      item: {
        kind: 'song',
        title: 'Amazing Grace',
        lengthSeconds: 300,
        arrangementId: 7,
        key: null,
        scene: null,
        lowerThird: null,
        offStream: false,
        notes: '',
        songLeaderId: null,
        teamNotes: [],
      },
    });
  });

  it('reads a song in its own key, with a scene and a caption', () => {
    const result = parseItemForm({ ...SONG, key: 'bb', scene: ' Band ', lowerThird: 'CCLI 22025' });
    expect(result).toMatchObject({
      ok: true,
      item: { key: 'Bb', scene: 'Band', lowerThird: 'CCLI 22025' },
    });
  });

  it('drops the arrangement and key of an item that is not a song', () => {
    const result = parseItemForm({ ...SONG, kind: 'reading', title: 'Psalm 23', key: 'G' });
    expect(result).toMatchObject({
      ok: true,
      item: { kind: 'reading', arrangementId: null, key: null },
    });
  });

  // v0.2 songs and plans

  it('reads who leads a song, and a note per team, trimmed and in team order', () => {
    const result = parseItemForm({
      ...SONG,
      songLeaderId: '2',
      teamNotes: { '6': ' Lyrics from verse 1 ', '5': 'Keys alone\nthen band' },
    });
    expect(result).toMatchObject({
      ok: true,
      item: {
        songLeaderId: 2,
        teamNotes: [
          { teamId: 5, note: 'Keys alone\nthen band' },
          { teamId: 6, note: 'Lyrics from verse 1' },
        ],
      },
    });
  });

  it('keeps an emptied team note as empty, which removes it', () => {
    expect(parseItemForm({ ...SONG, teamNotes: { '5': '   ' } })).toMatchObject({
      ok: true,
      item: { teamNotes: [{ teamId: 5, note: '' }] },
    });
  });

  it('gives an item that is not a song no song leader', () => {
    const result = parseItemForm({ ...SONG, kind: 'sermon', title: 'Sermon', songLeaderId: '2' });
    expect(result).toMatchObject({ ok: true, item: { songLeaderId: null } });
  });

  it('gives a header no time when its length is blank', () => {
    const result = parseItemForm({ ...SONG, kind: 'header', title: 'Worship', length: '' });
    expect(result).toMatchObject({ ok: true, item: { kind: 'header', lengthSeconds: 0 } });
  });

  it('keeps a prayer off stream when the planner says so', () => {
    const result = parseItemForm({ ...SONG, kind: 'prayer', title: 'Prayers', offStream: true });
    expect(result).toMatchObject({ ok: true, item: { offStream: true } });
  });

  it.each([
    { change: { title: '  ' }, errors: { title: 'Give the item a title.' } },
    { change: { length: '' }, errors: { length: 'Give a length such as 4:30, or minutes.' } },
    { change: { length: 'long' }, errors: { length: 'Give a length such as 4:30, or minutes.' } },
    {
      change: { arrangementId: '' },
      errors: { arrangementId: 'Choose the arrangement the band plays.' },
    },
    { change: { key: 'H' }, errors: { key: 'Use a key such as G, Bb or F#m, or leave it blank.' } },
    {
      change: { title: '', length: 'x' },
      errors: {
        title: 'Give the item a title.',
        length: 'Give a length such as 4:30, or minutes.',
      },
    },
  ])('refuses $change', ({ change, errors }) => {
    expect(parseItemForm({ ...SONG, ...change })).toEqual({ ok: false, errors });
  });
});

describe('itemFormFields', () => {
  it('starts a new item as a blank song', () => {
    expect(itemFormFields(null)).toEqual({
      kind: 'song',
      title: '',
      length: '',
      arrangementId: '',
      key: '',
      scene: '',
      lowerThird: '',
      offStream: false,
      notes: '',
      songLeaderId: '',
      teamNotes: {},
    });
  });

  it('fills the form from a song item, so saving it unchanged changes nothing', () => {
    const item = decodeItem(
      songItemJson({
        scene: 'Band',
        notes: 'Slow intro',
        song_leader: personJson({ id: 2, name: 'Ben Bakker' }),
        team_notes: [
          { team_id: 6, team_name: 'Stream', note: 'Lyrics from verse 1' },
          { team_id: 5, team_name: 'Worship band', note: 'Start with keys alone' },
        ],
      }),
      'item',
    );
    const fields = itemFormFields(item);
    expect(fields).toMatchObject({
      kind: 'song',
      length: '5:00',
      arrangementId: '7',
      key: 'Bb',
      scene: 'Band',
      songLeaderId: '2',
      teamNotes: { '5': 'Start with keys alone', '6': 'Lyrics from verse 1' },
    });
    expect(parseItemForm(fields)).toEqual({
      ok: true,
      item: {
        kind: 'song',
        title: 'Amazing Grace',
        lengthSeconds: 300,
        arrangementId: 7,
        key: 'Bb',
        scene: 'Band',
        lowerThird: null,
        offStream: false,
        notes: 'Slow intro',
        songLeaderId: 2,
        teamNotes: [
          { teamId: 5, note: 'Start with keys alone' },
          { teamId: 6, note: 'Lyrics from verse 1' },
        ],
      },
    });
  });

  it('fills the form from a reading', () => {
    expect(itemFormFields(decodeItem(itemJson(), 'item'))).toMatchObject({
      kind: 'reading',
      length: '3:00',
      arrangementId: '',
    });
  });
});
