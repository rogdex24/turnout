import { describe, expect, test } from "bun:test";
import { registerDeviceResponseSchema } from "@turnout/contract/app/devices";
import { NOTICE_PUSH_TEXT, pushPayloadSchema } from "@turnout/contract/app/notices";
import { appResponse, createAppContext, runTickerPass } from "../src/app-api/index.js";
import { addNotice } from "../src/social/notices.js";
import { acquireLease, finishLease, leaseStatus, TICK_LEASE } from "../src/social/tick.js";
import { BASE, TEST_TOKEN, type TestApp, testApp } from "./appHelpers.js";
import { cleanPng } from "./fixtures/tickets/index.js";
import { makePlan, memberSession, type Session } from "./helpers/appFixture.js";
import { SHOW_START, seedMember, seedShow, waitingPlan } from "./helpers/socialFixture.js";
import { memoryDb } from "./helpers.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

const pass = (t: TestApp) => runTickerPass(t.app, "test-holder");

function notice(
  t: TestApp,
  who: Session,
  kind: "ticket_approved" | "head_over" | "thread_message" = "ticket_approved",
  planId: string | null = null,
): string {
  t.clock.advance(5);
  const id = addNotice(t.db, {
    memberId: who.memberId,
    kind,
    planId,
    groupId: null,
    dedupeKey: `${kind}:${t.clock().getTime()}`,
    now: t.clock(),
  });
  if (id === null) throw new Error("notice not added");
  return id;
}

const register = async (t: TestApp, who: Session, token: string, platform: "android" | "ios" = "android") => {
  const response = await t.call("POST", "/devices", { token: who.token, body: { expoPushToken: token, platform } });
  return registerDeviceResponseSchema.parse(await response.json()).deviceId;
};

const pushState = (t: TestApp, id: string) =>
  (t.db.query("SELECT push_state FROM notice WHERE id = ?").get(id) as { push_state: string }).push_state;
const deliveries = (t: TestApp) =>
  t.db.query("SELECT notice_id, device_id, expo_ticket_id, status, error_code FROM push_delivery ORDER BY id").all() as {
    notice_id: string;
    device_id: string;
    expo_ticket_id: string | null;
    status: string;
    error_code: string | null;
  }[];
const claimedAt = (t: TestApp, id: string) =>
  (t.db.query("SELECT claimed_at FROM notice WHERE id = ?").get(id) as { claimed_at: string | null }).claimed_at;
const deviceOff = (t: TestApp, id: string) =>
  (t.db.query("SELECT disabled_at FROM device WHERE id = ?").get(id) as { disabled_at: string | null }).disabled_at;

describe("pushes", () => {
  test("a notice is sent once with the fixed generic text and a payload of ids and the kind", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    seedShow(t.db, { id: "show-a" });
    const plan = await makePlan(t, a, "show-a");
    const id = notice(t, a, "head_over", plan.id);
    expect((await pass(t)).ran).toBe(true);
    expect(t.push.sent).toHaveLength(1);
    const [message] = t.push.sent;
    expect(message).toMatchObject({ token: TOKEN_A, title: NOTICE_PUSH_TEXT.head_over.title, body: NOTICE_PUSH_TEXT.head_over.body });
    expect(pushPayloadSchema.parse(message?.data)).toEqual({ kind: "head_over", noticeId: id, planId: plan.id });
    expect(pushState(t, id)).toBe("sent");
    expect(deliveries(t)).toMatchObject([{ notice_id: id, status: "ticketed", error_code: null }]);
    t.clock.advance(MINUTE);
    await pass(t);
    expect(t.push.sent).toHaveLength(1);
  });

  test("a push names its Android channel, and thread pushes of one plan share a group", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    seedShow(t.db, { id: "show-a" });
    const plan = await makePlan(t, a, "show-a");
    notice(t, a, "ticket_approved", plan.id);
    notice(t, a, "head_over", plan.id);
    notice(t, a, "thread_message", plan.id);
    await pass(t);
    const sent = Object.fromEntries(t.push.sent.map((m) => [m.data.kind, { channelId: m.channelId, groupKey: m.groupKey }]));
    expect(sent).toEqual({
      ticket_approved: { channelId: "plans", groupKey: null },
      head_over: { channelId: "show-day", groupKey: null },
      thread_message: { channelId: "thread", groupKey: `thread:${plan.id}` },
    });
  });

  test("the push time to live is the notice's own, so a late push is never delivered after it went stale", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    const id = notice(t, a, "head_over");
    const row = t.db.query("SELECT created_at, stale_after FROM notice WHERE id = ?").get(id) as {
      created_at: string;
      stale_after: string;
    };
    await pass(t);
    const expected = Math.floor((Date.parse(row.stale_after) - t.clock().getTime()) / 1000);
    expect(t.push.sent[0]?.ttlSeconds).toBe(Math.max(60, expected));
  });

  test("a member with only an iOS device is closed as not_sent, and one with no device as no_device", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const b = await memberSession(t, 1);
    await register(t, a, TOKEN_A, "ios");
    const iosOnly = notice(t, a);
    const nobody = notice(t, b);
    await pass(t);
    expect(t.push.sent).toEqual([]);
    expect(pushState(t, iosOnly)).toBe("not_sent");
    expect(pushState(t, nobody)).toBe("no_device");
    expect(deliveries(t)).toEqual([]);
  });

  test("a notice past its stale time is closed as stale and not sent, and it stays in the list", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    const id = notice(t, a, "head_over");
    t.clock.advance(3 * HOUR);
    a.token = (await t.signIn(a.phone)).accessToken;
    await pass(t);
    expect(t.push.sent).toEqual([]);
    expect(pushState(t, id)).toBe("stale");
    const listed = (await (await t.call("GET", "/notices", { token: a.token })).json()) as { notices: { id: string }[] };
    expect(listed.notices.map((n) => n.id)).toEqual([id]);
  });

  test("when the push service cannot be reached the notice stays pending and goes out on a later pass", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    const id = notice(t, a);
    t.push.unreachable = true;
    await pass(t);
    expect(pushState(t, id)).toBe("pending");
    expect(deliveries(t)).toEqual([]);
    expect(t.logs.some((l) => l.method === "TICK" && l.route === "push")).toBe(true);
    expect(claimedAt(t, id)).toBeNull();
    t.push.unreachable = false;
    t.clock.advance(30_000);
    await pass(t);
    expect(pushState(t, id)).toBe("sent");
    expect(t.push.sent).toHaveLength(1);
  });

  test("a second holder after the lease ran out does not send a notice the first is still sending", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    const id = notice(t, a);
    let release: () => void = () => {};
    const stuck = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = t.app.push.send.bind(t.app.push);
    let calls = 0;
    t.app.push.send = async (messages) => {
      calls += 1;
      if (calls === 1) await stuck;
      return real(messages);
    };
    const first = runTickerPass(t.app, "holder-one");
    await Bun.sleep(20);
    expect(pushState(t, id)).toBe("sending");
    expect((await runTickerPass(t.app, "holder-two")).ran).toBe(false);
    t.db.query("DELETE FROM scheduler_lease").run();
    expect((await runTickerPass(t.app, "holder-two")).ran).toBe(true);
    expect(calls).toBe(1);
    release();
    await first;
    expect(pushState(t, id)).toBe("sent");
    expect(t.push.sent).toHaveLength(1);
  });

  test("DeviceNotRegistered switches the device off, and a notice whose only device is gone is no_device", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const device = await register(t, a, TOKEN_A);
    t.push.failTokens.set(TOKEN_A, "DeviceNotRegistered");
    const id = notice(t, a);
    await pass(t);
    expect(deviceOff(t, device)).not.toBeNull();
    expect(pushState(t, id)).toBe("no_device");
    expect(deliveries(t)).toMatchObject([{ status: "device_gone", error_code: "DeviceNotRegistered" }]);
  });

  test("one gone device and one good one: the notice is sent and only the gone one is switched off", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const gone = await register(t, a, TOKEN_A);
    const good = await register(t, a, TOKEN_B);
    t.push.failTokens.set(TOKEN_A, "DeviceNotRegistered");
    const id = notice(t, a);
    await pass(t);
    expect(pushState(t, id)).toBe("sent");
    expect(deviceOff(t, gone)).not.toBeNull();
    expect(deviceOff(t, good)).toBeNull();
  });
});

describe("receipts", () => {
  test("are read about 15 minutes after the send, once each", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    notice(t, a);
    await pass(t);
    const ticket = deliveries(t)[0]?.expo_ticket_id as string;
    t.push.receiptFor.set(ticket, { ok: true });
    t.clock.advance(10 * MINUTE);
    await pass(t);
    expect(deliveries(t)[0]?.status).toBe("ticketed");
    t.clock.advance(6 * MINUTE);
    await pass(t);
    expect(deliveries(t)[0]?.status).toBe("delivered");
  });

  test("a DeviceNotRegistered receipt switches the device off", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const device = await register(t, a, TOKEN_A);
    notice(t, a);
    await pass(t);
    const ticket = deliveries(t)[0]?.expo_ticket_id as string;
    t.push.receiptFor.set(ticket, { ok: false, errorCode: "DeviceNotRegistered", gone: true });
    t.clock.advance(16 * MINUTE);
    await pass(t);
    expect(deliveries(t)[0]).toMatchObject({ status: "device_gone", error_code: "DeviceNotRegistered" });
    expect(deviceOff(t, device)).not.toBeNull();
  });

  test("a delivery with no receipt after two days is closed as failed", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    notice(t, a);
    await pass(t);
    t.clock.advance(49 * HOUR);
    await pass(t);
    expect(deliveries(t)[0]).toMatchObject({ status: "failed", error_code: "no_receipt" });
  });
});

describe("operator alerts", () => {
  test("an alert whose delivery failed is sent again on the next pass, and once it went out never again", async () => {
    const t = await testApp();
    seedShow(t.db, { id: "show-a" });
    waitingPlan(t.db, seedMember(t.db, t.clock(), { handle: "pending" }), "show-a", t.clock());
    t.clock.set(new Date(Date.parse(SHOW_START) - 36 * HOUR));
    const real = t.app.alerts.notify.bind(t.app.alerts);
    let failing = true;
    t.app.alerts.notify = async (kind, text) => {
      if (failing) throw new Error("alert client down");
      return real(kind, text);
    };
    await pass(t);
    expect(t.alerts.sent).toEqual([]);
    failing = false;
    t.clock.advance(30_000);
    await pass(t);
    expect(t.alerts.sent.map((a) => a.kind.split(":")[0])).toEqual(["handle_due"]);
    t.clock.advance(30_000);
    await pass(t);
    expect(t.alerts.sent).toHaveLength(1);
  });
});

describe("the lease", () => {
  test("a pass while another holder has the lease does nothing, and the lease is given up after each pass", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    await register(t, a, TOKEN_A);
    const id = notice(t, a);
    expect(acquireLease(t.db, TICK_LEASE, "other-process", t.clock(), 60)).toBe(true);
    expect(await pass(t)).toEqual({ ran: false });
    expect(pushState(t, id)).toBe("pending");
    finishLease(t.db, TICK_LEASE, "other-process", t.clock());
    expect(await pass(t)).toEqual({ ran: true });
    expect(pushState(t, id)).toBe("sent");
    // Released: a second holder can run straight away.
    expect(await runTickerPass(t.app, "another")).toEqual({ ran: true });
  });

  test("a lease that ran out is taken over", async () => {
    const t = await testApp();
    acquireLease(t.db, TICK_LEASE, "crashed", t.clock(), 60);
    expect(await pass(t)).toEqual({ ran: false });
    t.clock.advance(61_000);
    expect(await pass(t)).toEqual({ ran: true });
  });

  test("/health takes the database write lock at most once in five seconds", async () => {
    const t = await testApp();
    let locks = 0;
    const real = t.db.transaction.bind(t.db);
    t.db.transaction = ((fn: never) => {
      locks += 1;
      return real(fn);
    }) as typeof t.db.transaction;
    for (let i = 0; i < 20; i++) expect((await t.call("GET", "/health")).status).toBe(200);
    expect(locks).toBe(1);
    t.clock.advance(5_000);
    await t.call("GET", "/health");
    expect(locks).toBe(2);
  });

  test("/health shows no tick before the first pass and its age after it", async () => {
    const t = await testApp();
    const first = (await (await t.call("GET", "/health")).json()) as { status: string; ticker: { lastTickAgeSeconds: number | null } };
    expect(first).toEqual({ status: "ok", ticker: { lastTickAgeSeconds: null } });
    await pass(t);
    t.clock.advance(45_000);
    const later = (await (await t.call("GET", "/health")).json()) as { ticker: { lastTickAgeSeconds: number | null } };
    expect(later.ticker.lastTickAgeSeconds).toBe(45);
    expect(leaseStatus(t.db)?.lastTickAt).not.toBeNull();
  });
});

describe("ticket files", () => {
  async function planWithFile(t: TestApp) {
    seedShow(t.db, { id: "show-a" });
    const a = await memberSession(t, 0);
    const plan = await makePlan(t, a, "show-a");
    const sent = await t.call("PUT", `/plans/${plan.id}/ticket`, { token: a.token, rawBody: cleanPng() });
    expect(sent.status).toBe(200);
    const row = t.db.query("SELECT id, object_key FROM ticket_proof").get() as { id: string; object_key: string };
    return { a, plan, row };
  }

  test("are deleted from the store 24 hours after the show starts, and the row keeps no key", async () => {
    const t = await testApp();
    const { row } = await planWithFile(t);
    await pass(t);
    expect(await t.app.store.get(row.object_key)).not.toBeNull();
    t.clock.set(new Date(Date.parse(SHOW_START) + 24 * HOUR));
    await pass(t);
    expect(await t.app.store.get(row.object_key)).toBeNull();
    expect(t.db.query("SELECT object_key, sha256, file_deleted_at FROM ticket_proof").get()).toMatchObject({
      object_key: null,
      sha256: null,
      file_deleted_at: t.clock().toISOString(),
    });
  });

  test("go at once when the plan is withdrawn", async () => {
    const t = await testApp();
    const { a, plan, row } = await planWithFile(t);
    expect((await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token })).status).toBe(200);
    await pass(t);
    expect(await t.app.store.get(row.object_key)).toBeNull();
  });

  test("are still deleted when the push step fails in the same pass", async () => {
    const t = await testApp();
    const { a, plan, row } = await planWithFile(t);
    await register(t, a, TOKEN_A);
    notice(t, a);
    t.push.unreachable = true;
    await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token });
    await pass(t);
    expect(await t.app.store.get(row.object_key)).toBeNull();
  });

  test("a store that cannot delete leaves the key for the next pass", async () => {
    const t = await testApp();
    const { a, plan, row } = await planWithFile(t);
    await t.call("POST", `/plans/${plan.id}/withdraw`, { token: a.token });
    const real = t.app.store.delete.bind(t.app.store);
    let broken = true;
    t.app.store.delete = async (key: string) => {
      if (broken) throw new Error("store down");
      return real(key);
    };
    await pass(t);
    expect(t.db.query("SELECT object_key FROM ticket_proof").get()).toEqual({ object_key: row.object_key });
    broken = false;
    await pass(t);
    expect(t.db.query("SELECT object_key FROM ticket_proof").get()).toEqual({ object_key: null });
  });
});

describe("/__test/clock with tick", () => {
  test("runs one ticker pass on a staging server", async () => {
    const db = memoryDb();
    const staging = await createAppContext({ db, env: { TURNOUT_ENV: "staging", STAGING_TEST_TOKEN: TEST_TOKEN } });
    const member = seedMember(db, staging.now());
    const id = addNotice(db, {
      memberId: member,
      kind: "ticket_approved",
      planId: null,
      groupId: null,
      dedupeKey: "k",
      now: staging.now(),
    });
    expect(leaseStatus(db)).toBeNull();
    const response = await appResponse(
      staging,
      new Request(`http://localhost${BASE}/__test/clock`, {
        method: "POST",
        headers: { "x-staging-test-token": TEST_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({ advanceMs: 0, tick: true }),
      }),
    );
    expect(response.status).toBe(200);
    expect(leaseStatus(db)?.lastTickAt).not.toBeNull();
    expect((db.query("SELECT push_state FROM notice WHERE id = ?").get(id) as { push_state: string }).push_state).toBe("no_device");
  });

  test("a tick that is not literally true is 400", async () => {
    const db = memoryDb();
    const staging = await createAppContext({ db, env: { TURNOUT_ENV: "staging", STAGING_TEST_TOKEN: TEST_TOKEN } });
    const response = await appResponse(
      staging,
      new Request(`http://localhost${BASE}/__test/clock`, {
        method: "POST",
        headers: { "x-staging-test-token": TEST_TOKEN, "content-type": "application/json" },
        body: JSON.stringify({ tick: false }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
