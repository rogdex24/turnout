import { createTestApp, meFixture } from "../providers/testing";
import { fetchMe } from "./me";
import { CACHE_STORE_KEY } from "./persister";
import { memoryKv, PREF_KEYS } from "./prefs";
import { SECRET_KEYS } from "./secureStorage";
import { createLocalWipe, endAfterDeletion } from "./signOut";
import { clearTestClients, json } from "./testing";

afterEach(clearTestClients);

/** Lets the background calls after a sign-out run to their end. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function parts() {
  const prefs = memoryKv();
  prefs.set(PREF_KEYS.welcomeSeen, "1");
  prefs.set(PREF_KEYS.acceptedNotice, "2026-10-26");
  prefs.set(PREF_KEYS.analyticsConsent, "1");
  prefs.set("confirmedPlayed:plan-1", "1");
  const order: string[] = [];
  const queryClient = { clear: () => order.push("query cache") };
  const persister = { removeClient: () => void order.push("disk cache") };
  const flags = { refresh: jest.fn() };
  const clearImages = jest.fn(async () => void order.push("images"));
  const clearPickedFiles = jest.fn(async () => void order.push("picked files"));
  const clearNotifications = jest.fn(async () => void order.push("notifications"));
  const stopTelemetry = jest.fn(() => void order.push("telemetry"));
  const wipe = createLocalWipe({
    prefs,
    queryClient,
    persister,
    flags,
    clearImages,
    clearPickedFiles,
    clearNotifications,
    stopTelemetry,
  } as never);
  return { prefs, order, flags, wipe, clearImages, clearPickedFiles, clearNotifications, persister, stopTelemetry };
}

describe("the local wipe", () => {
  it("empties the caches, the small facts, the images, the picked files, the notifications and the usage-data choice, and keeps the welcome cards seen", async () => {
    const { prefs, order, flags, wipe } = parts();
    await wipe.run();
    expect(order).toEqual(["telemetry", "query cache", "disk cache", "images", "picked files", "notifications"]);
    expect(prefs.getString(PREF_KEYS.acceptedNotice)).toBeUndefined();
    expect(prefs.getString(PREF_KEYS.analyticsConsent)).toBeUndefined();
    expect(prefs.getString("confirmedPlayed:plan-1")).toBeUndefined();
    expect(prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
    expect(flags.refresh).toHaveBeenCalledTimes(1);
  });

  it("forgets the welcome cards once when asked, then goes back to keeping them", async () => {
    const { prefs, wipe } = parts();
    wipe.forgetWelcomeToo();
    await wipe.run();
    expect(prefs.getString(PREF_KEYS.welcomeSeen)).toBeUndefined();
    prefs.set(PREF_KEYS.welcomeSeen, "1");
    await wipe.run();
    expect(prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
  });

  it("runs every step even when one fails, then reports the first failure", async () => {
    const { wipe, clearImages, clearPickedFiles, clearNotifications, persister, prefs } = parts();
    persister.removeClient = () => {
      throw new Error("disk");
    };
    clearImages.mockRejectedValueOnce(new Error("images"));
    await expect(wipe.run()).rejects.toThrow("disk");
    expect(clearPickedFiles).toHaveBeenCalledTimes(1);
    expect(clearNotifications).toHaveBeenCalledTimes(1);
    expect(prefs.getString(PREF_KEYS.acceptedNotice)).toBeUndefined();
  });
});

describe("through the app wiring", () => {
  it("sign out wipes this phone, then removes the device and ends the session on the server", async () => {
    const clearImages = jest.fn(async () => {});
    const clearPickedFiles = jest.fn(async () => {});
    const clearNotifications = jest.fn(async () => {});
    const stopTelemetry = jest.fn();
    const app = await createTestApp({
      me: meFixture(),
      welcomeSeen: true,
      acceptedNotice: "2026-10-26",
      routes: { "POST /auth/sign-out": { status: 204, text: "", retryAfter: null } },
      clearImages,
      clearPickedFiles,
      clearNotifications,
      stopTelemetry,
    });
    await fetchMe(app.deps.api);
    app.queryClient.setQueryData(["me"], meFixture());
    await app.deps.session.signOut();
    await settle();
    expect(app.transport.callsTo("POST /auth/sign-out")).toHaveLength(1);
    expect(app.queryClient.getQueryData(["me"])).toBeUndefined();
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
    expect(app.deps.localFlags.getSnapshot()).toEqual({ welcomeSeen: true, acceptedNotice: null });
    expect(clearImages).toHaveBeenCalledTimes(1);
    expect(clearPickedFiles).toHaveBeenCalledTimes(1);
    expect(clearNotifications).toHaveBeenCalledTimes(1);
    expect(stopTelemetry).toHaveBeenCalledTimes(1);
  });

  it("a refresh the server refuses wipes the phone and signs out, with no sign-out call", async () => {
    const wiped = {
      images: jest.fn(async () => {}),
      files: jest.fn(async () => {}),
      notices: jest.fn(async () => {}),
      telemetry: jest.fn(),
    };
    const app = await createTestApp({
      me: meFixture(),
      welcomeSeen: true,
      acceptedNotice: "2026-10-26",
      routes: { "POST /auth/refresh": json(401, { error: "invalid_refresh_token" }) },
      clearImages: wiped.images,
      clearPickedFiles: wiped.files,
      clearNotifications: wiped.notices,
      stopTelemetry: wiped.telemetry,
    });
    app.queryClient.setQueryData(["me"], meFixture());
    app.cacheStore.set(CACHE_STORE_KEY, "{}");
    app.prefs.set("confirmedPlayed:plan-1", "1");
    await expect(fetchMe(app.deps.api)).rejects.toBeDefined();
    expect(app.deps.session.getState()).toEqual({ status: "signed_out", userId: null });
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.acceptedNotice)).toBeUndefined();
    expect(app.prefs.getString("confirmedPlayed:plan-1")).toBeUndefined();
    expect(app.queryClient.getQueryData(["me"])).toBeUndefined();
    expect(app.cacheStore.getString(CACHE_STORE_KEY)).toBeUndefined();
    expect(wiped.images).toHaveBeenCalledTimes(1);
    expect(wiped.files).toHaveBeenCalledTimes(1);
    expect(wiped.notices).toHaveBeenCalledTimes(1);
    expect(wiped.telemetry).toHaveBeenCalledTimes(1);
    expect(app.transport.callsTo("POST /auth/sign-out")).toHaveLength(0);
  });

  it("sign out with no network still wipes the phone and empties the keychain", async () => {
    const app = await createTestApp({
      me: meFixture(),
      welcomeSeen: true,
      acceptedNotice: "2026-10-26",
      routes: { "POST /auth/sign-out": new TypeError("Network request failed") },
    });
    await fetchMe(app.deps.api);
    app.cacheStore.set(CACHE_STORE_KEY, "{}");
    await expect(app.deps.session.signOut()).resolves.toBeUndefined();
    await settle();
    expect(app.deps.session.getState().status).toBe("signed_out");
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.acceptedNotice)).toBeUndefined();
    expect(app.cacheStore.getString(CACHE_STORE_KEY)).toBeUndefined();
  });

  it("sign out starts with the phone's own wipe, so the server calls cannot hold it", async () => {
    const app = await createTestApp({
      me: meFixture(),
      routes: { "POST /auth/sign-out": () => new Promise<never>(() => {}) },
    });
    await fetchMe(app.deps.api);
    await app.deps.session.signOut();
    expect(app.deps.session.getState().status).toBe("signed_out");
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
  });

  it("a wipe step that throws still ends the session and empties the keychain", async () => {
    const stopTelemetry = jest.fn();
    const app = await createTestApp({
      me: meFixture(),
      welcomeSeen: true,
      routes: { "POST /auth/sign-out": { status: 204, text: "", retryAfter: null } },
      clearImages: async () => {
        throw new Error("image cache");
      },
      stopTelemetry,
    });
    await fetchMe(app.deps.api);
    app.cacheStore.set(CACHE_STORE_KEY, "{}");
    await expect(app.deps.session.signOut()).resolves.toBeUndefined();
    expect(app.deps.session.getState()).toEqual({ status: "signed_out", userId: null });
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.cacheStore.getString(CACHE_STORE_KEY)).toBeUndefined();
    expect(stopTelemetry).toHaveBeenCalledTimes(1);
  });

  it("the real cache persister writes nothing after sign-out, even when a late cache event arrives", async () => {
    jest.useFakeTimers();
    try {
      const app = await createTestApp({ me: meFixture(), routes: { "POST /auth/sign-out": { status: 204, text: "", retryAfter: null } } });
      await fetchMe(app.deps.api);
      await app.deps.session.signOut();
      const late = { timestamp: 1, buster: "x", clientState: { queries: [], mutations: [] } };
      void app.deps.persister.persistClient(late);
      jest.advanceTimersByTime(5000);
      expect(app.cacheStore.getString(CACHE_STORE_KEY)).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it("after deletion the session ends on the phone only and the phone starts at Welcome", async () => {
    const app = await createTestApp({ me: meFixture(), welcomeSeen: true, acceptedNotice: "2026-10-26" });
    await endAfterDeletion(app.deps.session, app.deps.wipe);
    expect(app.transport.callsTo("POST /auth/sign-out")).toHaveLength(0);
    expect(app.deps.session.getState().status).toBe("signed_out");
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.deps.localFlags.getSnapshot()).toEqual({ welcomeSeen: false, acceptedNotice: null });
  });
});
