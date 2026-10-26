import type { Database } from "bun:sqlite";
import { REAL_VENUE_SQL } from "../catalog/listability.js";
import { NOT_MUTED } from "../curation/mute.js";

/**
 * The one rule for what the public may see: active, canonical, a real venue,
 * and not muted. Every page, feed and tool reads listable_event instead of
 * restating this, so a change here reaches all of them.
 *
 * NOT_MUTED qualifies its columns with `event.`, which resolves because the
 * view selects from event.
 */
const LISTABLE_EVENT_SQL = `
DROP VIEW IF EXISTS listable_event;
CREATE VIEW listable_event AS
SELECT * FROM event
WHERE status = 'active'
  AND is_canonical = 1
  AND ${REAL_VENUE_SQL}
  AND ${NOT_MUTED};
`;

/** Recreated on every migrate, so a changed definition always applies. */
export function migrate(db: Database): void {
  db.exec(LISTABLE_EVENT_SQL);
}
