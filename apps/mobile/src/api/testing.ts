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
