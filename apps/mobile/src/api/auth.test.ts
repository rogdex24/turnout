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
  const revoke = jest.fn(async (_accessToken: string) => {});
  const startRevoke = jest.fn(() => revoke);
  const session = createSession({ secure, prefs, origin: "https://api.example.com", transport, now: () => clock.now, startRevoke });
  return { session, secure, prefs, calls, clock, revoke, startRevoke };
}

/** Lets the background revoke run to its end. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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

test("sign out clears the phone first, then tells the server with the token it held", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, prefs, revoke, startRevoke } = setup([]);
  await session.load();
  await session.signIn(pair);
  await session.signOut();
  expect(startRevoke).toHaveBeenCalledTimes(1);
  expect(secure.dump()).toEqual({});
  expect(prefs.getString(PREF_KEYS.userId)).toBeUndefined();
  expect(session.getState().status).toBe("signed_out");
  await settle();
  expect(revoke).toHaveBeenCalledWith(pair.accessToken);
});

test("sign out does not wait for the server", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, revoke } = setup([]);
  revoke.mockImplementation(() => new Promise<void>(() => {}));
  await session.load();
  await session.signIn(pair);
  await session.signOut();
  await settle();
  expect(revoke).toHaveBeenCalled();
  expect(secure.dump()).toEqual({});
  expect(session.getState().status).toBe("signed_out");
});

test("sign out with no network still clears the phone", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, revoke } = setup([]);
  revoke.mockRejectedValue(new TypeError("Network request failed"));
  await session.load();
  await session.signIn(pair);
  await expect(session.signOut()).resolves.toBeUndefined();
  await settle();
  expect(secure.dump()).toEqual({});
  expect(session.getState().status).toBe("signed_out");
});

test("a callback that throws does not keep the keychain, the member id or the state from ending", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, prefs } = setup([]);
  const second = jest.fn();
  session.onSignedOut(() => {
    throw new Error("wipe failed");
  });
  session.onSignedOut(second);
  await session.load();
  await session.signIn(pair);
  await expect(session.signOut()).resolves.toBeUndefined();
  expect(second).toHaveBeenCalledTimes(1);
  expect(secure.dump()).toEqual({});
  expect(prefs.getString(PREF_KEYS.userId)).toBeUndefined();
  expect(session.getState()).toEqual({ status: "signed_out", userId: null });
});

test("a keychain that will not empty still leaves the session signed out, and the fault is reported", async () => {
  const pair = tokenPairBody("01USER", "n1", 900_000, NOW);
  const { session, secure, prefs } = setup([]);
  await session.load();
  await session.signIn(pair);
  jest.spyOn(secure, "remove").mockRejectedValue(new Error("keychain"));
  await expect(session.signOut()).rejects.toThrow("keychain");
  expect(prefs.getString(PREF_KEYS.userId)).toBeUndefined();
  expect(session.getState().status).toBe("signed_out");
});

test("sign out with no access token yet gets one from a refresh before it tells the server", async () => {
  const pair = tokenPairBody("01USER", "n2", 900_000, NOW);
  const { session, secure, calls, revoke } = setup([json(200, pair)], { stored: "refresh-old-0123456789abcdef" });
  await session.load();
  await session.signOut();
  expect(session.getState().status).toBe("signed_out");
  expect(secure.dump()).toEqual({});
  await settle();
  expect(JSON.parse(calls[0]?.body as string)).toEqual({ refreshToken: "refresh-old-0123456789abcdef" });
  expect(revoke).toHaveBeenCalledWith(pair.accessToken);
  expect(secure.dump()).toEqual({});
});

test("sign out with a token about to expire gets a fresh one first", async () => {
  const stale = tokenPairBody("01USER", "n1", 10_000, NOW);
  const fresh = tokenPairBody("01USER", "n2", 900_000, NOW);
  const { session, revoke, calls } = setup([json(200, fresh)]);
  await session.load();
  await session.signIn(stale);
  await session.signOut();
  await settle();
  expect(calls).toHaveLength(1);
  expect(revoke).toHaveBeenCalledWith(fresh.accessToken);
});

test("a refresh that is refused at sign-out still ends the session and tries the token it held", async () => {
  const stale = tokenPairBody("01USER", "n1", 10_000, NOW);
  const { session, secure, revoke } = setup([json(401, {})]);
  await session.load();
  await session.signIn(stale);
  await session.signOut();
  await settle();
  expect(secure.dump()).toEqual({});
  expect(revoke).toHaveBeenCalledWith(stale.accessToken);
});

test("a refresh that lands after sign-out does not sign the person back in", async () => {
  const pair = tokenPairBody("01USER", "n2", 900_000, NOW);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const secure = memorySecretStore({ [SECRET_KEYS.refreshToken]: "refresh-old-0123456789abcdef" });
  const session = createSession({
    secure,
    prefs: memoryKv(),
    origin: "https://api.example.com",
    transport: async () => {
      await gate;
      return json(200, pair);
    },
    now: () => NOW,
  });
  await session.load();
  const pending = session.accessToken();
  await session.signOut();
  release();
  await pending;
  await settle();
  expect(session.getState().status).toBe("signed_out");
  expect(secure.dump()).toEqual({});
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
