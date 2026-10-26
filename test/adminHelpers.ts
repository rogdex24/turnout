import type { Database } from "bun:sqlite";
import type { FetchedItem } from "../src/ingestion/sources/types.js";
import { runSync } from "../src/ingestion/sync.js";
import { memoryDb } from "./helpers.js";

export function item(
  id: string,
  o: Partial<{ title: string; categories: string[]; venueName: string | null; startsAt: string }> = {},
): FetchedItem {
  return {
    id,
    raw: { id, note: "raw body" },
    occurrences: [
      {
        sourceEventId: id,
        sourceSlotId: "s1",
        slug: id,
        title: o.title ?? `Event ${id}`,
        description: null,
        timeKind: "timed" as const,
        startsAt: o.startsAt ?? "2026-09-13T13:30:00.000Z",
        endsAt: null,
        venueName: o.venueName === undefined ? "Phoenix Arena" : o.venueName,
        address: null,
        latitude: null,
        longitude: null,
        categories: o.categories ?? [],
        tags: [],
        priceMin: null,
        isFree: true,
        sourceUrl: `https://example.test/${id}`,
      },
    ],
  };
}

/** One event per hidden reason plus a listed one, and a duplicate pair across sources. */
export async function seedAdmin(): Promise<Database> {
  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      bookmyshow: [
        item("listed", { title: "Standup Night", categories: ["Comedy Shows"] }),
        item("novenue", { title: "Mystery Show", venueName: null }),
        item("tbd", { title: "Placeholder Show", venueName: "Venue TBA" }),
        item("announce", { title: "Announce Show", venueName: "Hall To Be Announced" }),
        item("dup", { title: "Twin Concert", venueName: "Twin Hall", startsAt: "2026-09-20T13:30:00.000Z" }),
      ],
      district: [item("dup-d", { title: "Twin Concert", venueName: "Twin Hall", startsAt: "2026-09-20T13:30:00.000Z" })],
    },
  });
  return db;
}
