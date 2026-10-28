import type { QueryClient } from "@tanstack/react-query";
import type { RawResponse, Transport, TransportRequest } from "./client";
import { createAppQueryClient } from "./queryClient";

/** A scripted transport for tests: each call takes the next reply. A reply that is an Error is thrown, as a dead network would. */
export function scriptedTransport(replies: (RawResponse | Error | ((request: TransportRequest) => RawResponse | Error))[]) {
  const calls: TransportRequest[] = [];
  const queue = [...replies];
  const transport: Transport = async (request) => {
    calls.push(request);
    const next = queue.shift();
    if (next === undefined) throw new Error("transport called more often than scripted");
    const reply = typeof next === "function" ? next(request) : next;
    if (reply instanceof Error) throw reply;
    return reply;
  };
  return { transport, calls };
}

export const json = (status: number, body: unknown, retryAfter: string | null = null): RawResponse => ({
  status,
  text: JSON.stringify(body),
  retryAfter,
});

/** A three-part token whose payload carries `sub`, enough for `jwtSubject`. */
export function fakeAccessToken(sub: string, tag = "a"): string {
  return `e30.${btoa(JSON.stringify({ sub, tag })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.sig`;
}

export function tokenPairBody(sub: string, tag: string, expiresInMs: number, now: number) {
  return {
    accessToken: fakeAccessToken(sub, tag),
    accessExpiresAt: new Date(now + expiresInMs).toISOString(),
    refreshToken: `refresh-${tag}-0123456789abcdef`,
    refreshExpiresAt: new Date(now + 30 * 86_400_000).toISOString(),
  };
}

const liveClients: QueryClient[] = [];

/** A real query client for a test. Garbage timers are switched off, or the 24 h ones would keep Jest alive. Call `clearTestClients()` after each test. */
export function testQueryClient(): QueryClient {
  const client = createAppQueryClient();
  const { queries, mutations } = client.getDefaultOptions();
  client.setDefaultOptions({
    queries: { ...queries, gcTime: Number.POSITIVE_INFINITY },
    mutations: { ...mutations, gcTime: Number.POSITIVE_INFINITY },
  });
  liveClients.push(client);
  return client;
}

export function clearTestClients(): void {
  for (const client of liveClients.splice(0)) client.clear();
}

export type RouteReply = RawResponse | Error | ((request: TransportRequest) => RawResponse | Error | Promise<RawResponse | Error>);

/**
 * A transport that answers by route, for screens that make several calls in any order. Keys read `GET /me`, with the path as the
 * app API sees it (after `/api/app/v1`) or, for the catalog, `GET /api/events`. A route with a list of replies gives them in turn and
 * repeats the last. A call to a route nobody scripted is thrown, so a test notices a request it did not expect.
 */
export function routedTransport(routes: Record<string, RouteReply | RouteReply[]>) {
  const calls: TransportRequest[] = [];
  const counters = new Map<string, number>();
  const table = new Map<string, RouteReply | RouteReply[]>(Object.entries(routes));
  const transport: Transport = async (request) => {
    calls.push(request);
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/app\/v1/, "");
    const key = `${request.method} ${path}`;
    const entry = table.get(key) ?? table.get(`${request.method} ${url.pathname}`);
    if (entry === undefined) throw new Error(`no route scripted for ${key}`);
    let reply: RouteReply;
    if (Array.isArray(entry)) {
      const index = counters.get(key) ?? 0;
      counters.set(key, index + 1);
      reply = entry[Math.min(index, entry.length - 1)] as RouteReply;
    } else {
      reply = entry;
    }
    const answer = await (typeof reply === "function" ? reply(request) : reply);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return {
    transport,
    calls,
    /** Change what a route answers from now on, for example to let a retry succeed. */
    set: (key: string, reply: RouteReply | RouteReply[]) => {
      table.set(key, reply);
      counters.delete(key);
    },
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${new URL(c.url).pathname.replace(/^\/api\/app\/v1/, "")}` === key),
  };
}
