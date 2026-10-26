/**
 * Serve-time mute rules. Sync keeps ingesting everything; these decide what the
 * site, the API, the calendar feeds and the sitemap will show.
 *
 * Filtering here rather than at ingest keeps every rule reversible: unmute and
 * the events are already in the database, with no re-sync and no lost history.
 */

import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export const MUTE_FIELDS = ["category", "source", "venue", "area", "title"] as const;
export type MuteField = (typeof MUTE_FIELDS)[number];

export interface MuteRule {
  id: string;
  field: MuteField;
  value: string;
  note: string | null;
  created_at: string;
}

export function isMuteField(value: string): value is MuteField {
  return (MUTE_FIELDS as readonly string[]).includes(value);
}

/**
 * SQL that is true when rule `r` hides `event`, for splicing into a WHERE clause
 * that has both `event` and `mute_rule r` in scope. The one definition of what a
 * rule matches: NOT_MUTED, countMuted and the admin's hidden reasons all use it.
 *
 * category, source and area match exactly: all three hold closed vocabularies,
 * and category is the classified enum the site filters on, not the raw labels a
 * source publishes. Title and venue are free text, so they match as a
 * case-insensitive substring.
 */
export const RULE_MATCHES_EVENT = `(
              (r.field = 'source' AND event.source = r.value)
           OR (r.field = 'area' AND event.area = r.value)
           OR (r.field = 'category' AND event.category = r.value)
           OR (r.field = 'title' AND LOWER(event.title) LIKE '%' || LOWER(r.value) || '%')
           OR (r.field = 'venue' AND LOWER(COALESCE(event.venue_name, '')) LIKE '%' || LOWER(r.value) || '%')
         )`;

/** SQL that excludes a muted event, for splicing into a WHERE clause on `event`. */
export const NOT_MUTED = `NOT EXISTS (
           SELECT 1 FROM mute_rule r
           WHERE ${RULE_MATCHES_EVENT}
         )`;

export function listMuteRules(db: Database): MuteRule[] {
  return db.prepare("SELECT id, field, value, note, created_at FROM mute_rule ORDER BY field, value").all() as MuteRule[];
}

/** Adding a rule that already exists is a no-op, so this is safe to re-run. */
export function addMuteRule(db: Database, field: MuteField, value: string, note?: string): void {
  db.prepare("INSERT INTO mute_rule (id, field, value, note, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(field, value) DO NOTHING").run(
    randomUUID(),
    field,
    value.trim(),
    note ?? null,
    new Date().toISOString(),
  );
}

export function removeMuteRule(db: Database, field: MuteField, value: string): boolean {
  return db.prepare("DELETE FROM mute_rule WHERE field = ? AND value = ?").run(field, value.trim()).changes > 0;
}

/** How many active events each rule currently hides, for `mute list`. */
export function countMuted(db: Database, field: MuteField, value: string): number {
  // The rule may not exist yet (`mute add` previews its effect), so bind it as a
  // one-row table under the alias RULE_MATCHES_EVENT expects.
  return (
    db
      .prepare(
        `SELECT COUNT(*) c FROM event, (SELECT ? AS field, ? AS value) r
         WHERE event.status = 'active' AND ${RULE_MATCHES_EVENT}`,
      )
      .get(field, value) as { c: number }
  ).c;
}
