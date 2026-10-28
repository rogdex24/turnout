import { describe, expect, test } from "bun:test";
import { registerDeviceResponseSchema } from "@turnout/contract/app/devices";
import { errorBodySchema } from "@turnout/contract/app/errors";
import { noticeListResponseSchema, noticeReadResponseSchema } from "@turnout/contract/app/notices";
import { addNotice } from "../src/social/notices.js";
import { type TestApp, testApp } from "./appHelpers.js";
import { memberSession, type Session } from "./helpers/appFixture.js";

const errorOf = async (response: Response) => errorBodySchema.parse(await response.json()).error;
const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

/** Adds a notice a millisecond after the last one, so their ids sort in the order they were made. */
function notice(t: TestApp, who: Session, kind: "ticket_approved" | "group_confirmed" | "head_over", key: string): string {
  t.clock.advance(5);
  const id = addNotice(t.db, { memberId: who.memberId, kind, planId: null, groupId: null, dedupeKey: key, now: t.clock() });
  if (id === null) throw new Error("notice not added");
  return id;
}

const list = async (t: TestApp, who: Session, query = "") =>
  noticeListResponseSchema.parse(await (await t.call("GET", `/notices${query}`, { token: who.token })).json()).notices;

describe("notices", () => {
  test("lists the caller's notices oldest first, with ids and kinds only", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    const first = notice(t, a, "ticket_approved", "k1");
    const second = notice(t, a, "group_confirmed", "k2");
    notice(t, b, "head_over", "k3");
    const notices = await list(t, a);
    expect(notices.map((n) => [n.id, n.kind, n.readAt])).toEqual([
      [first, "ticket_approved", null],
      [second, "group_confirmed", null],
    ]);
    expect(Object.keys(notices[0] ?? {}).sort()).toEqual(["createdAt", "groupId", "id", "kind", "planId", "readAt"]);
  });

  test("`after` gives only the newer ones, and an unknown parameter is 400", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const first = notice(t, a, "ticket_approved", "k1");
    const second = notice(t, a, "group_confirmed", "k2");
    expect((await list(t, a, `?after=${first}`)).map((n) => n.id)).toEqual([second]);
    expect(await list(t, a, `?after=${second}`)).toEqual([]);
    const bad = await t.call("GET", "/notices?since=1", { token: a.token });
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).code).toBe("invalid_request");
  });

  test("a notice for someone else is never listed or marked", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    const mine = notice(t, a, "ticket_approved", "k1");
    const theirs = notice(t, b, "ticket_approved", "k2");
    const marked = noticeReadResponseSchema.parse(
      await (await t.call("POST", "/notices/read", { token: a.token, body: { upTo: theirs } })).json(),
    );
    expect(marked.marked).toBe(1);
    expect((await list(t, a))[0]?.id).toBe(mine);
    expect((await list(t, b))[0]?.readAt).toBeNull();
  });

  test("marking up to an id sets readAt once, and marking again changes nothing", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const first = notice(t, a, "ticket_approved", "k1");
    notice(t, a, "group_confirmed", "k2");
    const once = noticeReadResponseSchema.parse(
      await (await t.call("POST", "/notices/read", { token: a.token, body: { upTo: first } })).json(),
    );
    expect(once.marked).toBe(1);
    const stamp = (await list(t, a))[0]?.readAt;
    expect(stamp).toBe(t.clock().toISOString());
    t.clock.advance(60_000);
    const twice = noticeReadResponseSchema.parse(
      await (await t.call("POST", "/notices/read", { token: a.token, body: { upTo: first } })).json(),
    );
    expect(twice.marked).toBe(0);
    const after = await list(t, a);
    expect(after[0]?.readAt).toBe(stamp ?? null);
    expect(after[1]?.readAt).toBeNull();
  });

  test("a read body with another field is 400", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const response = await t.call("POST", "/notices/read", { token: a.token, body: { upTo: "x", all: true } });
    expect(response.status).toBe(400);
  });
});

describe("devices", () => {
  const register = (t: TestApp, who: Session, body: unknown) => t.call("POST", "/devices", { token: who.token, body });
  const devices = (t: TestApp) =>
    t.db.query("SELECT id, member_id, session_id, expo_token, platform, disabled_at FROM device ORDER BY id").all() as {
      id: string;
      member_id: string;
      session_id: string;
      expo_token: string;
      platform: string;
      disabled_at: string | null;
    }[];

  test("registers a push token for the caller's session", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const response = await register(t, a, { expoPushToken: TOKEN_A, platform: "android" });
    expect(response.status).toBe(200);
    const { deviceId } = registerDeviceResponseSchema.parse(await response.json());
    expect(devices(t)).toMatchObject([
      { id: deviceId, member_id: a.memberId, expo_token: TOKEN_A, platform: "android", disabled_at: null },
    ]);
  });

  test("twenty registrations an hour for a member, then 429; another member is not held up", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    for (let i = 0; i < 20; i++) expect((await register(t, a, { expoPushToken: TOKEN_A, platform: "android" })).status).toBe(200);
    const refused = await register(t, a, { expoPushToken: TOKEN_A, platform: "android" });
    expect(refused.status).toBe(429);
    expect((await errorOf(refused)).code).toBe("rate_limited");
    expect((await register(t, b, { expoPushToken: TOKEN_B, platform: "android" })).status).toBe(200);
  });

  test("the same token again is the same device, and a token from another member moves to the new member", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    const one = registerDeviceResponseSchema.parse(await (await register(t, a, { expoPushToken: TOKEN_A, platform: "android" })).json());
    const two = registerDeviceResponseSchema.parse(await (await register(t, a, { expoPushToken: TOKEN_A, platform: "android" })).json());
    expect(two.deviceId).toBe(one.deviceId);
    await register(t, b, { expoPushToken: TOKEN_A, platform: "android" });
    expect(devices(t)).toMatchObject([{ member_id: b.memberId }]);
  });

  test("a token that is not an Expo token, an unknown platform and an extra field are 400", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    for (const body of [
      { expoPushToken: "fcm-token-123456789", platform: "android" },
      { expoPushToken: TOKEN_A, platform: "windows" },
      { expoPushToken: TOKEN_A, platform: "android", name: "Asha's phone" },
      { platform: "android" },
    ]) {
      const response = await register(t, a, body);
      expect(response.status).toBe(400);
      expect((await errorOf(response)).code).toBe("invalid_request");
    }
    expect(devices(t)).toEqual([]);
  });

  test("DELETE removes the caller's own device with 204", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const { deviceId } = registerDeviceResponseSchema.parse(
      await (await register(t, a, { expoPushToken: TOKEN_A, platform: "android" })).json(),
    );
    const removed = await t.call("DELETE", `/devices/${deviceId}`, { token: a.token });
    expect(removed.status).toBe(204);
    expect(devices(t)).toEqual([]);
    expect((await t.call("DELETE", `/devices/${deviceId}`, { token: a.token })).status).toBe(404);
  });

  test("someone else's device and a missing one are the same 404, and the device stays", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    const { deviceId } = registerDeviceResponseSchema.parse(
      await (await register(t, a, { expoPushToken: TOKEN_A, platform: "android" })).json(),
    );
    const foreign = await t.call("DELETE", `/devices/${deviceId}`, { token: b.token });
    const missing = await t.call("DELETE", "/devices/01hzzzzzzzzzzzzzzzzzzzzzzz", { token: b.token });
    expect([foreign.status, missing.status]).toEqual([404, 404]);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(devices(t)).toHaveLength(1);
  });

  test("signing out removes that session's device and no other", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, { expoPushToken: TOKEN_A, platform: "android" });
    const second = await t.signIn(a.phone);
    await t.call("POST", "/devices", { token: second.accessToken, body: { expoPushToken: TOKEN_B, platform: "ios" } });
    expect(devices(t)).toHaveLength(2);
    expect((await t.call("POST", "/auth/sign-out", { token: second.accessToken })).status).toBe(204);
    expect(devices(t).map((d) => d.expo_token)).toEqual([TOKEN_A]);
  });
});
