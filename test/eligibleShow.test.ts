import { expect, test } from "bun:test";
import { isEligible, joinUntil } from "../src/social/model/eligibility.js";
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

test("the eligible_show view agrees with isEligible on 30 fixture shows", () => {
  const { db, all, ids } = seeded();
  expect(all).toHaveLength(30);
  expect(ids.size).toBe(30);
  const inView = new Map(
    (db.query("SELECT id, effective_starts_at AS startsAt FROM eligible_show").all() as { id: string; startsAt: string }[]).map((row) => [
      row.id,
      row.startsAt,
    ]),
  );
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
    );
    // The view has no clock: what it holds, open at NOW, is what isEligible accepts.
    const start = inView.get(id);
    const open = start !== undefined && NOW.getTime() < Date.parse(joinUntil(start));
    expect(open).toBe(expected.eligible);
    if (expected.eligible) {
      eligible++;
      expect(start).toBe(expected.startsAt);
      if (f.override !== null) overridden++;
    }
  }
  expect(eligible).toBeGreaterThan(4);
  expect(overridden).toBeGreaterThan(0);
  db.close();
});

test("the view carries the venue point and only placed venues", () => {
  const { db } = seeded();
  const rows = db.query("SELECT venue_lat AS lat, venue_lng AS lng, venue_geocode_state AS state FROM eligible_show").all() as {
    lat: number;
    lng: number;
    state: string;
  }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.lat).toBeGreaterThan(17.2);
    expect(["resolved", "approximate", "manual"]).toContain(row.state);
  }
  db.close();
});

test("a muted show leaves the view, like it leaves listable_event", () => {
  const { db } = seeded();
  const [row] = db.query("SELECT id FROM eligible_show LIMIT 1").all() as { id: string }[];
  expect(row).toBeDefined();
  db.query("UPDATE event SET status = 'delisted' WHERE id = ?").run(row!.id);
  expect(db.query("SELECT 1 FROM eligible_show WHERE id = ?").get(row!.id)).toBeNull();
  db.close();
});

test("the view is wider than isEligible only for the city-centre placeholder point, which the caller re-checks", () => {
  const { db } = seeded();
  const row = db.query("SELECT id, category, price_min, starts_at FROM eligible_show WHERE override_starts_at IS NULL LIMIT 1").get() as {
    id: string;
    category: string;
    price_min: number;
    starts_at: string;
  } | null;
  expect(row).not.toBeNull();
  db.query("UPDATE venue SET lat = 17.385, lng = 78.4867 WHERE id = ?").run(`venue-${row?.id}`);
  expect(db.query("SELECT 1 FROM eligible_show WHERE id = ?").get(row?.id ?? "")).not.toBeNull();
  const verdict = isEligible(
    {
      category: row?.category as string,
      isFree: false,
      priceMin: row?.price_min as number,
      startsAt: row?.starts_at as string,
      timeKind: "timed",
      venuePlaced: false,
    },
    null,
    NOW,
  );
  expect(verdict.eligible).toBe(false);
  db.close();
});
