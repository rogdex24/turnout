import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getRun } from "../src/admin/api.js";
import { agentSource } from "../src/ingestion/agent/agentSource.js";
import type { Harness } from "../src/ingestion/agent/harness.js";
import { dateOnPage, normalizeText, normalizeUrl } from "../src/ingestion/agent/verify.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
afterAll(() => {
  if (process.env.KEEP) console.log(tmp);
  else fs.rmSync(tmp, { recursive: true, force: true });
});

const NOW = new Date("2026-10-10T00:00:00Z");
const PAGE_URL = "https://venue.example/shows/standup";
const page = fs.readFileSync(path.join(import.meta.dir, "fixtures/agent/page.html"), "utf8");
const FAKE = path.join(import.meta.dir, "fixtures/fake-harness.ts");

function record(overrides: Record<string, unknown> = {}, evidence: Record<string, unknown> = {}) {
  return {
    title: "Stand-up Night with Anirudh",
    starts_local: "2026-10-18T19:30",
    ends_local: null,
    venue_name: "Lamakaan",
    address: "Banjara Hills, Hyderabad",
    price_min: 499,
    is_free: false,
    category_hint: "comedy",
    source_url: PAGE_URL,
    evidence: {
      title: "Stand-up Night with Anirudh",
      date: "Sat, 18 Oct 2026, 7:30 PM",
      venue: "Lamakaan, Banjara Hills",
      price: "Tickets from ₹499",
      ...evidence,
    },
    ...overrides,
  };
}

let counter = 0;
/** A harness whose fake CLI copies the given lines into events.jsonl, or misbehaves. */
function fakeHarness(content: unknown[] | "!fail" | "!nofile" | "!hang", timeoutMs = 20_000): Harness {
  let arg: string = content as string;
  if (Array.isArray(content)) {
    counter += 1;
    arg = path.join(tmp, `out-${counter}.jsonl`);
    fs.writeFileSync(arg, `${content.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`);
  }
  return { name: "fake", argv: () => ["bun", FAKE, arg], timeoutMs };
}

/** Serves fixture pages; anything else is a 403. */
function pages(map: Record<string, string> = { [PAGE_URL]: page }) {
  return (async (url: string) => {
    const body = map[url];
    return body === undefined ? new Response("no", { status: 403 }) : new Response(body);
  }) as never;
}

const source = (harness: Harness, fetchImpl = pages()) => agentSource(harness, { seeds: [{ url: PAGE_URL, note: "test" }], fetchImpl });

async function sync(harness: Harness, db = memoryDb(), fetchImpl = pages()) {
  const adapter = source(harness, fetchImpl);
  const result = await runSync({ db, adapters: [adapter], sources: ["agent:fake"], sleepMs: 0, now: () => NOW, dataDir: tmp });
  return { db, result, adapter };
}

function report(runId: string) {
  return JSON.parse(fs.readFileSync(path.join(tmp, "agent-runs", `${runId}-fake`, "report.json"), "utf8"));
}

const rows = (db: ReturnType<typeof memoryDb>) =>
  db.prepare("SELECT source, title, status, price_min FROM event").all() as {
    source: string;
    title: string;
    status: string;
    price_min: number;
  }[];

describe("agent source", () => {
  test("run directories sit next to the database, where the admin reads them", async () => {
    const dataDir = fs.mkdtempSync(path.join(tmp, "data-"));
    const db = memoryDb();
    const result = await runSync({
      db,
      adapters: [source(fakeHarness([record()]))],
      sources: ["agent:fake"],
      sleepMs: 0,
      now: () => NOW,
      dataDir,
    });
    expect(fs.existsSync(path.join(dataDir, "agent-runs", `${result.runId}-fake`, "report.json"))).toBe(true);
    expect(getRun(db, result.runId, path.join(dataDir, "agent-runs")).agentReports["agent:fake"]).toMatchObject({
      harness: "fake",
      accepted: 1,
    });
  });

  test("accepts a record whose quotes are on the page and stores it as agent:fake", async () => {
    const { db, result } = await sync(fakeHarness([record()]));
    expect(rows(db)).toEqual([{ source: "agent:fake", title: "Stand-up Night with Anirudh", status: "active", price_min: 499 }]);
    expect(report(result.runId)).toMatchObject({ harness: "fake", exitCode: 0, emitted: 1, accepted: 1, quarantined: [], rejected: [] });
    const raw = db.prepare("SELECT body FROM raw_payload").get() as { body: string };
    expect(JSON.parse(raw.body).pageHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rejects a fabricated date that is not on the page", async () => {
    const fake = record({ starts_local: "2026-10-25T19:30" }, { date: "Sun, 25 Oct 2026, 7:30 PM" });
    const { db, result } = await sync(fakeHarness([fake]));
    expect(rows(db)).toEqual([]);
    expect(report(result.runId).rejected).toEqual([{ line: 1, reason: expect.stringContaining("not stated on the page") }]);
  });

  test("accepts a real date the agent reworded, checking the date by its parts", async () => {
    const reworded = record({ starts_local: "2026-10-18T19:30" }, { date: "Saturday 18 October, 2026 at 07:30 pm IST" });
    const { db, result } = await sync(fakeHarness([reworded]));
    expect(rows(db)).toHaveLength(1);
    expect(report(result.runId).rejected).toEqual([]);
  });

  test("rejects the right day with the wrong time", async () => {
    const { db, result } = await sync(fakeHarness([record({ starts_local: "2026-10-18T20:00" })]));
    expect(rows(db)).toEqual([]);
    expect(report(result.runId).rejected[0].reason).toContain("not stated on the page");
  });

  test("a date-only record is stored as date-only and needs only day and month", async () => {
    const dateOnly = record({ starts_local: "2026-10-18", price_min: null }, { date: "Sat, 18 Oct 2026", price: null });
    const { db, result } = await sync(fakeHarness([dateOnly]));
    expect(report(result.runId).rejected).toEqual([]);
    expect(db.prepare("SELECT time_kind AS kind, starts_at AS at FROM event").all()).toEqual([
      { kind: "date-only", at: "2026-10-17T18:30:00.000Z" },
    ]);
  });

  test("a date-only record with an invented day is rejected", async () => {
    const { result } = await sync(fakeHarness([record({ starts_local: "2026-10-25", price_min: null }, { price: null })]));
    expect(report(result.runId).rejected[0].reason).toContain("not stated on the page");
  });

  test("rejects an invented price quote", async () => {
    const { db, result } = await sync(fakeHarness([record({ price_min: 99 }, { price: "Tickets from ₹99" })]));
    expect(rows(db)).toEqual([]);
    expect(report(result.runId).rejected[0].reason).toContain("evidence.price is not on the page");
  });

  test("quarantines a record whose page returns 403, without storing it", async () => {
    const { db, result } = await sync(fakeHarness([record({ source_url: "https://venue.example/blocked" })]));
    expect(rows(db)).toEqual([]);
    expect(report(result.runId).quarantined).toEqual([
      { record: expect.objectContaining({ title: "Stand-up Night with Anirudh" }), reason: "page fetch returned 403" },
    ]);
  });

  test("rejects past and far-future starts", async () => {
    const lines = [record({ starts_local: "2026-10-01T19:30" }), record({ starts_local: "2029-10-18T19:30" })];
    const { result } = await sync(fakeHarness(lines));
    expect(report(result.runId).rejected.map((r: { reason: string }) => r.reason)).toEqual([
      "start is in the past",
      expect.stringContaining("days ahead"),
    ]);
  });

  test("bad lines are rejected with their line number and the good line still lands", async () => {
    const { db, result } = await sync(
      fakeHarness([
        "{not json",
        { ...record(), title: undefined },
        record({ price_min: "499" }),
        record({ is_free: "no" }),
        record({ starts_local: "18 Oct 2026" }),
        record(),
      ]),
    );
    expect(rows(db)).toHaveLength(1);
    const body = report(result.runId);
    expect(body.emitted).toBe(6);
    expect(body.accepted).toBe(1);
    expect(body.rejected.map((r: { line: number }) => r.line)).toEqual([1, 2, 3, 4, 5]);
  });

  test("running the same output twice upserts", async () => {
    const harness = fakeHarness([record()]);
    const { db } = await sync(harness);
    await sync(harness, db);
    expect(rows(db)).toHaveLength(1);
  });

  test("a row absent from the next run is not delisted", async () => {
    const other = record({ title: "Open Mic Night" }, { title: "Open Mic Night" });
    const page2 = page.replace("Stand-up Night with Anirudh", "Open Mic Night");
    const fetchImpl = pages({ [PAGE_URL]: page + page2 });
    const { db } = await sync(fakeHarness([record()]), memoryDb(), fetchImpl);
    for (let i = 0; i < 3; i += 1) await sync(fakeHarness([other]), db, fetchImpl);
    expect(
      rows(db)
        .map((r) => [r.title, r.status])
        .sort(),
    ).toEqual([
      ["Open Mic Night", "active"],
      ["Stand-up Night with Anirudh", "active"],
    ]);
  });

  for (const [label, mode, timeoutMs] of [
    ["exits non-zero", "!fail", 20_000],
    ["writes no file", "!nofile", 20_000],
    ["times out", "!hang", 500],
  ] as const) {
    test(`harness that ${label} fails the source and delists nothing`, async () => {
      const { db } = await sync(fakeHarness([record()]));
      for (let i = 0; i < 3; i += 1) {
        const { result } = await sync(fakeHarness(mode, timeoutMs), db);
        expect(Object.keys(result.sourceErrors)).toEqual(["agent:fake"]);
        expect(result.delisted).toBe(0);
      }
      expect(rows(db).map((r) => r.status)).toEqual(["active"]);
    });
  }
});

describe("verify helpers", () => {
  const on = (local: string, page: string) => dateOnPage(local, normalizeText(page));

  test("dateOnPage reads the time in 12 and 24 hour forms", () => {
    for (const page of [
      "Sat, 10 Oct 2026 \u2022 7:00 PM (IST)",
      "10th October 2026, 7 pm",
      "Oct 10 19:00",
      "10/10/2026 07:00 p.m.",
      "10 Oct, 7.00PM",
    ]) {
      expect(on("2026-10-10T19:00", page)).toBe(true);
    }
    expect(on("2026-10-10T19:00", "Sat, 10 Oct 2026 \u2022 7:30 PM")).toBe(false);
    expect(on("2026-10-10T19:00", "Sat, 10 Oct 2026 \u2022 7:00 AM")).toBe(false);
    expect(on("2026-10-10T19:00", "Sat, 11 Oct 2026 \u2022 7:00 PM")).toBe(false);
    expect(on("2026-10-10T19:00", "Sat, 10 Nov 2026 \u2022 7:00 PM")).toBe(false);
  });

  test("dateOnPage needs day, month and time near each other, not scattered", () => {
    const scattered = `Doors 7:00 PM. ${"lorem ipsum ".repeat(30)}Sat, 10 Oct 2026`;
    expect(on("2026-10-10T19:00", scattered)).toBe(false);
    expect(on("2026-10-10", scattered)).toBe(true);
  });

  test("dateOnPage does not take a time or year for a day or month", () => {
    expect(on("2026-07-10T19:00", "Posted 7:00 PM, 10 Mar 2026")).toBe(false);
    expect(on("2026-10-20", "Fri, 2 Oct 2026 20:00")).toBe(false);
  });

  test("normalizeUrl ignores fragments, tracking params and trailing slashes", () => {
    expect(normalizeUrl("https://A.example/x/?utm_source=a#top")).toBe(normalizeUrl("https://a.example/x"));
  });
});
