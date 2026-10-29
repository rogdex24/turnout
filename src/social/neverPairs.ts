import type { Database } from "bun:sqlite";

/**
 * The pairs among these people who must not share a group: every downvote and every report, whichever way it went. Each pair is
 * `[a, b]` in no particular order; `neverPairSet` makes the order not matter. Deleting a person deletes their downvotes, and a
 * report keeps its ids after a deletion, so a reported pair stays apart whoever remains in the pool.
 */
export function neverPairsAmong(db: Database, memberIds: readonly string[]): [string, string][] {
  if (memberIds.length < 2) return [];
  const marks = memberIds.map(() => "?").join(", ");
  const rows = db
    .query(
      `SELECT voter_id AS a, target_id AS b FROM downvote WHERE voter_id IN (${marks}) AND target_id IN (${marks})
       UNION
       SELECT reporter_id AS a, subject_id AS b FROM report WHERE reporter_id IN (${marks}) AND subject_id IN (${marks})`,
    )
    .all(...memberIds, ...memberIds, ...memberIds, ...memberIds) as { a: string; b: string }[];
  return rows.map((r) => [r.a, r.b]);
}
