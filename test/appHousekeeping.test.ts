import { describe, expect, test } from "bun:test";
import { ALERT_TIMEOUT_MS, createAlerts, recordingAlerts } from "../src/app-api/alerts.js";
import { housekeeping, sweepFiles, sweepRows } from "../src/app-api/housekeeping.js";
import { addNotice } from "../src/social/notices.js";
import { PHONES, testApp } from "./appHelpers.js";
import { cleanPng } from "./fixtures/tickets/index.js";
import { makePlan, memberSession } from "./helpers/appFixture.js";
import { seedShow } from "./helpers/socialFixture.js";

const count = (db: import("bun:sqlite").Database, table: string): number =>
  (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe("housekeeping", () => {
  test("old challenges, long-dead sessions and finished counters go; fresh rows and the send counter stay", async () => {
    const t = await testApp();
    await t.signIn(PHONES[0] as string);
    expect(count(t.db, "otp_challenge")).toBe(1);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "otp_challenge")).toBe(1);
    expect(count(t.db, "auth_session")).toBe(1);
    const buckets = count(t.db, "rate_bucket");
    t.clock.advance(2 * 24 * 60 * 60 * 1000);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "otp_challenge")).toBe(0);
    expect(count(t.db, "auth_session")).toBe(1);
    // Every window is over; only the send counter (kept 62 days) is left.
    const left = t.db.query("SELECT bucket_key FROM rate_bucket").all() as { bucket_key: string }[];
    expect(buckets).toBeGreaterThan(1);
    expect(left.map((row) => row.bucket_key)).toEqual(["otp:sends"]);
    t.clock.advance(65 * 24 * 60 * 60 * 1000);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "rate_bucket")).toBe(0);
    expect(count(t.db, "auth_session")).toBe(0);
  });

  test("a revoked session is kept for the retention period, then goes", async () => {
    const t = await testApp();
    const tokens = await t.signIn(PHONES[0] as string);
    await t.call("POST", "/auth/sign-out", { token: tokens.accessToken });
    t.clock.advance(6 * 24 * 60 * 60 * 1000);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "auth_session")).toBe(1);
    t.clock.advance(2 * 24 * 60 * 60 * 1000);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "auth_session")).toBe(0);
  });

  test("the file sweep deletes files no profile points at, once a day, and only after the grace hour", async () => {
    const t = await testApp();
    await t.app.store.put("photos/orphan/one.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(await sweepFiles(t.app, t.clock())).toEqual([]);
    await t.app.store.put("photos/orphan/two.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    // Already ran today, so even after the grace hour nothing goes until tomorrow.
    t.clock.advance(2 * 60 * 60 * 1000);
    expect(await sweepFiles(t.app, t.clock())).toEqual([]);
    t.clock.advance(24 * 60 * 60 * 1000);
    expect((await sweepFiles(t.app, t.clock())).sort()).toEqual(["photos/orphan/one.jpg", "photos/orphan/two.jpg"]);
    expect(await t.app.store.list("")).toHaveLength(0);
  });

  test("the file sweep leaves objects outside photos/ and tickets/ alone", async () => {
    const t = await testApp();
    await t.app.store.put("photos/orphan.jpg", new Uint8Array([1]), "image/jpeg");
    await t.app.store.put("exports/p1/t.png", new Uint8Array([1]), "image/png");
    t.clock.advance(2 * 60 * 60 * 1000);
    expect(await sweepFiles(t.app, t.clock())).toEqual(["photos/orphan.jpg"]);
    expect((await t.app.store.list("")).map((entry) => entry.key)).toEqual(["exports/p1/t.png"]);
  });

  test("the file sweep removes a ticket file no row owns and keeps one a ticket row points at", async () => {
    const t = await testApp();
    seedShow(t.db, { id: "show-a" });
    const a = await memberSession(t, 0);
    const plan = await makePlan(t, a, "show-a");
    await t.call("PUT", `/plans/${plan.id}/ticket`, { token: a.token, rawBody: cleanPng() });
    const owned = (t.db.query("SELECT object_key FROM ticket_proof").get() as { object_key: string }).object_key;
    await t.app.store.put("tickets/orphan.jpg", new Uint8Array([1]), "image/jpeg");
    t.clock.advance(2 * 60 * 60 * 1000);
    expect(await sweepFiles(t.app, t.clock())).toEqual(["tickets/orphan.jpg"]);
    expect((await t.app.store.list("tickets/")).map((entry) => entry.key)).toEqual([owned]);
  });

  test("a pass that fails does not use up the day: the next tick tries again, and a good pass then marks it done", async () => {
    const t = await testApp();
    await t.app.store.put("photos/orphan.jpg", new Uint8Array([1]), "image/jpeg");
    t.clock.advance(2 * 60 * 60 * 1000);
    const list = t.app.store.list;
    t.app.store.list = async () => {
      throw new Error("store down");
    };
    await expect(sweepFiles(t.app, t.clock())).rejects.toThrow("store down");
    expect(t.db.query("SELECT 1 FROM rate_bucket WHERE bucket_key = 'sweep:files'").get()).toBeNull();
    t.app.store.list = list;
    expect(await sweepFiles(t.app, t.clock())).toEqual(["photos/orphan.jpg"]);
    expect(t.db.query("SELECT 1 FROM rate_bucket WHERE bucket_key = 'sweep:files'").get()).not.toBeNull();
    expect(await sweepFiles(t.app, t.clock())).toEqual([]);
  });

  test("a step that throws does not stop the others", async () => {
    const t = await testApp();
    t.app.store.list = async () => {
      throw new Error("store down");
    };
    t.db.query("INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES ('old', 0, 60, 1)").run();
    await housekeeping(t.app);
    expect(t.db.query("SELECT 1 FROM rate_bucket WHERE bucket_key = 'old'").get()).toBeNull();
    expect(t.logs.some((entry) => entry.route === "housekeeping" && entry.error === "Error")).toBe(true);
    expect(JSON.stringify(t.logs)).not.toContain("store down");
  });
});

describe("the retention sweeps for the M3 tables", () => {
  const DAY = 24 * 60 * 60 * 1000;

  test("notices and their push deliveries go after 30 days, newer ones stay", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    const old = addNotice(t.db, {
      memberId: a.memberId,
      kind: "ticket_approved",
      planId: null,
      groupId: null,
      dedupeKey: "old",
      now: t.clock(),
    });
    t.db
      .query(
        "INSERT INTO device (id, member_id, session_id, expo_token, platform, created_at, last_seen_at) VALUES ('d1', ?, NULL, 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'android', ?, ?)",
      )
      .run(a.memberId, t.clock().toISOString(), t.clock().toISOString());
    t.db
      .query(
        "INSERT INTO push_delivery (id, notice_id, device_id, expo_ticket_id, status, created_at) VALUES ('p1', ?, 'd1', 't1', 'delivered', ?)",
      )
      .run(old, t.clock().toISOString());
    t.clock.advance(29 * DAY);
    sweepRows(t.db, t.clock(), 7);
    expect([count(t.db, "notice"), count(t.db, "push_delivery")]).toEqual([1, 1]);
    t.clock.advance(2 * DAY);
    const fresh = addNotice(t.db, {
      memberId: a.memberId,
      kind: "head_over",
      planId: null,
      groupId: null,
      dedupeKey: "new",
      now: t.clock(),
    });
    sweepRows(t.db, t.clock(), 7);
    expect([count(t.db, "notice"), count(t.db, "push_delivery")]).toEqual([1, 0]);
    expect((t.db.query("SELECT id FROM notice").get() as { id: string }).id).toBe(fresh as string);
  });

  test("sent alerts go after 30 days and operator actions after a year", async () => {
    const t = await testApp();
    t.db.query("INSERT INTO alert_sent (alert_key, sent_at) VALUES ('k', ?)").run(t.clock().toISOString());
    t.db
      .query(
        "INSERT INTO operator_action (id, action, subject_type, subject_id, created_at) VALUES ('o1', 'approve_ticket', 'ticket', 'x', ?)",
      )
      .run(t.clock().toISOString());
    t.clock.advance(31 * DAY);
    sweepRows(t.db, t.clock(), 7);
    expect([count(t.db, "alert_sent"), count(t.db, "operator_action")]).toEqual([0, 1]);
    t.clock.advance(335 * DAY);
    sweepRows(t.db, t.clock(), 7);
    expect(count(t.db, "operator_action")).toBe(0);
  });

  test("housekeeping applies the notice retention from the tunables", async () => {
    const t = await testApp();
    const a = await memberSession(t, 0);
    addNotice(t.db, { memberId: a.memberId, kind: "head_over", planId: null, groupId: null, dedupeKey: "old", now: t.clock() });
    t.clock.advance(t.app.config.tunables.noticeRetentionDays * DAY + 1000);
    await housekeeping(t.app);
    expect(count(t.db, "notice")).toBe(0);
  });
});

describe("alerts", () => {
  test("a kind repeats at most once an hour, goes to the webhook, and falls back to the log when it fails", async () => {
    const t = await testApp();
    const posted: { url: string; body: string }[] = [];
    const written: string[] = [];
    let status = 200;
    const alerts = createAlerts({
      now: t.clock,
      webhookUrl: "https://hooks.example.com/alert",
      write: (line) => written.push(line),
      fetch: async (url, init) => {
        posted.push({ url, body: String(init?.body) });
        return new Response("", { status });
      },
    });
    await alerts.notify("a", "first");
    await alerts.notify("a", "again");
    await alerts.notify("b", "other");
    await alerts.idle();
    expect(posted).toHaveLength(2);
    expect(JSON.parse(posted[0]?.body ?? "{}")).toEqual({ text: "[turnout alert] a: first" });
    t.clock.advance(61 * 60 * 1000);
    status = 500;
    await alerts.notify("a", "later");
    await alerts.idle();
    expect(posted).toHaveLength(3);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("answered 500");
  });

  test("a webhook that never answers does not hold notify, and is cut off with a signal that aborts", async () => {
    const t = await testApp();
    const written: string[] = [];
    let signal: AbortSignal | null | undefined;
    const alerts = createAlerts({
      now: t.clock,
      webhookUrl: "https://hooks.example.com/alert",
      write: (line) => written.push(line),
      timeoutMs: 40,
      fetch: (_url, init) => {
        signal = init.signal;
        return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      },
    });
    const started = performance.now();
    await alerts.notify("slow", "text");
    expect(performance.now() - started).toBeLessThan(30);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    await alerts.idle();
    expect(signal?.aborted).toBe(true);
    expect(written).toEqual(["[turnout alert] slow: text (the alert webhook could not be reached)"]);
  });

  test("the default timeout is 5 seconds", () => {
    expect(ALERT_TIMEOUT_MS).toBe(5000);
  });

  test("without a webhook the alert goes to the log", async () => {
    const t = await testApp();
    const written: string[] = [];
    await createAlerts({ now: t.clock, webhookUrl: null, write: (line) => written.push(line), fetch: async () => new Response("") }).notify(
      "k",
      "text",
    );
    expect(written).toEqual(["[turnout alert] k: text"]);
    expect(recordingAlerts().sent).toEqual([]);
  });
});
