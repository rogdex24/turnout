import { z } from "zod";
import { isApiError } from "../model/apiError";
import { buildUrl, createApiClient, type SessionPort } from "./client";
import { createConnectivity } from "./connectivity";
import { json, scriptedTransport } from "./testing";

const schema = z.object({ ok: z.boolean() });

function session(overrides: Partial<SessionPort> = {}): SessionPort & { state: { signedOut: number } } {
  const state = { signedOut: 0 };
  return {
    accessToken: async () => "tok-1",
    refreshAfterUnauthorised: async () => "tok-2",
    signOut: async () => {
      state.signedOut += 1;
    },
    ...overrides,
    state,
  };
}

function setup(replies: Parameters<typeof scriptedTransport>[0], port: SessionPort = session()) {
  const { transport, calls } = scriptedTransport(replies);
  const connectivity = createConnectivity();
  const client = createApiClient({ origin: "https://api.example.com/", session: port, connectivity, transport });
  return { client, calls, connectivity };
}

test("builds app and origin urls with an encoded query", () => {
  expect(buildUrl("https://api.example.com/", "app", "/me")).toBe("https://api.example.com/api/app/v1/me");
  expect(buildUrl("https://api.example.com", "origin", "/api/events", { q: "a b", page: 2, skip: undefined })).toBe(
    "https://api.example.com/api/events?q=a%20b&page=2",
  );
});

test("asks for a fresh answer, so the platform HTTP cache cannot answer for the server", async () => {
  const { client, calls } = setup([json(200, { ok: true })]);
  await client.request({ root: "origin", path: "/api/events", schema, auth: false });
  expect(calls[0]?.headers["cache-control"]).toBe("no-cache");
});

test("sends the bearer token and parses the answer", async () => {
  const { client, calls } = setup([json(200, { ok: true })]);
  await expect(client.request({ path: "/me", schema })).resolves.toEqual({ ok: true });
  expect(calls[0]?.headers.authorization).toBe("Bearer tok-1");
  expect(calls[0]?.url).toBe("https://api.example.com/api/app/v1/me");
});

test("public routes send no token and never ask the session for one", async () => {
  const accessToken = jest.fn(async () => "tok-1");
  const { client, calls } = setup([json(200, { ok: true })], session({ accessToken }));
  await client.request({ path: "/config", auth: false, schema });
  expect(accessToken).not.toHaveBeenCalled();
  expect(calls[0]?.headers.authorization).toBeUndefined();
});

test("a JSON body sets the content type and idempotency headers pass through", async () => {
  const { client, calls } = setup([json(200, { ok: true })]);
  await client.request({ method: "POST", path: "/x", body: { a: 1 }, headers: { "idempotency-key": "k1" }, schema });
  expect(calls[0]?.body).toBe('{"a":1}');
  expect(calls[0]?.headers["content-type"]).toBe("application/json");
  expect(calls[0]?.headers["idempotency-key"]).toBe("k1");
});

test("a response that does not match the schema is a server error", async () => {
  const { client } = setup([json(200, { ok: "yes" })]);
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("server");
  expect(isApiError(error) && error.code).toBe("bad_response");
});

test("each status maps to one error kind", async () => {
  const cases: [number, string][] = [
    [400, "validation"],
    [403, "forbidden"],
    [404, "not_found"],
    [429, "rate_limited"],
    [503, "server"],
  ];
  for (const [status, kind] of cases) {
    const { client } = setup([json(status, { error: { code: "x", message: "m" } })]);
    const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
    expect(isApiError(error) && error.kind).toBe(kind);
  }
});

test("a dead network is offline and flips the connectivity flag, and any answer flips it back", async () => {
  const { client, connectivity } = setup([new TypeError("Network request failed"), json(200, { ok: true })]);
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("offline");
  expect(connectivity.isOffline()).toBe(true);
  await client.request({ path: "/me", schema });
  expect(connectivity.isOffline()).toBe(false);
});

test("a 401 refreshes once and retries with the new token", async () => {
  const refreshAfterUnauthorised = jest.fn(async () => "tok-2");
  const { client, calls } = setup([json(401, {}), json(200, { ok: true })], session({ refreshAfterUnauthorised }));
  await expect(client.request({ path: "/me", schema })).resolves.toEqual({ ok: true });
  expect(refreshAfterUnauthorised).toHaveBeenCalledWith("tok-1");
  expect(calls.map((c) => c.headers.authorization)).toEqual(["Bearer tok-1", "Bearer tok-2"]);
});

test("a second 401 signs the person out and fails as unauthorised", async () => {
  const port = session();
  const { client, calls } = setup([json(401, {}), json(401, {})], port);
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("unauthorised");
  expect(port.state.signedOut).toBe(1);
  expect(calls).toHaveLength(2);
});

test("a 401 when the refresh was refused stops without a second request", async () => {
  const { client, calls } = setup([json(401, {})], session({ refreshAfterUnauthorised: async () => null }));
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("unauthorised");
  expect(calls).toHaveLength(1);
});

test("signed out means unauthorised before any request", async () => {
  const { client, calls } = setup([], session({ accessToken: async () => null }));
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("unauthorised");
  expect(calls).toHaveLength(0);
});

test("rate limited carries Retry-After", async () => {
  const { client } = setup([json(429, { error: { code: "rate_limited", message: "m" } }, "42")]);
  const error = await client.request({ path: "/me", schema }).catch((e: unknown) => e);
  expect(isApiError(error) && error.retryAfterSeconds).toBe(42);
});
