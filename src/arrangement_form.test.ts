import { describe, expect, it } from 'vitest';

import {
  arrangementFormFields,
  parseArrangementForm,
  recordingHref,
  typedKeys,
  type ArrangementFormFields,
} from './arrangement_form';
import { decodeArrangement } from './api_types';
import { arrangementJson } from './test_fixtures';

const FIELDS: ArrangementFormFields = {
  name: ' Acoustic ',
  key: 'g',
  tempo: '72',
  meter: '',
  length: '4:30',
  sequence: 'V1 C V2 C',
  chart: '[G]Amazing [C]grace',
  otherKeys: '',
  notes: '',
  audioUrl: '',
};

describe('parseArrangementForm', () => {
  it('reads an arrangement, in 4/4 when no meter is given', () => {
    expect(parseArrangementForm(FIELDS)).toEqual({
      ok: true,
      arrangement: {
        name: 'Acoustic',
        key: 'G',
        tempoBpm: 72,
        meter: '4/4',
        lengthSeconds: 270,
        sequence: 'V1 C V2 C',
        chart: '[G]Amazing [C]grace',
        keys: ['G'],
        notes: '',
        audioUrl: null,
      },
    });
  });

  it('keeps the meter it is given', () => {
    expect(parseArrangementForm({ ...FIELDS, meter: '6/8' })).toMatchObject({
      ok: true,
      arrangement: { meter: '6/8' },
    });
  });

  it.each([
    { change: { name: '' }, field: 'name', message: 'Name the arrangement.' },
    { change: { key: 'X' }, field: 'key', message: 'Use a key such as G, Bb or F#m.' },
    { change: { key: '' }, field: 'key', message: 'Use a key such as G, Bb or F#m.' },
    { change: { tempo: '19' }, field: 'tempo', message: 'Give a tempo from 20 to 300 BPM.' },
    { change: { tempo: '301' }, field: 'tempo', message: 'Give a tempo from 20 to 300 BPM.' },
    { change: { tempo: '72.5' }, field: 'tempo', message: 'Give a tempo from 20 to 300 BPM.' },
    { change: { meter: '4-4' }, field: 'meter', message: 'Give a meter such as 4/4 or 6/8.' },
    { change: { length: '' }, field: 'length', message: 'Give a length such as 4:30, or minutes.' },
    // v0.2 songs and plans
    {
      change: { otherKeys: 'A, H' },
      field: 'otherKeys',
      message: 'Give keys such as A, Bb or F#m, separated by commas.',
    },
    {
      change: { audioUrl: 'javascript:alert(1)' },
      field: 'audioUrl',
      message: 'Give a web link that starts with https://, or leave it blank.',
    },
    {
      change: { audioUrl: 'grace.mp3' },
      field: 'audioUrl',
      message: 'Give a web link that starts with https://, or leave it blank.',
    },
  ])('refuses $change', ({ change, field, message }) => {
    expect(parseArrangementForm({ ...FIELDS, ...change })).toEqual({
      ok: false,
      errors: { [field]: message },
    });
  });
});

// v0.2 songs and plans

describe('the arrangement’s keys, notes and recording', () => {
  it('reads the other keys after the default key, once each, as typed in any case', () => {
    expect(parseArrangementForm({ ...FIELDS, otherKeys: 'a, bb  G,a f#m' })).toMatchObject({
      ok: true,
      arrangement: { key: 'G', keys: ['G', 'A', 'Bb', 'F#m'] },
    });
  });

  it('reads the notes and a recording link', () => {
    expect(
      parseArrangementForm({
        ...FIELDS,
        notes: 'Capo 2 for the acoustic\n',
        audioUrl: ' https://example.org/grace.mp3 ',
      }),
    ).toMatchObject({
      ok: true,
      arrangement: { notes: 'Capo 2 for the acoustic', audioUrl: 'https://example.org/grace.mp3' },
    });
  });

  it('fills the form from an arrangement, so saving it unchanged changes nothing', () => {
    const arrangement = decodeArrangement(
      arrangementJson({
        keys: ['G', 'A', 'Bb'],
        notes: 'Capo 2',
        audio_url: 'https://example.org/grace.mp3',
      }),
      'arrangement',
    );
    const fields = arrangementFormFields(arrangement);
    expect(fields).toMatchObject({ key: 'G', otherKeys: 'A, Bb', tempo: '72', length: '5:00' });
    expect(parseArrangementForm(fields)).toEqual({
      ok: true,
      arrangement: {
        name: 'Default',
        key: 'G',
        tempoBpm: 72,
        meter: '4/4',
        lengthSeconds: 300,
        sequence: 'V1 C V2 C B C',
        chart: '[G]Amazing grace',
        keys: ['G', 'A', 'Bb'],
        notes: 'Capo 2',
        audioUrl: 'https://example.org/grace.mp3',
      },
    });
  });

  it('starts a new arrangement blank, in 4/4', () => {
    expect(arrangementFormFields(null)).toMatchObject({ name: '', key: '', meter: '4/4' });
  });
});

describe('recordingHref', () => {
  it.each([
    { url: 'https://example.org/grace.mp3', want: 'https://example.org/grace.mp3' },
    { url: 'http://example.org/a b.mp3', want: 'http://example.org/a%20b.mp3' },
    { url: 'javascript:alert(1)', want: null },
    { url: 'data:text/html,hi', want: null },
    { url: '/grace.mp3', want: null },
    { url: '', want: null },
    { url: null, want: null },
  ])('links $url as $want', ({ url, want }) => {
    expect(recordingHref(url)).toBe(want);
  });
});

describe('typedKeys', () => {
  it.each([
    { text: 'A, bb, H', want: ['A', 'Bb'] },
    { text: ' g a  A', want: ['G', 'A'] },
    { text: '', want: [] },
  ])('reads the keys in "$text"', ({ text, want }) => {
    expect(typedKeys(text)).toEqual(want);
  });
});
