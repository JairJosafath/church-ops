import { describe, expect, it } from 'vitest';

import { decodeItem } from './api_types';
import { itemFormFields, parseItemForm, type ItemFormFields } from './item_form';
import { itemJson, songItemJson } from './test_fixtures';

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
    });
  });

  it('fills the form from a song item, so saving it unchanged changes nothing', () => {
    const item = decodeItem(songItemJson({ scene: 'Band', notes: 'Slow intro' }), 'item');
    const fields = itemFormFields(item);
    expect(fields).toMatchObject({
      kind: 'song',
      length: '5:00',
      arrangementId: '7',
      key: 'Bb',
      scene: 'Band',
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
