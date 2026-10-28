import { expect, test } from "bun:test";
import { runSync } from "../src/ingestion/sync.js";
import { isEligible } from "../src/social/model/eligibility.js";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-09-08T12:00:00Z");
const now = () => NOW;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

interface Spec {
  id: string;
  categories: string[];
  priceMin: number | null;
  isFree: boolean;
  timeKind: "timed" | "date-only";
  placed: boolean;
  startsAt: string;
}

const ADJECTIVES = ["Crimson", "Velvet", "Hollow", "Gilded", "Rustic", "Lunar", "Brisk", "Amber", "Quiet", "Feral", "Marble", "Neon"];
const NOUNS = [
  "Heron",
  "Lantern",
  "Orchard",
  "Compass",
  "Harbour",
  "Falcon",
  "Meadow",
  "Cipher",
  "Anvil",
  "Thicket",
  "Mirage",
  "Quartz",
  "Ember",
  "Tundra",
  "Willow",
  "Zephyr",
  "Granite",
  "Saffron",
  "Pebble",
  "Yonder",
];

/** Titles that share no words, so the fuzzy dedupe leaves every row listed. */
function titleFor(n: number): string {
  return `${ADJECTIVES[n % ADJECTIVES.length]} ${NOUNS[Math.floor(n / ADJECTIVES.length) % NOUNS.length]} Live`;
}

function specs(): Spec[] {
  const out: Spec[] = [];
  let n = 0;
  for (const categories of [["comedy"], ["music"], ["film"]]) {
    for (const [priceMin, isFree] of [
      [498, false],
      [499, false],
      [1200, false],
      [null, false],
      [0, true],
    ] as const) {
      for (const timeKind of ["timed", "date-only"] as const) {
        for (const placed of [true, false]) {
          for (const startsAt of [at(24 * 60 - 1), at(24 * 60), at(24 * 60 + 1), at(3 * 24 * 60)]) {
            out.push({ id: `g${n++}`, categories, priceMin, isFree, timeKind, placed, startsAt });
          }
        }
      }
    }
  }
  return out;
}

async function seeded() {
  const db = memoryDb();
  const all = specs();
  await runSync({
    db,
    fetchedBySource: {
      district: all.map((s) => ({
        id: s.id,
        raw: { id: s.id },
        occurrences: [
          {
            sourceEventId: s.id,
            sourceSlotId: "0",
            slug: s.id,
            title: titleFor(Number(s.id.slice(1))),
            description: null,
            timeKind: s.timeKind,
            startsAt: s.startsAt,
            endsAt: null,
            venueName: s.placed ? "Placed Hall" : "Unplaced Hall",
            address: s.placed ? "Madhapur, Hyderabad" : "Hyderabad",
            latitude: s.placed ? 17.4165 : null,
            longitude: s.placed ? 78.4392 : null,
            categories: s.categories,
            tags: [],
            priceMin: s.priceMin,
            isFree: s.isFree,
            sourceUrl: `https://example.test/${s.id}`,
          },
        ],
      })),
    },
  });
  return { db, all };
}

interface ApiEvent {
  url: string;
  title: string;
  category: string;
  group_eligible: boolean;
}

async function listAll(db: ReturnType<typeof memoryDb>, query: string): Promise<ApiEvent[]> {
  const out: ApiEvent[] = [];
  let cursor: string | null = null;
  do {
    const url = `http://localhost/api/events?limit=200${query}${cursor ? `&cursor=${cursor}` : ""}`;
    const body = (await siteResponse(db, new Request(url), now).json()) as { events: ApiEvent[]; next_cursor: string | null };
    out.push(...body.events);
    cursor = body.next_cursor;
  } while (cursor);
  return out;
}

test("group_eligible in the JSON matches isEligible for every combination", async () => {
  const { db, all } = await seeded();
  const events = await listAll(db, "&to=2026-09-20");
  expect(events.length).toBeGreaterThan(all.length / 2);
  const byTitle = new Map(all.map((s) => [titleFor(Number(s.id.slice(1))), s]));
  let eligible = 0;
  for (const event of events) {
    const spec = byTitle.get(event.title);
    expect(spec).toBeDefined();
    const expected = isEligible(
      {
        category: event.category,
        isFree: spec!.isFree,
        priceMin: spec!.priceMin,
        startsAt: spec!.startsAt,
        timeKind: spec!.timeKind,
        venuePlaced: spec!.placed,
      },
      null,
      NOW,
    ).eligible;
    expect(event.group_eligible).toBe(expected);
    if (expected) eligible++;
  }
  expect(eligible).toBeGreaterThan(0);
  db.close();
});

test("group_eligible=1 returns exactly the eligible shows, and the default list is unchanged", async () => {
  const { db } = await seeded();
  const everything = await listAll(db, "&to=2026-09-20");
  const filtered = await listAll(db, "&to=2026-09-20&group_eligible=1");
  const expected = everything.filter((e) => e.group_eligible).map((e) => e.url);
  expect(filtered.map((e) => e.url)).toEqual(expected);
  expect(filtered.length).toBeGreaterThan(0);
  expect(filtered.length).toBeLessThan(everything.length);
  expect(filtered.every((e) => e.group_eligible)).toBe(true);

  const zero = await listAll(db, "&to=2026-09-20&group_eligible=0");
  expect(zero.map((e) => e.url)).toEqual(everything.map((e) => e.url));
  db.close();
});

test("group_eligible filters by what is eligible at the boundaries", async () => {
  const { db, all } = await seeded();
  const filtered = await listAll(db, "&to=2026-09-20&group_eligible=1");
  const titles = new Set(filtered.map((e) => e.title));
  const inList = (spec: Spec) => titles.has(titleFor(Number(spec.id.slice(1))));
  const pick = (f: (s: Spec) => boolean) => all.filter(f);
  // 498 is out, 499 is in, free and film never, date-only only with an operator start time, exactly T-24h is closed.
  expect(pick((s) => s.priceMin === 498).some(inList)).toBe(false);
  expect(pick((s) => s.isFree).some(inList)).toBe(false);
  expect(pick((s) => s.categories[0] === "film").some(inList)).toBe(false);
  expect(pick((s) => s.timeKind === "date-only").some(inList)).toBe(false);
  expect(pick((s) => !s.placed).some(inList)).toBe(false);
  const edge = pick((s) => s.categories[0] === "comedy" && s.priceMin === 499 && s.timeKind === "timed" && s.placed);
  expect(edge.filter(inList).map((s) => s.startsAt)).toEqual([at(24 * 60 + 1), at(3 * 24 * 60)]);
  db.close();
});

test("a date-only show becomes eligible once the operator sets a start time, unless that time is inside T-24h", async () => {
  const { db, all } = await seeded();
  const dateOnly = all.filter((s) => s.timeKind === "date-only" && s.placed && s.categories[0] === "comedy" && s.priceMin === 1200);
  expect(dateOnly.length).toBeGreaterThanOrEqual(2);
  const early = dateOnly.find((s) => s.startsAt === at(3 * 24 * 60)) as Spec;
  const late = dateOnly.find((s) => s.startsAt === at(24 * 60 + 1)) as Spec;
  const eventId = (spec: Spec) =>
    (db.query("SELECT id FROM event WHERE title = ?").get(titleFor(Number(spec.id.slice(1)))) as { id: string }).id;
  const set = (spec: Spec, startsAt: string) =>
    db
      .query("INSERT INTO start_override (event_id, starts_at, set_by, set_at) VALUES (?, ?, 'operator', ?)")
      .run(eventId(spec), startsAt, NOW.toISOString());
  const before = await listAll(db, "&to=2026-09-20&group_eligible=1");
  expect(before.some((e) => e.title === titleFor(Number(early.id.slice(1))))).toBe(false);
  set(early, at(5 * 24 * 60));
  set(late, at(10 * 60));
  const after = await listAll(db, "&to=2026-09-20");
  const flag = (spec: Spec) => after.find((e) => e.title === titleFor(Number(spec.id.slice(1))))?.group_eligible;
  expect(flag(early)).toBe(true);
  expect(flag(late)).toBe(false);
  const only = await listAll(db, "&to=2026-09-20&group_eligible=1");
  expect(only.some((e) => e.title === titleFor(Number(early.id.slice(1))))).toBe(true);
  expect(only.some((e) => e.title === titleFor(Number(late.id.slice(1))))).toBe(false);
  db.close();
});

test("a malformed group_eligible is a 400", async () => {
  const { db } = await seeded();
  const response = siteResponse(db, new Request("http://localhost/api/events?group_eligible=maybe"), now);
  expect(response.status).toBe(400);
  db.close();
});
