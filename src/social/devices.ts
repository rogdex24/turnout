import type { Database } from "bun:sqlite";
import type { PushPlatformName } from "@turnout/contract/app/devices";
import { ulid } from "../utils/ulid.js";

export interface DeviceRow {
  id: string;
  member_id: string;
  session_id: string | null;
  expo_token: string;
  platform: PushPlatformName;
  created_at: string;
  last_seen_at: string;
  disabled_at: string | null;
}

/** The most devices one member keeps; registering another drops the one seen longest ago. */
export const MAX_DEVICES_PER_MEMBER = 10;

export function getDevice(db: Database, id: string): DeviceRow | null {
  return db.query("SELECT * FROM device WHERE id = ?").get(id) as DeviceRow | null;
}

/**
 * Registers a push token for the member and the session that sent it. A token seen before keeps its id and moves to the
 * new owner (the phone changed hands), and is switched back on if it had been disabled.
 */
export function registerDevice(
  db: Database,
  input: { memberId: string; sessionId: string; expoToken: string; platform: PushPlatformName; now: Date },
): DeviceRow {
  const at = input.now.toISOString();
  return db.transaction(() => {
    const known = db.query("SELECT * FROM device WHERE expo_token = ?").get(input.expoToken) as DeviceRow | null;
    if (known !== null) {
      db.query("UPDATE device SET member_id = ?, session_id = ?, platform = ?, last_seen_at = ?, disabled_at = NULL WHERE id = ?").run(
        input.memberId,
        input.sessionId,
        input.platform,
        at,
        known.id,
      );
      return getDevice(db, known.id) as DeviceRow;
    }
    const id = ulid(input.now);
    db.query(
      "INSERT INTO device (id, member_id, session_id, expo_token, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(id, input.memberId, input.sessionId, input.expoToken, input.platform, at, at);
    db.query(
      `DELETE FROM device WHERE member_id = ? AND id NOT IN
         (SELECT id FROM device WHERE member_id = ? ORDER BY last_seen_at DESC, id DESC LIMIT ?)`,
    ).run(input.memberId, input.memberId, MAX_DEVICES_PER_MEMBER);
    return getDevice(db, id) as DeviceRow;
  })();
}

/** Removes the member's own device. False when it does not exist or belongs to someone else (the same answer for both). */
export function removeDevice(db: Database, memberId: string, deviceId: string): boolean {
  return db.query("DELETE FROM device WHERE id = ? AND member_id = ?").run(deviceId, memberId).changes > 0;
}

/** Sign-out: the session's device goes with it. */
export function removeSessionDevices(db: Database, sessionId: string): number {
  return db.query("DELETE FROM device WHERE session_id = ?").run(sessionId).changes;
}

export function memberDevices(db: Database, memberId: string): DeviceRow[] {
  return db.query("SELECT * FROM device WHERE member_id = ? AND disabled_at IS NULL ORDER BY created_at, id").all(memberId) as DeviceRow[];
}

/** Expo said the token is no longer registered: stop sending to it. */
export function disableDevice(db: Database, id: string, now: Date): void {
  db.query("UPDATE device SET disabled_at = ? WHERE id = ? AND disabled_at IS NULL").run(now.toISOString(), id);
}
