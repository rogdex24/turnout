import type { Database } from "bun:sqlite";
import { addDays } from "./dates.js";

export interface SessionRow {
  id: string;
  member_id: string;
  refresh_hash: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  revoked_at: string | null;
  replaced_by: string | null;
  replaced_at: string | null;
}

export function getSession(db: Database, id: string): SessionRow | null {
  return db.query("SELECT * FROM auth_session WHERE id = ?").get(id) as SessionRow | null;
}

export function getSessionByRefreshHash(db: Database, refreshHash: string): SessionRow | null {
  return db.query("SELECT * FROM auth_session WHERE refresh_hash = ?").get(refreshHash) as SessionRow | null;
}

/** Opens a session. `expires_at` is the refresh token's expiry: `refreshDays` from now. */
export function insertSession(
  db: Database,
  input: { id: string; memberId: string; refreshHash: string; now: Date; refreshDays: number },
): SessionRow {
  const at = input.now.toISOString();
  const expires = addDays(input.now, input.refreshDays).toISOString();
  db.query("INSERT INTO auth_session (id, member_id, refresh_hash, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    input.id,
    input.memberId,
    input.refreshHash,
    at,
    at,
    expires,
  );
  return getSession(db, input.id) as SessionRow;
}

/**
 * Exchanges one refresh token for the next in one step: the old row is marked rotated and revoked, the new row takes its place.
 * Returns false (and changes nothing) when the old row was already rotated or revoked, so two racing refreshes cannot both win.
 */
export function rotateSession(
  db: Database,
  input: { oldId: string; id: string; memberId: string; refreshHash: string; now: Date; refreshDays: number },
): boolean {
  return db.transaction(() => {
    const at = input.now.toISOString();
    const result = db
      .query(
        "UPDATE auth_session SET revoked_at = ?, replaced_at = ?, last_used_at = ? WHERE id = ? AND revoked_at IS NULL AND replaced_at IS NULL",
      )
      .run(at, at, at, input.oldId);
    if (result.changes === 0) return false;
    insertSession(db, input);
    db.query("UPDATE auth_session SET replaced_by = ? WHERE id = ?").run(input.id, input.oldId);
    return true;
  })();
}

/** Signs one device out. */
export function revokeSession(db: Database, id: string, now: Date): void {
  db.query("UPDATE auth_session SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now.toISOString(), id);
}

/** Signs a member out everywhere. Returns how many sessions were still open. */
export function revokeAllSessions(db: Database, memberId: string, now: Date): number {
  return db.query("UPDATE auth_session SET revoked_at = ? WHERE member_id = ? AND revoked_at IS NULL").run(now.toISOString(), memberId)
    .changes;
}
