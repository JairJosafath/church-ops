import { describe, expect, it } from 'vitest';

import { decodeService } from './api_types';
import { cellSummary, scheduleMatrix } from './matrix';
import { needJson, personJson, positionJson, requestJson, serviceJson } from './test_fixtures';

const DRUMS = positionJson({ id: 10, name: 'Drums' });
const BASS = positionJson({ id: 11, name: 'Bass' });
const CAMERA = positionJson({ id: 20, team_id: 6, name: 'Camera' });

const FIRST = decodeService(
  serviceJson({
    id: 20,
    title: 'Sunday morning',
    needed: [needJson({ position: DRUMS, count: 1, accepted: 1, open: 0 })],
    requests: [
      requestJson({ id: 1, position: DRUMS, status: 'accepted' }),
      requestJson({ id: 2, position: DRUMS, status: 'cancelled' }),
    ],
  }),
  'first',
);

const SECOND = decodeService(
  serviceJson({
    id: 21,
    title: 'Advent 1',
    starts_at: '2026-11-29T10:00:00+01:00',
    needed: [
      needJson({ position: CAMERA, team_name: 'Stream', count: 2, open: 2 }),
      needJson({ position: BASS, count: 1, pending: 1, open: 0 }),
    ],
    requests: [
      requestJson({
        id: 3,
        service_id: 21,
        position: BASS,
        person: personJson({ id: 2, name: 'Ben Bakker' }),
      }),
    ],
  }),
  'second',
);

describe('scheduleMatrix', () => {
  it('puts the plans across and every position needed or asked for down, by team', () => {
    const matrix = scheduleMatrix([FIRST, SECOND]);
    expect(matrix.columns).toEqual([
      { serviceId: 20, title: 'Sunday morning', startsAt: '2026-11-15T10:00:00+01:00' },
      { serviceId: 21, title: 'Advent 1', startsAt: '2026-11-29T10:00:00+01:00' },
    ]);
    expect(
      matrix.teams.map((team) => ({
        team: team.teamName,
        rows: team.rows.map((row) => row.position.name),
      })),
    ).toEqual([
      { team: 'Stream', rows: ['Camera'] },
      { team: 'Worship band', rows: ['Bass', 'Drums'] },
    ]);
  });

  it('gives each cell the plan’s need, its people and its open slots', () => {
    const matrix = scheduleMatrix([FIRST, SECOND]);
    const band = matrix.teams.find((team) => team.teamName === 'Worship band');
    const cells = (name: string): unknown =>
      band?.rows
        .find((row) => row.position.name === name)
        ?.cells.map((cell) => ({
          serviceId: cell.serviceId,
          count: cell.need?.count ?? 0,
          open: cell.open,
          people: cell.requests.map((request) => `${request.person.name} ${request.status}`),
        }));
    expect(cells('Drums')).toEqual([
      { serviceId: 20, count: 1, open: 0, people: ['Anna de Vries accepted'] },
      { serviceId: 21, count: 0, open: 0, people: [] },
    ]);
    expect(cells('Bass')).toEqual([
      { serviceId: 20, count: 0, open: 0, people: [] },
      { serviceId: 21, count: 1, open: 0, people: ['Ben Bakker pending'] },
    ]);
  });

  it('is empty without plans', () => {
    expect(scheduleMatrix([])).toEqual({ columns: [], teams: [] });
  });
});

describe('cellSummary', () => {
  it.each([
    { name: 'Drums', serviceIndex: 0, want: 'Anna de Vries (confirmed)' },
    { name: 'Drums', serviceIndex: 1, want: 'Not needed' },
    { name: 'Bass', serviceIndex: 1, want: 'Ben Bakker (pending)' },
    { name: 'Camera', serviceIndex: 1, want: '2 open' },
  ])('says what $name at plan $serviceIndex holds: $want', ({ name, serviceIndex, want }) => {
    const cell = scheduleMatrix([FIRST, SECOND])
      .teams.flatMap((team) => team.rows)
      .find((row) => row.position.name === name)?.cells[serviceIndex];
    expect(cell === undefined ? null : cellSummary(cell)).toBe(want);
  });
});
