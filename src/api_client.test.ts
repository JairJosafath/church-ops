import { describe, expect, it } from 'vitest';

import {
  ApiError,
  createApiClient,
  describeError,
  type ApiClient,
  type ItemInput,
} from './api_client';
import { DecodeError } from './decode';
import {
  blockoutJson,
  itemJson,
  liveJson,
  personJson,
  requestJson,
  serviceJson,
  songJson,
  teamJson,
} from './test_fixtures';

interface Sent {
  readonly url: string;
  readonly method: string | undefined;
  readonly body: unknown;
}

/** A client whose fetch answers `status` with `body` and records what was sent. */
function clientAnswering(status: number, body: unknown): { client: ApiClient; sent: Sent[] } {
  const sent: Sent[] = [];
  const client = createApiClient((url, init) => {
    sent.push({
      url,
      method: init.method,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const text = body === undefined ? '' : JSON.stringify(body);
    return Promise.resolve(new Response(status === 204 ? null : text, { status }));
  }, '/api');
  return { client, sent };
}

const SONG_ITEM: ItemInput = {
  kind: 'song',
  title: 'Amazing Grace',
  lengthSeconds: 300,
  arrangementId: 7,
  key: 'Bb',
  scene: null,
  lowerThird: null,
  offStream: false,
  notes: '',
};

const READING_ITEM: ItemInput = {
  ...SONG_ITEM,
  kind: 'reading',
  title: 'Psalm 23',
  arrangementId: null,
  key: null,
};

describe('the requests the client sends', () => {
  it.each<{
    name: string;
    answer: unknown;
    run: (client: ApiClient) => Promise<unknown>;
    want: Sent;
  }>([
    {
      name: 'listPeople',
      answer: [personJson()],
      run: (client) => client.listPeople(),
      want: { url: '/api/people', method: 'GET', body: undefined },
    },
    {
      name: 'createPerson without e-mail',
      answer: personJson(),
      run: (client) => client.createPerson('Anna', null),
      want: { url: '/api/people', method: 'POST', body: { name: 'Anna' } },
    },
    {
      name: 'createPosition',
      answer: { id: 1, team_id: 5, name: 'Bass' },
      run: (client) => client.createPosition(5, 'Bass'),
      want: { url: '/api/teams/5/positions', method: 'POST', body: { name: 'Bass' } },
    },
    {
      name: 'createTeam',
      answer: teamJson(),
      run: (client) => client.createTeam('Sound'),
      want: { url: '/api/teams', method: 'POST', body: { name: 'Sound' } },
    },
    {
      name: 'createSong without CCLI',
      answer: songJson(),
      run: (client) => client.createSong({ title: 'Psalm 121', authors: '', ccli: null }),
      want: { url: '/api/songs', method: 'POST', body: { title: 'Psalm 121', authors: '' } },
    },
    {
      name: 'createService',
      answer: serviceJson(),
      run: (client) =>
        client.createService({
          title: 'Advent 1',
          serviceType: 'Sunday morning',
          startsAt: '2026-11-29T10:00:00+01:00',
          streamed: false,
        }),
      want: {
        url: '/api/services',
        method: 'POST',
        body: {
          title: 'Advent 1',
          service_type: 'Sunday morning',
          starts_at: '2026-11-29T10:00:00+01:00',
          streamed: false,
        },
      },
    },
    {
      name: 'copyService keeping the title',
      answer: serviceJson(),
      run: (client) =>
        client.copyService(20, { startsAt: '2026-11-22T10:00:00+01:00', title: null }),
      want: {
        url: '/api/services/20/copy',
        method: 'POST',
        body: { starts_at: '2026-11-22T10:00:00+01:00' },
      },
    },
    {
      name: 'createItem for a song',
      answer: itemJson(),
      run: (client) => client.createItem(20, SONG_ITEM),
      want: {
        url: '/api/services/20/items',
        method: 'POST',
        body: {
          kind: 'song',
          title: 'Amazing Grace',
          length_seconds: 300,
          arrangement_id: 7,
          key: 'Bb',
          off_stream: false,
          notes: '',
        },
      },
    },
    {
      name: 'createItem for a reading, without an arrangement',
      answer: itemJson(),
      run: (client) => client.createItem(20, READING_ITEM),
      want: {
        url: '/api/services/20/items',
        method: 'POST',
        body: {
          kind: 'reading',
          title: 'Psalm 23',
          length_seconds: 300,
          off_stream: false,
          notes: '',
        },
      },
    },
    {
      name: 'updateItem, clearing the key',
      answer: itemJson(),
      run: (client) => client.updateItem(20, 100, { ...SONG_ITEM, key: null }),
      want: {
        url: '/api/services/20/items/100',
        method: 'PATCH',
        body: {
          kind: 'song',
          title: 'Amazing Grace',
          length_seconds: 300,
          arrangement_id: 7,
          key: null,
          scene: null,
          lower_third: null,
          off_stream: false,
          notes: '',
        },
      },
    },
    {
      name: 'deleteItem',
      answer: undefined,
      run: (client) => client.deleteItem(20, 100),
      want: { url: '/api/services/20/items/100', method: 'DELETE', body: undefined },
    },
    {
      name: 'reorderItems',
      answer: [itemJson()],
      run: (client) => client.reorderItems(20, [102, 100, 101]),
      want: {
        url: '/api/services/20/items/order',
        method: 'PUT',
        body: { item_ids: [102, 100, 101] },
      },
    },
    {
      name: 'createRequest',
      answer: requestJson(),
      run: (client) => client.createRequest(20, 10, 1),
      want: {
        url: '/api/services/20/requests',
        method: 'POST',
        body: { position_id: 10, person_id: 1 },
      },
    },
    {
      name: 'listRequestsFor',
      answer: [requestJson()],
      run: (client) => client.listRequestsFor(1),
      want: { url: '/api/requests?person_id=1', method: 'GET', body: undefined },
    },
    {
      name: 'answerRequest',
      answer: requestJson({ status: 'declined' }),
      run: (client) => client.answerRequest(50, false),
      want: { url: '/api/requests/50/answer', method: 'POST', body: { accept: false } },
    },
    {
      name: 'createBlockout',
      answer: blockoutJson(),
      run: (client) =>
        client.createBlockout(1, { startsOn: '2026-12-20', endsOn: '2027-01-03', reason: '' }),
      want: {
        url: '/api/people/1/blockouts',
        method: 'POST',
        body: { starts_on: '2026-12-20', ends_on: '2027-01-03', reason: '' },
      },
    },
    {
      name: 'deleteBlockout',
      answer: undefined,
      run: (client) => client.deleteBlockout(60),
      want: { url: '/api/blockouts/60', method: 'DELETE', body: undefined },
    },
    {
      name: 'startLive',
      answer: liveJson(),
      run: (client) => client.startLive(20, 1),
      want: { url: '/api/services/20/live', method: 'POST', body: { controller_id: 1 } },
    },
    {
      name: 'advanceLive',
      answer: liveJson(),
      run: (client) => client.advanceLive(20, 1, 2),
      want: {
        url: '/api/services/20/live/advance',
        method: 'POST',
        body: { person_id: 1, to_index: 2 },
      },
    },
    {
      name: 'handOver',
      answer: liveJson(),
      run: (client) => client.handOver(20, 1, 2),
      want: {
        url: '/api/services/20/live/handover',
        method: 'POST',
        body: { from_person_id: 1, to_person_id: 2 },
      },
    },
    {
      name: 'endLive',
      answer: undefined,
      run: (client) => client.endLive(20),
      want: { url: '/api/services/20/live', method: 'DELETE', body: undefined },
    },
  ])('$name', async ({ answer, run, want }) => {
    const { client, sent } = clientAnswering(answer === undefined ? 204 : 200, answer);
    await run(client);
    expect(sent).toEqual([want]);
  });
});

describe('the answers the client reads', () => {
  it('decodes a service', async () => {
    const { client } = clientAnswering(200, serviceJson({ items: [itemJson()] }));
    const service = await client.getService(20);
    expect(service.items[0]?.title).toBe('Psalm 23');
  });

  it('gives null for a service that is not live', async () => {
    const { client } = clientAnswering(404, { detail: 'Service 20 is not live' });
    await expect(client.getLive(20)).resolves.toBeNull();
  });

  it.each([
    {
      status: 409,
      body: { detail: 'Ben Bakker holds control' },
      detail: 'Ben Bakker holds control',
    },
    {
      status: 422,
      body: { detail: [{ loc: ['body', 'key'], msg: 'Invalid key' }, { msg: 'Too long' }] },
      detail: 'Invalid key; Too long',
    },
    { status: 500, body: 'oops', detail: 'Request failed' },
  ])('throws an ApiError with the detail of a $status', async ({ status, body, detail }) => {
    const { client } = clientAnswering(status, body);
    await expect(client.listTeams()).rejects.toEqual(new ApiError(status, detail));
  });

  it('throws a DecodeError for an answer of the wrong shape', async () => {
    const { client } = clientAnswering(200, [{ id: 'one' }]);
    await expect(client.listSongs()).rejects.toThrow('GET /songs[0].id: expected an integer');
    await expect(client.listPeople()).rejects.toThrow(DecodeError);
  });
});

describe('describeError', () => {
  it.each([
    {
      error: new ApiError(409, 'Anna de Vries holds control'),
      want: 'Anna de Vries holds control',
    },
    {
      error: new ApiError(422, 'Invalid key'),
      want: 'The server refused this: Invalid key. Correct it and try again.',
    },
    {
      error: new ApiError(404, 'Service not found'),
      want: 'Service not found. It may have been removed: reload the page.',
    },
    { error: new ApiError(503, 'down'), want: 'The server failed (503). Try again in a moment.' },
    {
      error: new TypeError('Failed to fetch'),
      want: 'Could not reach the server. Check your connection and try again.',
    },
    { error: 'what', want: 'Something went wrong. Try again.' },
  ])('says what happened for $error', ({ error, want }) => {
    expect(describeError(error)).toBe(want);
  });

  it('names the field of an answer it could not read', () => {
    expect(describeError(new DecodeError('GET /songs[0].title', 'a string'))).toContain(
      'GET /songs[0].title',
    );
  });
});
