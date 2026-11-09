/**
 * A stand-in for the api in component tests: answers each "METHOD /api/path"
 * from a table and records every request, so a test needs no network.
 */
import type { FetchLike } from './api_client';

export interface Reply {
  readonly status?: number;
  readonly json?: unknown;
}

/** A route's answer: the same reply every time, or one made from the request's body. */
export type Route = Reply | ((body: unknown) => Reply);

export interface SentRequest {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

export interface FakeApi {
  readonly fetch: FetchLike;
  readonly sent: SentRequest[];
  /** The requests sent as "METHOD /api/path", in order. */
  readonly sentRoutes: () => string[];
}

/** A fake api that answers from `routes`; anything else is a 404. */
export function fakeApi(routes: Readonly<Record<string, Route>>): FakeApi {
  const sent: SentRequest[] = [];
  const fetch: FetchLike = (url, init) => {
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    sent.push({ method, url, body });
    const route = routes[`${method} ${url}`];
    const reply: Reply =
      route === undefined
        ? { status: 404, json: { detail: 'Not Found' } }
        : typeof route === 'function'
          ? route(body)
          : route;
    const status = reply.status ?? 200;
    return Promise.resolve(
      new Response(status === 204 || reply.json === undefined ? null : JSON.stringify(reply.json), {
        status,
      }),
    );
  };
  return {
    fetch,
    sent,
    sentRoutes: () => sent.map((request) => `${request.method} ${request.url}`),
  };
}
