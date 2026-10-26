import type { Database } from "bun:sqlite";
import { NO_VENUE_SQL, PLACEHOLDER_VENUE_SQL } from "../catalog/listability.js";
import { RULE_MATCHES_EVENT } from "../curation/mute.js";

/**
 * Why an event is not in `listable_event`, one string per failed condition.
 *
 * `listable_event` (web/schema.ts) stays the only definition of "public". Admin
 * never imports web, so this shares venue facts from catalog and reuses the
 * mute SQL from curation. test/admin-reasons.test.ts proves the two agree for
 * every reason and fails when the view changes without this file.
 */
const VENUE_FLAGS_SQL = `
  SELECT status, is_canonical, dedupe_group_id,
         ${NO_VENUE_SQL} AS no_venue,
         ${PLACEHOLDER_VENUE_SQL} AS placeholder_venue
  FROM event WHERE id = ?`;

const MUTED_BY_SQL = `
  SELECT r.field, r.value FROM event, mute_rule r
  WHERE event.id = ? AND ${RULE_MATCHES_EVENT}
  ORDER BY r.field, r.value`;

interface Flags {
  status: string;
  is_canonical: number;
  dedupe_group_id: string | null;
  no_venue: number;
  placeholder_venue: number | null;
}

export function hiddenReasons(db: Database, eventId: string): string[] {
  const flags = db.prepare(VENUE_FLAGS_SQL).get(eventId) as Flags | null;
  if (!flags) return [];

  const reasons: string[] = [];
  if (flags.status !== "active") reasons.push("delisted");
  if (!flags.is_canonical) reasons.push(`duplicate of ${flags.dedupe_group_id ?? "unknown"}`);
  if (flags.no_venue) reasons.push("no venue");
  else if (flags.placeholder_venue) reasons.push("placeholder venue");
  for (const rule of db.prepare(MUTED_BY_SQL).all(eventId) as { field: string; value: string }[]) {
    reasons.push(`muted by ${rule.field}=${rule.value}`);
  }
  return reasons;
}

/** SQL fragment: true when the event is in the public view. Needs `event` in scope. */
export const IS_LISTED_SQL = "EXISTS (SELECT 1 FROM listable_event l WHERE l.id = event.id)";
