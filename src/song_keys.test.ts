import { describe, expect, it } from 'vitest';

import { effectiveKey, isKeyName, normalizeKey } from './song_keys';

describe('isKeyName', () => {
  it.each(['C', 'G', 'Bb', 'F#', 'Am', 'F#m', 'Ebm'])('accepts %s', (key) => {
    expect(isKeyName(key)).toBe(true);
  });

  it.each(['', 'H', 'g', 'B♭', 'Bbb', 'C#mm', 'Gmaj', ' G', 'Cm7'])('refuses "%s"', (key) => {
    expect(isKeyName(key)).toBe(false);
  });
});

describe('normalizeKey', () => {
  it.each([
    { typed: 'g', want: 'G' },
    { typed: ' bb ', want: 'Bb' },
    { typed: 'f#m', want: 'F#m' },
    { typed: 'Eb', want: 'Eb' },
    { typed: '', want: '' },
  ])('reads "$typed" as "$want"', ({ typed, want }) => {
    expect(normalizeKey(typed)).toBe(want);
  });
});

describe('effectiveKey', () => {
  it.each([
    { itemKey: null, arrangementKey: 'G', want: 'G' },
    { itemKey: 'Bb', arrangementKey: 'G', want: 'Bb' },
    { itemKey: 'G', arrangementKey: 'G', want: 'G' },
  ])('plays $itemKey over $arrangementKey in $want', ({ itemKey, arrangementKey, want }) => {
    expect(effectiveKey(itemKey, arrangementKey)).toBe(want);
  });
});
