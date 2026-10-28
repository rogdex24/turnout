import { describe, expect, test } from "bun:test";
import { createAlerts, recordingAlerts } from "../src/app-api/alerts.js";
import { housekeeping, sweepFiles, sweepRows } from "../src/app-api/housekeeping.js";
import { PHONES, testApp } from "./appHelpers.js";

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
    expect(posted).toHaveLength(2);
    expect(JSON.parse(posted[0]?.body ?? "{}")).toEqual({ text: "[turnout alert] a: first" });
    t.clock.advance(61 * 60 * 1000);
    status = 500;
    await alerts.notify("a", "later");
    expect(posted).toHaveLength(3);
    expect(written).toHaveLength(1);
    expect(written[0]).toContain("answered 500");
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
