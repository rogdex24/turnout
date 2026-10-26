/** Catalog facts shared by canonical selection, the public view and admin reasons. */
const PLACEHOLDERS = ["tbd", "tba", "venue tbd", "venue tba"];
const PLACEHOLDER_PHRASES = ["to be announced", "to be decided"];

export const NO_VENUE_SQL = "(venue_name IS NULL OR TRIM(venue_name) = '')";
export const PLACEHOLDER_VENUE_SQL = `(
  LOWER(TRIM(venue_name)) IN (${PLACEHOLDERS.map((name) => `'${name}'`).join(", ")})
  OR ${PLACEHOLDER_PHRASES.map((phrase) => `LOWER(venue_name) LIKE '%${phrase}%'`).join(" OR ")}
)`;
export const REAL_VENUE_SQL = `(NOT ${NO_VENUE_SQL} AND NOT ${PLACEHOLDER_VENUE_SQL})`;

export function hasRealVenue(name: string | null): boolean {
  // SQLite TRIM removes ASCII spaces, so canonical ranking uses exactly that rule.
  const value = name?.replace(/^ +| +$/g, "").toLowerCase();
  return !!value && !PLACEHOLDERS.includes(value) && !PLACEHOLDER_PHRASES.some((phrase) => value.includes(phrase));
}

const SOURCE_TIERS = [
  ["communitie", "luma", "meraevents", "townscript"],
  ["district", "allevents", "bookmyshow", "growezy"],
];

export function sourceTrustTier(source: string): number {
  const tier = SOURCE_TIERS.findIndex((sources) => sources.includes(source));
  return tier === -1 ? SOURCE_TIERS.length : tier;
}
