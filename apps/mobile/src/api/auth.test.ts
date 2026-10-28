import { isApiError } from "../model/apiError";
import { createSession } from "./auth";
import { memoryKv, PREF_KEYS } from "./prefs";
import { memorySecretStore, SECRET_KEYS } from "./secureStorage";
import { json, scriptedTransport, tokenPairBody } from "./testing";

const NOW = Date.parse("2026-11-01T10:00:00Z");

function setup(replies: Parameters<typeof scriptedTransport>[0], options: { stored?: string; clock?: { now: number } } = {}) {
  const { transport, calls } = scriptedTransport(replies);
  const secure = memorySecretStore(options.stored ? { [SECRET_KEYS.refreshToken]: options.stored } : {});
  const prefs = memoryKv();
  const clock = options.clock ?? { now: NOW };
  const revoke = jest.fn(async () => {});
  const session = createSession({ secure, prefs, origin: "https://api.example.com", transport, now: () => clock.now, revoke });
  return { session, secure, prefs, calls, clock, revoke };
}

test("with no stored refresh token the person is signed out", async () => {
  const { session } = setup([]);
  await session.load();
  expect(session.getState()).toEqual({ status: "signed_out", userId: null });
  expect(await session.accessToken()).toBeNull();
});

test("a stored refresh token means signed in, and the first call refreshes", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, calls } = setup([json(200, pair)], { stored: "refresh-old-0123456789abcdef" });
  await session.load();
  expect(session.getState().status).toBe("signed_in");
  expect(await session.accessToken()).toBe(pair.accessToken);
  expect(JSON.parse(calls[0]?.body as string)).toEqual({ refreshToken: "refresh-old-0123456789abcdef" });
  expect(await secure.get(SECRET_KEYS.refreshToken)).toBe(pair.refreshToken);
  expect(session.getState().userId).toBe("01USER");
});

test("sign in keeps the access token in memory and the refresh token in the keychain", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, prefs, calls } = setup([]);
  await session.load();
  await session.signIn(pair);
  expect(await session.accessToken()).toBe(pair.accessToken);
  expect(calls).toHaveLength(0);
  expect(secure.dump()).toEqual({ [SECRET_KEYS.refreshToken]: pair.refreshToken });
  expect(prefs.getString(PREF_KEYS.userId)).toBe("01USER");
  expect(JSON.stringify(secure.dump())).not.toContain(pair.accessToken);
});

test("parallel callers share one refresh", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { session, calls } = setup([() => json(200, pair)], { stored: "refresh-old-0123456789abcdef" });
  await session.load();
  const results = Promise.all([session.accessToken(), session.accessToken(), session.refreshAfterUnauthorised("stale")]);
  release();
  await gate;
  expect(await results).toEqual([pair.accessToken, pair.accessToken, pair.accessToken]);
  expect(calls).toHaveLength(1);
});

test("a token close to expiry is refreshed before the call", async () => {
  const first = tokenPairBody("01USER", "n1", 20_000, NOW);
  const second = tokenPairBody("01USER", "n2", 900_000, NOW);
  const { session, calls } = setup([json(200, second)]);
  await session.load();
  await session.signIn(first);
  expect(await session.accessToken()).toBe(second.accessToken);
  expect(calls).toHaveLength(1);
});

test("a 401 for a token another request already replaced does not rotate again", async () => {
  const first = tokenPairBody("01USER", "n1", 900_000, NOW);
  const second = tokenPairBody("01USER", "n2", 900_000, NOW);
  const { session, calls } = setup([json(200, second)]);
  await session.load();
  await session.signIn(first);
  await session.signIn(second);
  expect(await session.refreshAfterUnauthorised(first.accessToken)).toBe(second.accessToken);
  expect(calls).toHaveLength(0);
});

test("a refresh the server refuses signs the person out and empties the keychain", async () => {
  const { session, secure, prefs } = setup([json(401, { error: { code: "invalid_refresh", message: "m" } })], {
    stored: "refresh-old-0123456789abcdef",
  });
  const order: string[] = [];
  session.onSignedOut(() => {
    order.push("callback");
  });
  await session.load();
  expect(await session.accessToken()).toBeNull();
  expect(session.getState()).toEqual({ status: "signed_out", userId: null });
  expect(await secure.get(SECRET_KEYS.refreshToken)).toBeNull();
  expect(prefs.getString(PREF_KEYS.userId)).toBeUndefined();
  expect(order).toEqual(["callback"]);
});

test("no network during a refresh is offline, not a sign-out", async () => {
  const { session, secure } = setup([new TypeError("Network request failed")], { stored: "refresh-old-0123456789abcdef" });
  await session.load();
  const error = await session.accessToken().catch((e: unknown) => e);
  expect(isApiError(error) && error.kind).toBe("offline");
  expect(session.getState().status).toBe("signed_in");
  expect(await secure.get(SECRET_KEYS.refreshToken)).toBe("refresh-old-0123456789abcdef");
});

test("a server error during a refresh keeps the session", async () => {
  const { session } = setup([json(503, {})], { stored: "refresh-old-0123456789abcdef" });
  await session.load();
  await expect(session.accessToken()).rejects.toMatchObject({ kind: "offline" });
  expect(session.getState().status).toBe("signed_in");
});

test("sign out tells the server first, then clears everything", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, revoke } = setup([]);
  await session.load();
  await session.signIn(pair);
  await session.signOut();
  expect(revoke).toHaveBeenCalledWith(pair.accessToken);
  expect(secure.dump()).toEqual({});
  expect(session.getState().status).toBe("signed_out");
});

test("subscribers hear about every change", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session } = setup([]);
  const listener = jest.fn();
  session.subscribe(listener);
  await session.load();
  await session.signIn(pair);
  await session.signOut();
  expect(listener).toHaveBeenCalledTimes(3);
});
