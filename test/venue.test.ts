import { expect, test } from "bun:test";
import { isPlaceholderVenueName, normalizeVenueKey } from "../src/catalog/venue.js";
import { runSync } from "../src/ingestion/sync.js";
import { siteResponse } from "../src/web/index.js";
import { memoryDb } from "./helpers.js";

// The placeholder rule is written twice: isPlaceholderVenueName in TypeScript
// and the listable_event view as SQL in web/schema.ts. These are the exact strings that
// appear in live source data; if the two copies drift, this fails.
const PLACEHOLDER_VENUES = [
  "TBD",
  "TBA",
  "Venue TBD",
  "Venue TBA",
  "Venue to be announced",
  "Venue To Be Announced: Hyderabad",
  "venue to be decided",
];

test("both copies of the placeholder-venue rule reject the same names", async () => {
  for (const name of PLACEHOLDER_VENUES) {
    expect(isPlaceholderVenueName(normalizeVenueKey(name))).toBe(true);
  }

  const db = memoryDb();
  await runSync({
    db,
    fetchedBySource: {
      district: PLACEHOLDER_VENUES.map((venueName, index) => ({
        id: `p${index}`,
        raw: { id: `p${index}` },
        occurrences: [
          {
            sourceEventId: `p${index}`,
            sourceSlotId: "s1",
            slug: `p${index}`,
            title: `Placeholder ${index}`,
            description: null,
            timeKind: "timed" as const,
            startsAt: "2026-09-13T13:30:00.000Z",
            endsAt: null,
            venueName,
            address: null,
            latitude: null,
            longitude: null,
            categories: [],
            tags: [],
            priceMin: null,
            isFree: true,
            sourceUrl: "https://example.test",
          },
        ],
      })),
    },
  });

  const html = await siteResponse(db, new Request("http://localhost/"), () => new Date("2026-09-13T00:00:00Z")).text();
  for (const [index] of PLACEHOLDER_VENUES.entries()) {
    expect(html).not.toContain(`Placeholder ${index}`);
  }
  db.close();
});

test("a real venue is not mistaken for a placeholder", () => {
  for (const name of ["Lamakaan", "Phoenix Arena", "Shilpakala Vedika", "Tbagz Cafe"]) {
    expect(isPlaceholderVenueName(normalizeVenueKey(name))).toBe(false);
  }
});
