import { describe, expect, it } from 'vitest';

import { decodeServiceType } from './api_types';
import {
  describeRehearsal,
  parseServiceTypeForm,
  serviceTypeFormFields,
} from './service_type_form';
import { serviceTypeJson } from './test_fixtures';

describe('parseServiceTypeForm', () => {
  it('reads a type that rehearses before it starts', () => {
    expect(
      parseServiceTypeForm({
        name: ' Sunday morning ',
        startTime: '9:30',
        rehearsalOffset: ' 90 ',
      }),
    ).toEqual({
      ok: true,
      serviceType: { name: 'Sunday morning', startTime: '09:30', rehearsalOffsetMinutes: 90 },
    });
  });

  it('reads a type with no rehearsal, starting at 10:00 when no time is given', () => {
    expect(parseServiceTypeForm({ name: 'Prayer', startTime: '', rehearsalOffset: '' })).toEqual({
      ok: true,
      serviceType: { name: 'Prayer', startTime: '10:00', rehearsalOffsetMinutes: null },
    });
  });

  it.each([
    { change: { name: ' ' }, errors: { name: 'Name the service type.' } },
    { change: { startTime: '24:00' }, errors: { startTime: 'Give a time such as 10:00.' } },
    { change: { startTime: '10.30' }, errors: { startTime: 'Give a time such as 10:00.' } },
    {
      change: { rehearsalOffset: '-5' },
      errors: { rehearsalOffset: 'Give the minutes from 0 to 1440, or leave it blank.' },
    },
    {
      change: { rehearsalOffset: '1441' },
      errors: { rehearsalOffset: 'Give the minutes from 0 to 1440, or leave it blank.' },
    },
  ])('refuses $change', ({ change, errors }) => {
    expect(
      parseServiceTypeForm({ name: 'Sunday', startTime: '10:00', rehearsalOffset: '', ...change }),
    ).toEqual({ ok: false, errors });
  });

  it('fills the form from a type, so saving it unchanged changes nothing', () => {
    const serviceType = decodeServiceType(serviceTypeJson(), 'type');
    const fields = serviceTypeFormFields(serviceType);
    expect(fields).toEqual({ name: 'Sunday morning', startTime: '10:00', rehearsalOffset: '90' });
    expect(parseServiceTypeForm(fields)).toEqual({
      ok: true,
      serviceType: { name: 'Sunday morning', startTime: '10:00', rehearsalOffsetMinutes: 90 },
    });
  });
});

describe('describeRehearsal', () => {
  it.each([
    { offset: null, want: 'No rehearsal' },
    { offset: 0, want: 'Rehearses at the start time' },
    { offset: 1, want: 'Rehearses 1 minute before' },
    { offset: 90, want: 'Rehearses 90 minutes before' },
  ])('says $want', ({ offset, want }) => {
    expect(describeRehearsal(offset)).toBe(want);
  });
});
