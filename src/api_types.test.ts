import { describe, expect, it } from 'vitest';

import {
  decodeBlockout,
  decodeLiveState,
  decodeScheduleRequest,
  decodeService,
  decodeServiceSummary,
  decodeSong,
  decodeTeam,
} from './api_types';
import { DecodeError } from './decode';
import {
  blockoutJson,
  itemJson,
  liveJson,
  requestJson,
  serviceJson,
  serviceSummaryJson,
  songItemJson,
  songJson,
  teamJson,
} from './test_fixtures';

describe('decodeService', () => {
  it('reads a service with its items and requests in camelCase', () => {
    const service = decodeService(
      serviceJson({
        items: [itemJson(), songItemJson({ position: 1 })],
        requests: [requestJson()],
      }),
      'service',
    );
    expect(service.serviceType).toBe('Sunday morning');
    expect(service.autoSwitch).toBe(false);
    expect(service.items.map((item) => item.kind)).toEqual(['reading', 'song']);
    expect(service.items[1]?.arrangement).toEqual({
      id: 7,
      songTitle: 'Amazing Grace',
      name: 'Default',
      key: 'Bb',
      tempoBpm: 72,
      meter: '4/4',
      sequence: 'V1 C V2 C B C',
      chart: '[G]Amazing grace',
    });
    expect(service.items[1]?.key).toBe('Bb');
    expect(service.requests[0]?.person.name).toBe('Anna de Vries');
  });

  it('ignores fields the contract does not name', () => {
    expect(decodeService(serviceJson({ extra: 'x' }), 'service').id).toBe(20);
  });

  it.each([
    { json: serviceJson({ items: [itemJson({ kind: 'dance' })] }), path: 'service.items[0].kind' },
    {
      json: serviceJson({ items: [itemJson({ length_seconds: '3:00' })] }),
      path: 'service.items[0].length_seconds',
    },
    { json: serviceJson({ streamed: 'yes' }), path: 'service.streamed' },
    { json: serviceJson({ requests: null }), path: 'service.requests' },
    {
      json: serviceJson({ requests: [requestJson({ status: 'maybe' })] }),
      path: 'service.requests[0].status',
    },
  ])('refuses a service with a wrong $path', ({ json, path }) => {
    expect(() => decodeService(json, 'service')).toThrow(DecodeError);
    expect(() => decodeService(json, 'service')).toThrow(`${path}: expected`);
  });
});

describe('the other records', () => {
  it('reads a song with its arrangements', () => {
    expect(decodeSong(songJson(), 'song').arrangements[0]).toEqual({
      id: 7,
      songId: 3,
      name: 'Default',
      key: 'G',
      tempoBpm: 72,
      meter: '4/4',
      lengthSeconds: 300,
      sequence: 'V1 C V2 C B C',
      chart: '[G]Amazing grace',
    });
  });

  it('reads a team with its positions', () => {
    expect(decodeTeam(teamJson(), 'team').positions).toEqual([
      { id: 10, teamId: 5, name: 'Drums' },
    ]);
  });

  it('reads a request', () => {
    const request = decodeScheduleRequest(requestJson({ blocked: true }), 'request');
    expect(request.blocked).toBe(true);
    expect(request.serviceStartsAt).toBe('2026-11-15T10:00:00+01:00');
    expect(request.answeredAt).toBeNull();
  });

  it('reads a service summary', () => {
    expect(decodeServiceSummary(serviceSummaryJson(), 'summary').itemCount).toBe(9);
  });

  it('reads a blockout', () => {
    expect(decodeBlockout(blockoutJson(), 'blockout')).toEqual({
      id: 60,
      personId: 1,
      startsOn: '2026-11-15',
      endsOn: '2026-11-15',
      reason: 'Family visit',
    });
  });

  it('reads a live state with its devices', () => {
    const live = decodeLiveState(liveJson({ next: null }), 'live');
    expect(live.controller.name).toBe('Anna de Vries');
    expect(live.next).toBeNull();
    expect(live.devices).toEqual({ obs: 'ok', ableton: 'unconfigured', updatedAt: null });
  });

  it('refuses a device state the contract does not name', () => {
    expect(() =>
      decodeLiveState(
        liveJson({ devices: { obs: 'green', ableton: 'ok', updated_at: null } }),
        'live',
      ),
    ).toThrow('live.devices.obs: expected one of ok, unreachable, unconfigured, unknown');
  });
});
