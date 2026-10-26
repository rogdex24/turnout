import { expect, test } from "bun:test";
import { hasRealVenue, REAL_VENUE_SQL } from "../src/catalog/listability.js";
import { memoryDb } from "./helpers.js";

test("canonical venue eligibility matches public SQLite placeholder rules", () => {
  const db = memoryDb();
  for (const name of [null, "", "  ", "\t", "TBD\t", "  TBA  ", "Venue TBD", "venue to be announced", "Lamakaan"]) {
    const row = db.query(`SELECT ${REAL_VENUE_SQL} AS eligible FROM (SELECT ? AS venue_name)`).get(name) as { eligible: number | null };
    expect({ name, eligible: hasRealVenue(name) }).toEqual({ name, eligible: row.eligible === 1 });
  }
  db.close();
});
