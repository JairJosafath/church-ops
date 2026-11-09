import { describe, expect, it } from 'vitest';

import { decodeCandidate, decodeService, type Candidate, type Need } from './api_types';
import {
  askedFor,
  candidateBadges,
  neededChanges,
  needSummary,
  parseCount,
  servedText,
  teamGroups,
} from './scheduling';
import {
  candidateJson,
  needJson,
  personJson,
  positionJson,
  requestJson,
  serviceJson,
} from './test_fixtures';

const DRUMS = positionJson({ id: 10, name: 'Drums' });
const KEYS = positionJson({ id: 11, name: 'Keys' });
const CAMERA = positionJson({ id: 20, team_id: 6, name: 'Camera' });
const BEN = personJson({ id: 2, name: 'Ben Bakker' });

function candidate(overrides: Record<string, unknown> = {}): Candidate {
  return decodeCandidate(candidateJson(overrides), 'candidate');
}

describe('teamGroups', () => {
  it('groups the needed positions by team, with their requests, in the order needed', () => {
    const service = decodeService(
      serviceJson({
        needed: [
          needJson({ position: DRUMS, count: 1, accepted: 1, open: 0 }),
          needJson({ position: CAMERA, team_name: 'Stream', count: 2, open: 2 }),
          needJson({ position: KEYS, count: 1, open: 1 }),
        ],
        requests: [
          requestJson({ id: 1, position: DRUMS, status: 'accepted' }),
          requestJson({ id: 2, position: KEYS, person: BEN, status: 'cancelled' }),
          requestJson({ id: 3, position: KEYS, person: BEN, status: 'declined' }),
        ],
      }),
      'service',
    );
    const groups = teamGroups(service);
    expect(
      groups.map((group) => ({
        team: group.teamName,
        slots: group.slots.map((slot) => ({
          position: slot.position.name,
          count: slot.need?.count ?? null,
          requests: slot.requests.map((request) => request.id),
        })),
      })),
    ).toEqual([
      {
        team: 'Worship band',
        slots: [
          { position: 'Drums', count: 1, requests: [1] },
          { position: 'Keys', count: 1, requests: [3] },
        ],
      },
      { team: 'Stream', slots: [{ position: 'Camera', count: 2, requests: [] }] },
    ]);
  });

  it('keeps a request for a position the plan does not list as needed', () => {
    const service = decodeService(
      serviceJson({
        needed: [],
        requests: [requestJson({ id: 4, position: CAMERA, team_name: 'Stream' })],
      }),
      'service',
    );
    expect(teamGroups(service)).toMatchObject([
      { teamName: 'Stream', slots: [{ position: { id: 20 }, need: null, requests: [{ id: 4 }] }] },
    ]);
  });

  it('gives no groups for a plan that needs nobody and asked nobody', () => {
    expect(teamGroups(decodeService(serviceJson(), 'service'))).toEqual([]);
  });
});

describe('askedFor', () => {
  const service = decodeService(
    serviceJson({
      requests: [
        requestJson({ id: 1, position: DRUMS, status: 'declined' }),
        requestJson({ id: 2, position: KEYS, status: 'pending' }),
      ],
    }),
    'service',
  );

  it.each([
    { personId: 1, positionId: 11, want: 2 },
    { personId: 1, positionId: 10, want: null },
    { personId: 2, positionId: 11, want: null },
  ])(
    'finds the open request of person $personId for position $positionId',
    ({ personId, positionId, want }) => {
      expect(askedFor(service, personId, positionId)?.id ?? null).toBe(want);
    },
  );
});

describe('candidateBadges', () => {
  it('gives no badge to a free candidate', () => {
    expect(candidateBadges(candidate(), 10)).toEqual([]);
  });

  it.each([
    {
      name: 'a blockout, never its reason',
      overrides: { blocked: true },
      want: [{ label: 'Blocked out', tone: 'error' }],
    },
    {
      name: 'a request at another service the same day',
      overrides: {
        conflicts: [
          {
            service_id: 21,
            service_title: 'Evening service',
            starts_at: '2026-11-15T18:00:00+01:00',
            team_name: 'Worship band',
            position_name: 'Keys',
            status: 'accepted',
          },
        ],
      },
      want: [{ label: 'Same day: Keys at Evening service, 18:00 (confirmed)', tone: 'warning' }],
    },
    {
      name: 'another position at this plan',
      overrides: {
        also_asked: [{ position: CAMERA, team_name: 'Stream', status: 'pending' }],
      },
      want: [{ label: 'Also asked here: Camera (pending)', tone: 'warning' }],
    },
    {
      name: 'a decline at this plan',
      overrides: { declined_here: true },
      want: [{ label: 'Declined at this plan', tone: 'warning' }],
    },
  ])('warns about $name', ({ overrides, want }) => {
    expect(candidateBadges(candidate(overrides), 10)).toEqual(want);
  });

  it('leaves out a request for the same position, which the list shows as asked', () => {
    expect(
      candidateBadges(
        candidate({
          also_asked: [{ position: DRUMS, team_name: 'Worship band', status: 'pending' }],
        }),
        10,
      ),
    ).toEqual([]);
  });
});

describe('servedText', () => {
  it.each([
    { overrides: {}, want: 'Has not served yet' },
    {
      overrides: { last_served_on: '2026-10-04', times_served_90_days: 3 },
      want: 'Last served Sunday 4 October 2026 · 3 times in 90 days',
    },
    {
      overrides: { last_served_on: '2026-01-04', times_served_90_days: 0 },
      want: 'Last served Sunday 4 January 2026 · not in the last 90 days',
    },
    {
      overrides: { last_served_on: '2026-10-04', times_served_90_days: 1 },
      want: 'Last served Sunday 4 October 2026 · once in 90 days',
    },
  ])('says $want', ({ overrides, want }) => {
    expect(servedText(candidate(overrides))).toBe(want);
  });
});

describe('parseCount', () => {
  it.each([
    { text: '', want: 0 },
    { text: ' 2 ', want: 2 },
    { text: '0', want: 0 },
    { text: '99', want: 99 },
    { text: '100', want: null },
    { text: '-1', want: null },
    { text: '1.5', want: null },
    { text: 'twee', want: null },
  ])('reads "$text" as $want', ({ text, want }) => {
    expect(parseCount(text)).toBe(want);
  });
});

describe('neededChanges', () => {
  const needed: readonly Need[] = decodeService(
    serviceJson({
      needed: [needJson({ position: DRUMS, count: 1 }), needJson({ position: KEYS, count: 1 })],
    }),
    'service',
  ).needed;

  it('sends every position wanted, and 0 for one no longer needed', () => {
    expect(
      neededChanges(
        needed,
        new Map([
          [10, 2],
          [11, 0],
          [20, 1],
          [21, 0],
        ]),
      ),
    ).toEqual([
      { positionId: 10, count: 2 },
      { positionId: 11, count: 0 },
      { positionId: 20, count: 1 },
    ]);
  });

  it('keeps a needed position the form did not show', () => {
    expect(neededChanges(needed, new Map([[10, 1]]))).toEqual([
      { positionId: 10, count: 1 },
      { positionId: 11, count: 1 },
    ]);
  });
});

describe('needSummary', () => {
  it.each([
    { need: {}, want: '0 of 1 confirmed' },
    {
      need: { count: 3, accepted: 1, pending: 1, declined: 2 },
      want: '1 of 3 confirmed · 1 pending · 2 declined',
    },
  ])('says $want', ({ need, want }) => {
    const [decoded] = decodeService(serviceJson({ needed: [needJson(need)] }), 's').needed;
    expect(decoded === undefined ? null : needSummary(decoded)).toBe(want);
  });
});
