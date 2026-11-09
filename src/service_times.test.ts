import { describe, expect, it } from 'vitest';

import { decodeService } from './api_types';
import { parseRehearsalForm, planTimesOf } from './service_times';
import { planTimeJson, serviceJson } from './test_fixtures';

describe('planTimesOf', () => {
  it('gives the times the api sends, by start', () => {
    const service = decodeService(
      serviceJson({
        times: [
          planTimeJson({
            id: 0,
            kind: 'service',
            name: 'Service',
            starts_at: '2026-11-15T10:00:00+01:00',
          }),
          planTimeJson({ id: 31, starts_at: '2026-11-12T19:30:00+01:00' }),
        ],
      }),
      'service',
    );
    expect(planTimesOf(service).map((time) => time.id)).toEqual([31, 0]);
  });

  it('gives the service itself when the api sends no times', () => {
    const service = decodeService(serviceJson({ ends_at: '2026-11-15T11:15:00+01:00' }), 'service');
    expect(planTimesOf(service)).toEqual([
      {
        id: 0,
        kind: 'service',
        name: 'Service',
        startsAt: '2026-11-15T10:00:00+01:00',
        endsAt: '2026-11-15T11:15:00+01:00',
      },
    ]);
  });
});

describe('parseRehearsalForm', () => {
  it('reads a rehearsal in Dutch time', () => {
    expect(
      parseRehearsalForm({
        name: ' Band rehearsal ',
        startsAt: '2026-11-12T19:30',
        endsAt: '2026-11-12T21:30',
      }),
    ).toEqual({
      ok: true,
      rehearsal: {
        name: 'Band rehearsal',
        startsAt: '2026-11-12T19:30:00+01:00',
        endsAt: '2026-11-12T21:30:00+01:00',
      },
    });
  });

  it.each([
    {
      fields: { name: '', startsAt: '2026-11-12T19:30', endsAt: '2026-11-12T21:30' },
      errors: { name: 'Name the rehearsal.' },
    },
    {
      fields: { name: 'Band', startsAt: '', endsAt: '2026-11-12T21:30' },
      errors: { startsAt: 'Choose when it starts.' },
    },
    {
      fields: { name: 'Band', startsAt: '2026-11-12T19:30', endsAt: '' },
      errors: { endsAt: 'Choose when it ends.' },
    },
    {
      fields: { name: 'Band', startsAt: '2026-11-12T19:30', endsAt: '2026-11-12T19:30' },
      errors: { endsAt: 'It ends after it starts.' },
    },
  ])('refuses $fields', ({ fields, errors }) => {
    expect(parseRehearsalForm(fields)).toEqual({ ok: false, errors });
  });
});
