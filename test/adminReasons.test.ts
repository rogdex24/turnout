import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { hiddenReasons } from "../src/admin/reasons.js";
import { addMuteRule, MUTE_FIELDS } from "../src/curation/mute.js";
import { runSync } from "../src/ingestion/sync.js";
import { item, seedAdmin } from "./adminHelpers.js";
import { memoryDb } from "./helpers.js";

const idOf = (db: Database, sourceEventId: string) =>
  (db.prepare("SELECT id FROM event WHERE source_event_id = ?").get(sourceEventId) as { id: string }).id;
const inView = (db: Database, id: string) => db.prepare("SELECT 1 FROM listable_event WHERE id = ?").get(id) !== null;

/** The invariant the brief asks for: listable_event and the reasons never disagree. */
function expectAgreement(db: Database): void {
  const ids = (db.prepare("SELECT id FROM event").all() as { id: string }[]).map((row) => row.id);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    expect({ id, listed: inView(db, id) }).toEqual({ id, listed: hiddenReasons(db, id).length === 0 });
  }
}

test("each reason is reported for the condition that hides the event, and the view agrees", async () => {
  const db = await seedAdmin();

  expect(hiddenReasons(db, idOf(db, "listed"))).toEqual([]);
  expect(hiddenReasons(db, idOf(db, "novenue"))).toEqual(["no venue"]);
  expect(hiddenReasons(db, idOf(db, "tbd"))).toEqual(["placeholder venue"]);
  expect(hiddenReasons(db, idOf(db, "announce"))).toEqual(["placeholder venue"]);

  const reasons = ["dup", "dup-d"].map((id) => hiddenReasons(db, idOf(db, id)));
  const duplicate = reasons.find((r) => r.length > 0)!;
  const canonical = (db.prepare("SELECT id FROM event WHERE is_canonical = 1 AND title = 'Twin Concert'").get() as { id: string }).id;
  expect(duplicate).toEqual([`duplicate of ${canonical}`]);

  db.prepare("UPDATE event SET status = 'delisted' WHERE id = ?").run(idOf(db, "listed"));
  expect(hiddenReasons(db, idOf(db, "listed"))).toEqual(["delisted"]);
  db.prepare("UPDATE event SET status = 'active' WHERE id = ?").run(idOf(db, "listed"));

  for (const [field, value] of [
    ["source", "bookmyshow"],
    ["area", "other"],
    ["category", "comedy"],
    ["title", "standup"],
    ["venue", "phoenix"],
  ] as const) {
    const fresh = await seedAdmin();
    addMuteRule(fresh, field, value);
    expect(hiddenReasons(fresh, idOf(fresh, "listed"))).toContain(`muted by ${field}=${value}`);
    expectAgreement(fresh);
    fresh.close();
  }
  expect(MUTE_FIELDS).toHaveLength(5); // a new mute field needs a case above

  expectAgreement(db);
  db.close();
});

test("reasons stack when several conditions apply", async () => {
  const db = memoryDb();
  await runSync({ db, fetchedBySource: { bookmyshow: [item("x", { venueName: "tba" })] } });
  addMuteRule(db, "source", "bookmyshow");
  db.prepare("UPDATE event SET status = 'delisted'").run();
  expect(hiddenReasons(db, idOf(db, "x"))).toEqual(["delisted", "placeholder venue", "muted by source=bookmyshow"]);
  expectAgreement(db);
  db.close();
});

test("an unknown event has no reasons", () => {
  expect(hiddenReasons(memoryDb(), "nope")).toEqual([]);
});

test("the agreement check fails when the view changes without the reasons", async () => {
  const db = await seedAdmin();
  db.exec("DROP VIEW listable_event; CREATE VIEW listable_event AS SELECT * FROM event WHERE status = 'active' AND is_canonical = 1");
  expect(() => expectAgreement(db)).toThrow();
  db.close();
});
