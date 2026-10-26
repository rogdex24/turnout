import type { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { addMuteRule, countMuted, isMuteField, listMuteRules, NOT_MUTED, removeMuteRule } from "../src/curation/mute.js";
import type { FetchedItem } from "../src/ingestion/sources/types.js";
import { runSync } from "../src/ingestion/sync.js";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

const NOW = () => new Date("2026-09-12T00:00:00Z");

function item(id: string, overrides: Partial<{ title: string; categories: string[]; venueName: string }> = {}): FetchedItem {
  return {
    id,
    raw: { id },
    occurrences: [
      {
        sourceEventId: id,
        sourceSlotId: "s1",
        slug: id,
        title: overrides.title ?? `Event ${id}`,
        description: null,
        timeKind: "timed" as const,
        startsAt: "2026-09-13T13:30:00.000Z",
        endsAt: null,
        venueName: overrides.venueName ?? "Phoenix Arena",
        address: null,
        latitude: null,
        longitude: null,
        categories: overrides.categories ?? [],
        tags: [],
        priceMin: null,
        isFree: true,
        sourceUrl: `https://example.test/${id}`,
      },
    ],
  };
}

async function seed(): Promise<Database> {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      bookmyshow: [
        item("bms-1", { title: "Standup Night", categories: ["Comedy Shows"] }),
        item("bms-2", { title: "Rock Gig", categories: ["Music Shows"] }),
      ],
      district: [item("dis-1", { title: "Pottery Workshop", categories: ["Workshops"], venueName: "Clay Studio" })],
    },
  });
  return db;
}

const served = async (db: Database): Promise<string[]> => {
  const body = (await siteResponse(db, new Request("http://localhost/api/events?limit=100"), NOW).json()) as {
    events: { title: string }[];
  };
  return body.events.map((event) => event.title).sort();
};

test("muting a category stops it being served", async () => {
  const db = await seed();
  expect(await served(db)).toEqual(["Pottery Workshop", "Rock Gig", "Standup Night"]);

  addMuteRule(db, "category", "comedy");
  expect(await served(db)).toEqual(["Pottery Workshop", "Rock Gig"]);
  db.close();
});

test("a mute names the classified category, not the label a source happens to publish", async () => {
  const db = await seed();
  // The source label is "Comedy Shows"; the site's vocabulary is "comedy".
  addMuteRule(db, "category", "Comedy Shows");
  expect(await served(db)).toHaveLength(3);
  addMuteRule(db, "category", "comedy");
  expect(await served(db)).toEqual(["Pottery Workshop", "Rock Gig"]);
  db.close();
});

test("unmuting serves the events again with no re-sync", async () => {
  const db = await seed();
  addMuteRule(db, "category", "comedy");
  expect(await served(db)).toHaveLength(2);

  expect(removeMuteRule(db, "category", "comedy")).toBe(true);
  expect(await served(db)).toHaveLength(3);
  db.close();
});

test("a mute applies to the listing, calendar feed, sitemap and detail page alike", async () => {
  const db = await seed();
  addMuteRule(db, "category", "comedy");

  expect(await siteResponse(db, new Request("http://localhost/"), NOW).text()).not.toContain("Standup Night");
  expect(await siteResponse(db, new Request("http://localhost/events.ics"), NOW).text()).not.toContain("Standup Night");
  expect(await siteResponse(db, new Request("http://localhost/sitemap.xml"), NOW).text()).not.toContain("bms-1");
  expect(siteResponse(db, new Request("http://localhost/e/bms-1"), NOW).status).toBe(404);
  db.close();
});

test("every field can be muted", async () => {
  for (const [field, value, expected] of [
    ["source", "bookmyshow", ["Pottery Workshop"]],
    ["area", "other", []],
    ["title", "standup", ["Pottery Workshop", "Rock Gig"]],
    ["venue", "Clay", ["Rock Gig", "Standup Night"]],
  ] as const) {
    const db = await seed();
    addMuteRule(db, field, value);
    expect(await served(db)).toEqual([...expected]);
    db.close();
  }
});

test("adding the same rule twice is a no-op", async () => {
  const db = await seed();
  addMuteRule(db, "category", "comedy", "first");
  addMuteRule(db, "category", "comedy", "second");
  expect(listMuteRules(db)).toHaveLength(1);
  expect(listMuteRules(db)[0]!.note).toBe("first");
  db.close();
});

test("removing a rule that is not there reports it rather than throwing", async () => {
  const db = await seed();
  expect(removeMuteRule(db, "category", "Nothing")).toBe(false);
  db.close();
});

test("countMuted reports what a rule would hide before it is added", async () => {
  const db = await seed();
  expect(countMuted(db, "category", "comedy")).toBe(1);
  expect(countMuted(db, "source", "bookmyshow")).toBe(2);
  db.close();
});

test("isMuteField rejects a field the schema would refuse", () => {
  expect(isMuteField("category")).toBe(true);
  expect(isMuteField("price")).toBe(false);
});

test("a muted event does not count toward its venue in /tools/list_venues", async () => {
  const db = await seed();
  const venues = async (): Promise<Record<string, number>> => {
    const body = (await siteResponse(db, new Request("http://localhost/tools/list_venues"), NOW).json()) as {
      venues: { name: string; upcoming_count: number }[];
    };
    return Object.fromEntries(body.venues.map((venue) => [venue.name, venue.upcoming_count]));
  };
  expect(await venues()).toEqual({ "Phoenix Arena": 2, "Clay Studio": 1 });

  addMuteRule(db, "category", "comedy");
  expect(await venues()).toEqual({ "Phoenix Arena": 1, "Clay Studio": 1 });

  // A venue whose every event is muted drops out instead of listing with 0.
  addMuteRule(db, "source", "district");
  expect(await venues()).toEqual({ "Phoenix Arena": 1 });
  db.close();
});

test("countMuted agrees with NOT_MUTED for every field, so the two cannot drift", async () => {
  for (const [field, value] of [
    ["source", "bookmyshow"],
    ["area", "other"],
    ["category", "comedy"],
    ["title", "STANDUP"],
    ["venue", "clay"],
  ] as const) {
    const db = await seed();
    const predicted = countMuted(db, field, value);
    addMuteRule(db, field, value);
    const hidden = (db.prepare(`SELECT COUNT(*) c FROM event WHERE status = 'active' AND NOT ${NOT_MUTED}`).get() as { c: number }).c;
    expect(predicted).toBeGreaterThan(0);
    expect(predicted).toBe(hidden);
    db.close();
  }
});
