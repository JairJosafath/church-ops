import { describe, expect, it } from 'vitest';

import { decodeScheduleRequest, type ScheduleRequest } from './api_types';
import { REASON_MAX, reasonError, splitSchedule } from './my_schedule';
import { requestJson } from './test_fixtures';

function request(id: number, status: string, startsAt: string): ScheduleRequest {
  return decodeScheduleRequest(requestJson({ id, status, service_starts_at: startsAt }), 'request');
}

describe('splitSchedule', () => {
  const requests = [
    request(1, 'pending', '2026-11-22T10:00:00+01:00'),
    request(2, 'pending', '2026-11-15T10:00:00+01:00'),
    request(3, 'accepted', '2026-11-29T10:00:00+01:00'),
    request(4, 'accepted', '2026-11-09T10:00:00+01:00'),
    request(5, 'accepted', '2026-11-08T10:00:00+01:00'),
    request(6, 'declined', '2026-11-22T10:00:00+01:00'),
    request(7, 'cancelled', '2026-10-04T10:00:00+02:00'),
    request(8, 'pending', '2026-11-01T10:00:00+01:00'),
  ];

  it('puts what waits for an answer and what is confirmed from today on, soonest first', () => {
    const schedule = splitSchedule(requests, '2026-11-09');
    expect(schedule.pending.map((entry) => entry.id)).toEqual([2, 1]);
    expect(schedule.confirmed.map((entry) => entry.id)).toEqual([4, 3]);
  });

  it('puts the rest, answered or past, latest first', () => {
    expect(splitSchedule(requests, '2026-11-09').earlier.map((entry) => entry.id)).toEqual([
      6, 5, 8, 7,
    ]);
  });

  it('counts the service date in Dutch time', () => {
    // 23:30 UTC on the 8th is already the 9th in Amsterdam.
    const late = [request(9, 'accepted', '2026-11-08T23:30:00Z')];
    expect(splitSchedule(late, '2026-11-09').confirmed.map((entry) => entry.id)).toEqual([9]);
  });
});

describe('reasonError', () => {
  it.each([
    { text: '', want: null },
    { text: 'Away that weekend', want: null },
    { text: 'é'.repeat(REASON_MAX), want: null },
    { text: '🙏'.repeat(REASON_MAX), want: null },
    { text: `  ${'a'.repeat(REASON_MAX)}  `, want: null },
    {
      text: 'a'.repeat(REASON_MAX + 1),
      want: `Keep the reason to ${String(REASON_MAX)} characters; it has ${String(REASON_MAX + 1)}.`,
    },
  ])('says what is wrong with a reason of $text.length characters', ({ text, want }) => {
    expect(reasonError(text)).toBe(want);
  });
});
