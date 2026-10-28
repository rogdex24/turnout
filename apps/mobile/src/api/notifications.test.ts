import { createApiClient } from "./client";
import { createConnectivity } from "./connectivity";
import {
  findNotice,
  foregroundBehavior,
  holdThreadPushes,
  type PushNative,
  type PushPermission,
  registerDevice,
  removeDeviceOnSignOut,
  resolveTapRoute,
} from "./notifications";
import { memoryKv, PREF_KEYS } from "./prefs";
import { json, type RouteReply, routedTransport } from "./testing";

const TOKEN = "ExponentPushToken[abcdefghijklmnop]";

function setup(routes: Record<string, RouteReply | RouteReply[]>) {
  const net = routedTransport(routes);
  const api = createApiClient({
    origin: "http://test.local",
    session: { accessToken: async () => "tok", refreshAfterUnauthorised: async () => null, signOut: async () => undefined },
    connectivity: createConnectivity(),
    transport: net.transport,
  });
  return { net, api, prefs: memoryKv() };
}

interface FakeOptions {
  platform?: PushNative["platform"];
  permission?: PushPermission;
  afterAsk?: PushPermission;
  expoToken?: PushNative["expoToken"];
}

function fakeNative(over: FakeOptions = {}) {
  let current: PushPermission = over.permission ?? { status: "undetermined", canAskAgain: true };
  const asked = jest.fn();
  const native: PushNative = {
    platform: over.platform ?? "android",
    permission: async () => current,
    requestPermission: async () => {
      asked();
      current = over.afterAsk ?? { status: "granted", canAskAgain: true };
      return current;
    },
    expoToken: over.expoToken ?? (async () => TOKEN),
    setUpChannels: async () => undefined,
    onTap: () => () => undefined,
    setForegroundHandler: () => undefined,
  };
  return { native, asked };
}

const granted: PushPermission = { status: "granted", canAskAgain: true };
const base = { pushEnabled: { android: true, ios: false }, userId: "member-1", mayAsk: true };

describe("registerDevice", () => {
  it("sends the token and the platform and keeps the device id", async () => {
    const { api, net, prefs } = setup({ "POST /devices": json(200, { deviceId: "dev1" }) });
    const { native } = fakeNative({ permission: granted });
    expect(await registerDevice({ api, prefs, native, ...base })).toEqual({ kind: "registered", deviceId: "dev1" });
    const [call] = net.callsTo("POST /devices");
    expect(JSON.parse((call as unknown as { body: string }).body)).toEqual({ expoPushToken: TOKEN, platform: "android" });
    expect(JSON.parse(prefs.getString(PREF_KEYS.pushDevice) ?? "")).toEqual({ userId: "member-1", token: TOKEN, deviceId: "dev1" });
  });

  it("asks once for the permission when it may, then registers", async () => {
    const { api, prefs } = setup({ "POST /devices": json(200, { deviceId: "dev1" }) });
    const { native, asked } = fakeNative();
    expect((await registerDevice({ api, prefs, native, ...base })).kind).toBe("registered");
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("does not ask before the person has a plan", async () => {
    const { api, prefs, net } = setup({});
    const { native, asked } = fakeNative();
    expect(await registerDevice({ api, prefs, native, ...base, mayAsk: false })).toEqual({ kind: "skipped", reason: "not_asked" });
    expect(asked).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it("sends nothing when the person said no, and does not ask again", async () => {
    const { api, prefs, net } = setup({});
    const { native, asked } = fakeNative({ permission: { status: "denied", canAskAgain: false } });
    expect(await registerDevice({ api, prefs, native, ...base })).toEqual({ kind: "skipped", reason: "denied" });
    expect(asked).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it("skips iOS because the server says push is off there", async () => {
    const { api, prefs, net } = setup({});
    const { native, asked } = fakeNative({ platform: "ios", permission: granted });
    expect(await registerDevice({ api, prefs, native, ...base })).toEqual({ kind: "skipped", reason: "platform_off" });
    expect(asked).not.toHaveBeenCalled();
    expect(net.calls).toHaveLength(0);
  });

  it("skips Android when the server turns it off, and when nobody is signed in", async () => {
    const { api, prefs } = setup({});
    const { native } = fakeNative({ permission: granted });
    expect((await registerDevice({ api, prefs, native, ...base, pushEnabled: { android: false, ios: false } })).kind).toBe("skipped");
    expect((await registerDevice({ api, prefs, native, ...base, userId: null })).kind).toBe("skipped");
  });

  it("skips quietly when the build has no push token", async () => {
    const { api, prefs } = setup({});
    const { native } = fakeNative({
      permission: granted,
      expoToken: async () => {
        throw new Error("no project id");
      },
    });
    expect(await registerDevice({ api, prefs, native, ...base })).toEqual({ kind: "skipped", reason: "no_token" });
  });

  it("does not send the same token twice for the same person, but does for the next person on the phone", async () => {
    const { api, prefs, net } = setup({ "POST /devices": json(200, { deviceId: "dev1" }) });
    const { native } = fakeNative({ permission: granted });
    await registerDevice({ api, prefs, native, ...base });
    expect(await registerDevice({ api, prefs, native, ...base })).toEqual({ kind: "unchanged" });
    await registerDevice({ api, prefs, native, ...base, userId: "member-2" });
    expect(net.callsTo("POST /devices")).toHaveLength(2);
  });
});

describe("removeDeviceOnSignOut", () => {
  it("deletes the device with the token the session still holds, and forgets it", async () => {
    const { api, net, prefs } = setup({ "DELETE /devices/dev1": { status: 204, text: "", retryAfter: null } });
    prefs.set(PREF_KEYS.pushDevice, JSON.stringify({ userId: "member-1", token: TOKEN, deviceId: "dev1" }));
    await removeDeviceOnSignOut(api, prefs)("last-token");
    const [call] = net.callsTo("DELETE /devices/dev1") as unknown as { headers: Record<string, string> }[];
    expect(call?.headers.authorization).toBe("Bearer last-token");
    expect(prefs.getString(PREF_KEYS.pushDevice)).toBeUndefined();
  });

  it("does nothing for a phone that never registered, and does not fail when the network is down", async () => {
    const { api, net, prefs } = setup({ "DELETE /devices/dev1": new Error("offline") });
    await removeDeviceOnSignOut(api, prefs)("t");
    expect(net.calls).toHaveLength(0);
    prefs.set(PREF_KEYS.pushDevice, JSON.stringify({ userId: "member-1", token: TOKEN, deviceId: "dev1" }));
    await expect(removeDeviceOnSignOut(api, prefs)("t")).resolves.toBeUndefined();
  });
});

const notice = (id: string, groupId: string | null = "g1") => ({
  id,
  kind: "meet_card_live",
  planId: "p1",
  groupId,
  createdAt: "2026-11-07T10:30:00.000Z",
  readAt: null,
});

describe("findNotice", () => {
  it("finds the notice in the list", async () => {
    const { api } = setup({ "GET /notices": json(200, { notices: [notice("n1"), notice("n2", "g2")] }) });
    expect((await findNotice(api, "n2"))?.groupId).toBe("g2");
  });

  it("reads the next page when the first is full, and stops at a short one", async () => {
    const first = Array.from({ length: 100 }, (_, i) => notice(`n${String(i).padStart(3, "0")}`));
    const { api, net } = setup({
      "GET /notices": (request) =>
        json(200, { notices: new URL(request.url).searchParams.get("after") === "n099" ? [notice("n100", "g9")] : first }),
    });
    expect((await findNotice(api, "n100"))?.groupId).toBe("g9");
    expect(await findNotice(api, "missing")).toBeNull();
    expect(net.callsTo("GET /notices").length).toBe(4);
  });
});

describe("resolveTapRoute", () => {
  const data = (kind: string) => ({ kind, noticeId: "n1", planId: "p1" });

  it("opens the meet card for the group the notice names", async () => {
    const { api } = setup({ "GET /notices": json(200, { notices: [notice("n1", "g7")] }) });
    expect(await resolveTapRoute(api, data("meet_card_live"))).toBe("/groups/g7/meet");
  });

  it("does not read notices for a kind that opens the plan", async () => {
    const { api, net } = setup({});
    expect(await resolveTapRoute(api, data("group_confirmed"))).toBe("/plans/p1");
    expect(net.calls).toHaveLength(0);
  });

  it("opens the plan when the notice cannot be read, and Home for data that is not ours", async () => {
    const { api } = setup({ "GET /notices": new Error("offline") });
    expect(await resolveTapRoute(api, data("head_over"))).toBe("/plans/p1");
    expect(await resolveTapRoute(api, { kind: "promo", noticeId: "x", planId: null })).toBe("/");
    expect(await resolveTapRoute(api, null)).toBe("/");
  });
});

describe("foregroundBehavior", () => {
  const thread = { kind: "thread_message", noticeId: "n1", planId: "p1" };

  it("shows a push while the app is open", async () => {
    const { api } = setup({});
    expect((await foregroundBehavior(api, { kind: "group_changed", noticeId: "n1", planId: "p1" })).shouldShowBanner).toBe(true);
  });

  it("hides a message for the thread that is open, and shows it for any other", async () => {
    const { api } = setup({ "GET /notices": json(200, { notices: [notice("n1", "g1")] }) });
    expect((await foregroundBehavior(api, thread)).shouldShowBanner).toBe(true);
    const release = holdThreadPushes("g1");
    expect((await foregroundBehavior(api, thread)).shouldShowBanner).toBe(false);
    release();
    const releaseOther = holdThreadPushes("g2");
    expect((await foregroundBehavior(api, thread)).shouldShowBanner).toBe(true);
    releaseOther();
  });

  it("shows the push when the notice cannot be read", async () => {
    const { api } = setup({ "GET /notices": new Error("offline") });
    const release = holdThreadPushes("g1");
    expect((await foregroundBehavior(api, thread)).shouldShowBanner).toBe(true);
    release();
  });
});
