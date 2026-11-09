import { describe, expect, it } from 'vitest';

import { parseArrangementForm, type ArrangementFormFields } from './arrangement_form';

const FIELDS: ArrangementFormFields = {
  name: ' Acoustic ',
  key: 'g',
  tempo: '72',
  meter: '',
  length: '4:30',
  sequence: 'V1 C V2 C',
  chart: '[G]Amazing [C]grace',
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
  ])('refuses $change', ({ change, field, message }) => {
    expect(parseArrangementForm({ ...FIELDS, ...change })).toEqual({
      ok: false,
      errors: { [field]: message },
    });
  });
});
