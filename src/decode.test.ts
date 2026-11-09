import { describe, expect, it } from 'vitest';

import {
  arrayOf,
  DecodeError,
  decodeBoolean,
  decodeInteger,
  decodeObject,
  decodeString,
  field,
  fieldOr,
  isRecord,
  nullable,
  oneOf,
} from './decode';

describe('isRecord', () => {
  it.each([
    { value: {}, want: true },
    { value: { a: 1 }, want: true },
    { value: [], want: false },
    { value: null, want: false },
    { value: 'x', want: false },
  ])('says $value is an object: $want', ({ value, want }) => {
    expect(isRecord(value)).toBe(want);
  });
});

describe('decoders', () => {
  it.each([
    { name: 'string', run: () => decodeString('Zoë', 'p'), want: 'Zoë' },
    { name: 'integer', run: () => decodeInteger(42, 'p'), want: 42 },
    { name: 'boolean', run: () => decodeBoolean(false, 'p'), want: false },
    { name: 'nullable null', run: () => nullable(decodeString)(null, 'p'), want: null },
    { name: 'nullable value', run: () => nullable(decodeString)('a', 'p'), want: 'a' },
    { name: 'array', run: () => arrayOf(decodeInteger)([1, 2], 'p'), want: [1, 2] },
    { name: 'oneOf', run: () => oneOf(['ok', 'unknown'])('ok', 'p'), want: 'ok' },
  ])('reads a $name', ({ run, want }) => {
    expect(run()).toEqual(want);
  });

  it.each([
    {
      name: 'a number as a string',
      run: () => decodeString(1, 'p'),
      message: 'p: expected a string',
    },
    {
      name: 'a fraction as an integer',
      run: () => decodeInteger(1.5, 'p'),
      message: 'p: expected an integer',
    },
    {
      name: 'a string as an integer',
      run: () => decodeInteger('1', 'p'),
      message: 'p: expected an integer',
    },
    {
      name: 'null as a boolean',
      run: () => decodeBoolean(null, 'p'),
      message: 'p: expected a boolean',
    },
    {
      name: 'an object as an array',
      run: () => arrayOf(decodeInteger)({}, 'p'),
      message: 'p: expected an array',
    },
    {
      name: 'a bad entry',
      run: () => arrayOf(decodeInteger)([1, 'x'], 'p'),
      message: 'p[1]: expected an integer',
    },
    {
      name: 'an unknown member',
      run: () => oneOf(['ok'])('nope', 'p'),
      message: 'p: expected one of ok',
    },
    {
      name: 'an array as an object',
      run: () => decodeObject([], 'p'),
      message: 'p: expected an object',
    },
    {
      name: 'a missing field',
      run: () => field({}, 'id', decodeInteger, 'p'),
      message: 'p.id: expected an integer',
    },
  ])('refuses $name', ({ run, message }) => {
    expect(run).toThrow(DecodeError);
    expect(run).toThrow(message);
  });
});

// v0.2 songs and plans
// v0.2 scheduling

describe('fieldOr', () => {
  it.each([
    { record: { tags: ['hymn'] }, want: ['hymn'] },
    { record: {}, want: [] },
  ])('reads $record, or the fallback when the field is missing', ({ record, want }) => {
    expect(fieldOr(record, 'tags', arrayOf(decodeString), [], 'song')).toEqual(want);
  });

  it.each([
    { record: {}, want: [] },
    { record: { ids: [3, 4] }, want: [3, 4] },
  ])('reads $record, with the fallback when the field is missing', ({ record, want }) => {
    expect(fieldOr(record, 'ids', arrayOf(decodeInteger), [], 'p')).toEqual(want);
  });

  it('still refuses a field of the wrong shape', () => {
    expect(() => fieldOr({ tags: 'hymn' }, 'tags', arrayOf(decodeString), [], 'song')).toThrow(
      'song.tags: expected an array',
    );
  });

  it('still refuses a field that is there with the wrong shape', () => {
    expect(() => fieldOr({ ids: null }, 'ids', arrayOf(decodeInteger), [], 'p')).toThrow(
      'p.ids: expected an array',
    );
  });
});
