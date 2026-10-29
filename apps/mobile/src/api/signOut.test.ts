import { createTestApp, meFixture } from "../providers/testing";
import { fetchMe } from "./me";
import { memoryKv, PREF_KEYS } from "./prefs";
import { SECRET_KEYS } from "./secureStorage";
import { createLocalWipe, endAfterDeletion } from "./signOut";
import { clearTestClients } from "./testing";

afterEach(clearTestClients);

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
  const stopTelemetry = jest.fn(() => void order.push("telemetry"));
  const wipe = createLocalWipe({ prefs, queryClient, persister, flags, clearImages, stopTelemetry } as never);
  return { prefs, order, flags, wipe, clearImages, stopTelemetry };
}

describe("the local wipe", () => {
  it("empties the caches, the small facts, the images and the usage-data choice, and keeps the welcome cards seen", async () => {
    const { prefs, order, flags, wipe } = parts();
    await wipe.run();
    expect(order).toEqual(["telemetry", "query cache", "disk cache", "images"]);
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

  it("does not stay signed in because the images would not clear", async () => {
    const { wipe, clearImages } = parts();
    clearImages.mockRejectedValueOnce(new Error("disk"));
    await expect(wipe.run()).resolves.toBeUndefined();
  });
});

describe("through the app wiring", () => {
  it("sign out removes the device, ends the session on the server, then wipes this phone", async () => {
    const clearImages = jest.fn(async () => {});
    const stopTelemetry = jest.fn();
    const app = await createTestApp({
      me: meFixture(),
      welcomeSeen: true,
      acceptedNotice: "2026-10-26",
      routes: { "POST /auth/sign-out": { status: 204, text: "", retryAfter: null } },
      clearImages,
      stopTelemetry,
    });
    await fetchMe(app.deps.api);
    app.queryClient.setQueryData(["me"], meFixture());
    await app.deps.session.signOut();
    expect(app.transport.callsTo("POST /auth/sign-out")).toHaveLength(1);
    expect(app.queryClient.getQueryData(["me"])).toBeUndefined();
    expect(await app.secure.get(SECRET_KEYS.refreshToken)).toBeNull();
    expect(app.prefs.getString(PREF_KEYS.userId)).toBeUndefined();
    expect(app.prefs.getString(PREF_KEYS.welcomeSeen)).toBe("1");
    expect(app.deps.localFlags.getSnapshot()).toEqual({ welcomeSeen: true, acceptedNotice: null });
    expect(clearImages).toHaveBeenCalledTimes(1);
    expect(stopTelemetry).toHaveBeenCalledTimes(1);
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
