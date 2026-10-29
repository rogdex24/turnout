import type { Database } from "bun:sqlite";
import { seedShow } from "./socialFixture.js";

let counter = 0;

/**
 * A group that is already done, with the people in it, written straight into the tables: for tests that need many shows, past the
 * feedback window, without running the ticker through each one. `checkedIn` lists the members who checked in.
 */
export function pastGroup(
  db: Database,
  options: { startsAt: string; memberIds: string[]; checkedIn?: string[]; state?: string },
): { groupId: string; showId: string; refs: Map<string, string> } {
  const n = counter++;
  const showId = seedShow(db, { id: `past-show-${n}`, startsAt: options.startsAt });
  const groupId = `past-group-${n}`;
  const stamp = options.startsAt;
  db.query(
    `INSERT INTO show_group (id, event_id, starts_at, group_type, state, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?, ?)`,
  ).run(groupId, showId, options.startsAt, options.state ?? "done", stamp, stamp);
  const refs = new Map<string, string>();
  for (const memberId of options.memberIds) {
    const planId = `past-plan-${n}-${refs.size}`;
    const ref = `ref-${n}-${refs.size}`;
    db.query(
      `INSERT INTO plan (id, member_id, event_id, dedupe_key, group_type, state, show_title, show_starts_at, venue_name, group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 'done', ?, ?, 'Hall', ?, ?, ?)`,
    ).run(planId, memberId, showId, showId, `Show ${showId}`, options.startsAt, groupId, stamp, stamp);
    db.query(
      "INSERT INTO group_member (id, group_id, member_id, plan_id, member_ref, joined_at, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(`past-gm-${n}-${refs.size}`, groupId, memberId, planId, ref, stamp, options.checkedIn?.includes(memberId) ? stamp : null);
    refs.set(memberId, ref);
  }
  return { groupId, showId, refs };
}
