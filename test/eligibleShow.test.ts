import { expect, test } from "bun:test";
import { isEligible } from "../src/social/model/eligibility.js";
import { DEFAULT_TUNABLES, type Tunables } from "../src/social/model/tunables.js";
import { getEligibleShow } from "../src/social/shows.js";
import { memoryDb } from "./helpers.js";

const NOW = new Date("2026-09-08T12:00:00Z");
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

interface Fixture {
  id: string;
  title: string;
  category: string;
  priceMin: number | null;
  isFree: boolean;
  timeKind: "timed" | "date-only";
  placed: boolean;
  startsAt: string;
  override: string | null;
}

const CATEGORIES = ["comedy", "music", "theatre", "film", "comedy"];
const PRICES: (number | null)[] = [498, 499, 1200, null, 0, 650, 499];
const STARTS = [at(24 * 60 - 1), at(24 * 60), at(24 * 60 + 1), at(3 * 24 * 60), at(6 * 60)];

/** 30 shows that between them cross every rule: category, price, free, date-only with and without a confirmed time, venue, closing. */
function fixtures(): Fixture[] {
  return Array.from({ length: 30 }, (_, i) => {
    const timeKind = i % 4 === 3 ? "date-only" : "timed";
    const startsAt = STARTS[(i * 2 + Math.floor(i / 5)) % STARTS.length] as string;
    return {
      id: `x${i}`,
      title: `Show ${i}`,
      category: CATEGORIES[i % CATEGORIES.length] as string,
      priceMin: PRICES[(i * 3) % PRICES.length] ?? null,
      isFree: (PRICES[(i * 3) % PRICES.length] ?? null) === 0,
      timeKind,
      placed: i % 6 !== 5,
      startsAt,
      // Every second date-only show has a confirmed time, a different one from the source's start.
      override: timeKind === "date-only" && i % 8 === 3 ? at(4 * 24 * 60 + i) : null,
    };
  });
}

const STAMP = NOW.toISOString();

/** Rows go in directly: the sync would merge look-alike shows, and these are meant to stay apart. */
function seeded() {
  const db = memoryDb();
  const all = fixtures();
  const ids = new Map<string, string>();
  for (const f of all) {
    const venueId = `venue-${f.id}`;
    db.query(
      `INSERT INTO venue (id, name, name_key, geocode_state, lat, lng, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      venueId,
      `Hall ${f.id}`,
      `hall-${f.id}`,
      f.placed ? "resolved" : "pending",
      f.placed ? 17.4165 : null,
      f.placed ? 78.4392 : null,
      STAMP,
      STAMP,
    );
    db.query(
      `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, time_kind, venue_id, venue_name, category, price_min, is_free,
         source_url, content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
       VALUES (?, ?, '0', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'h', ?, ?, 'run', ?)`,
    ).run(
      f.id,
      f.id,
      f.title,
      f.startsAt,
      f.timeKind,
      venueId,
      `Hall ${f.id}`,
      f.category,
      f.priceMin,
      f.isFree ? 1 : 0,
      `https://example.test/${f.id}`,
      STAMP,
      STAMP,
      STAMP,
    );
    ids.set(f.title, f.id);
    if (f.override !== null) {
      db.query("INSERT INTO start_override (event_id, starts_at, set_by, set_at) VALUES (?, ?, 'operator', ?)").run(
        f.id,
        f.override,
        STAMP,
      );
    }
  }
  return { db, all, ids };
}

const OPEN_UP: Tunables = {
  ...DEFAULT_TUNABLES,
  eligibleCategories: ["comedy", "music", "theatre", "film"],
  minPriceInr: 0,
  joinCutoffHours: 2,
};

for (const [name, tunables] of [
  ["the defaults", DEFAULT_TUNABLES],
  ["tunables that open the rules up", OPEN_UP],
] as const) {
  test(`getEligibleShow agrees with isEligible on 30 fixture shows under ${name}`, () => {
    const { db, all, ids } = seeded();
    expect(all).toHaveLength(30);
    expect(ids.size).toBe(30);
    let eligible = 0;
    let overridden = 0;
    for (const f of all) {
      const id = ids.get(f.title) as string;
      const expected = isEligible(
        {
          category: f.category,
          isFree: f.isFree,
          priceMin: f.priceMin,
          startsAt: f.startsAt,
          timeKind: f.timeKind,
          venuePlaced: f.placed,
        },
        f.override === null ? null : { startsAt: f.override },
        NOW,
        tunables,
      );
      const show = getEligibleShow(db, id, NOW, tunables);
      expect(show !== null).toBe(expected.eligible);
      if (expected.eligible) {
        eligible++;
        expect(show?.startsAt).toBe(expected.startsAt);
        if (f.override !== null) overridden++;
      }
    }
    expect(eligible).toBeGreaterThan(4);
    expect(overridden).toBeGreaterThan(0);
    db.close();
  });
}

test("the open-rules run lets in shows the default rules turn away, so the view cannot be holding the defaults", () => {
  const { db, all, ids } = seeded();
  const count = (t: Tunables) => all.filter((f) => getEligibleShow(db, ids.get(f.title) as string, NOW, t) !== null).length;
  expect(count(OPEN_UP)).toBeGreaterThan(count(DEFAULT_TUNABLES));
  db.close();
});

test("the view carries the venue point and the operator's start for the shows listable_event holds", () => {
  const { db } = seeded();
  const rows = db
    .query(
      "SELECT id, venue_lat AS lat, venue_geocode_state AS state, effective_starts_at AS startsAt, override_starts_at AS override FROM eligible_show",
    )
    .all() as { id: string; lat: number | null; state: string | null; startsAt: string; override: string | null }[];
  expect(rows.length).toBe((db.query("SELECT COUNT(*) AS n FROM listable_event").get() as { n: number }).n);
  expect(rows.some((r) => r.lat === null && r.state === "pending")).toBe(true);
  for (const row of rows)
    expect(row.startsAt).toBe(
      row.override ?? (db.query("SELECT starts_at FROM event WHERE id = ?").get(row.id) as { starts_at: string }).starts_at,
    );
  db.close();
});

test("the view holds free shows, date-only shows with no override and unplaced venues too: those rules are isEligible's", () => {
  const { db, all } = seeded();
  const ids = new Set((db.query("SELECT id FROM eligible_show").all() as { id: string }[]).map((r) => r.id));
  expect(all.some((f) => f.isFree && ids.has(f.id))).toBe(true);
  expect(all.some((f) => f.timeKind === "date-only" && f.override === null && ids.has(f.id))).toBe(true);
  expect(all.some((f) => !f.placed && ids.has(f.id))).toBe(true);
  db.close();
});

test("a muted show leaves the view, like it leaves listable_event", () => {
  const { db } = seeded();
  const [row] = db.query("SELECT id FROM eligible_show LIMIT 1").all() as { id: string }[];
  expect(row).toBeDefined();
  db.query("UPDATE event SET status = 'delisted' WHERE id = ?").run(row?.id ?? "");
  expect(db.query("SELECT 1 FROM eligible_show WHERE id = ?").get(row?.id ?? "")).toBeNull();
  db.close();
});
