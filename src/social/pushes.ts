import type { Database } from "bun:sqlite";
import { ulid } from "../utils/ulid.js";
import { addDays, addMinutes } from "./dates.js";
import { type DeviceRow, disableDevice } from "./devices.js";
import type { NoticePushState, NoticeRow } from "./notices.js";

export interface PushJob {
  notice: NoticeRow;
  devices: DeviceRow[];
}

export interface PushPlan {
  jobs: PushJob[];
  /** Notices that were closed without a send, and why. `no_device` is the one worth a log line. */
  skipped: { noticeId: string; state: Exclude<NoticePushState, "pending" | "sending" | "sent"> }[];
}

/**
 * Works out which pending notices to push now, and claims them. A notice past its `stale_after` is closed as `stale` (it stays in
 * the list). One whose member has no device is `no_device`; one whose devices are all on a platform that is not sending is
 * `not_sent`. The rest are jobs, marked `sending` with `claimed_at` in the same immediate transaction that read them, so a second
 * pass cannot pick them up while the first is on the network. A claim older than `leaseSeconds` is taken again: the pass that
 * made it died or is stuck, and a repeated push is better than a lost one.
 */
export function planPushes(db: Database, now: Date, platforms: readonly string[], leaseSeconds: number, limit = 200): PushPlan {
  const at = now.toISOString();
  const lapsed = new Date(now.getTime() - leaseSeconds * 1000).toISOString();
  return db
    .transaction(() => {
      const open = db
        .query("SELECT * FROM notice WHERE push_state = 'pending' OR (push_state = 'sending' AND claimed_at <= ?) ORDER BY id LIMIT ?")
        .all(lapsed, limit) as NoticeRow[];
      const plan: PushPlan = { jobs: [], skipped: [] };
      const close = db.query("UPDATE notice SET push_state = ?, claimed_at = NULL WHERE id = ?");
      const claim = db.query("UPDATE notice SET push_state = 'sending', claimed_at = ? WHERE id = ?");
      for (const notice of open) {
        if (notice.stale_after <= at) {
          close.run("stale", notice.id);
          plan.skipped.push({ noticeId: notice.id, state: "stale" });
          continue;
        }
        const devices = db
          .query("SELECT * FROM device WHERE member_id = ? AND disabled_at IS NULL ORDER BY created_at, id")
          .all(notice.member_id) as DeviceRow[];
        const sendable = devices.filter((d) => platforms.includes(d.platform));
        if (sendable.length === 0) {
          const state = devices.length === 0 ? "no_device" : "not_sent";
          close.run(state, notice.id);
          plan.skipped.push({ noticeId: notice.id, state });
          continue;
        }
        claim.run(at, notice.id);
        plan.jobs.push({ notice: { ...notice, push_state: "sending", claimed_at: at }, devices: sendable });
      }
      return plan;
    })
    .immediate();
}

/** Gives the claims back, for a send that never reached the push service. They are tried again on the next pass. */
export function releaseClaims(db: Database, noticeIds: readonly string[]): void {
  const release = db.query("UPDATE notice SET push_state = 'pending', claimed_at = NULL WHERE id = ? AND push_state = 'sending'");
  db.transaction(() => {
    for (const id of noticeIds) release.run(id);
  })();
}

export interface PushResult {
  deviceId: string;
  /** Expo's ticket id when it took the message. */
  ticketId: string | null;
  errorCode: string | null;
  /** Expo said the token is not registered any more. */
  gone: boolean;
}

/**
 * Records what the push service answered for one notice. Any accepted message closes the notice as `sent`. When every device was
 * gone it closes as `no_device`. Otherwise the claim is released and the notice is tried again until it goes stale.
 */
export function recordPushResults(db: Database, noticeId: string, results: readonly PushResult[], now: Date): NoticePushState {
  const at = now.toISOString();
  return db.transaction(() => {
    for (const r of results) {
      const status = r.ticketId !== null ? "ticketed" : r.gone ? "device_gone" : "failed";
      db.query(
        "INSERT INTO push_delivery (id, notice_id, device_id, expo_ticket_id, status, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(ulid(now), noticeId, r.deviceId, r.ticketId, status, r.errorCode, at);
      if (r.gone) disableDevice(db, r.deviceId, now);
    }
    const state: NoticePushState = results.some((r) => r.ticketId !== null)
      ? "sent"
      : results.length > 0 && results.every((r) => r.gone)
        ? "no_device"
        : "pending";
    if (state === "pending") {
      releaseClaims(db, [noticeId]);
    } else {
      db.query(
        "UPDATE notice SET push_state = ?, pushed_at = ?, claimed_at = NULL WHERE id = ? AND push_state IN ('pending', 'sending')",
      ).run(state, at, noticeId);
    }
    return state;
  })();
}

export interface ReceiptDue {
  deliveryId: string;
  ticketId: string;
  deviceId: string;
}

/** Deliveries whose receipt Expo should have by now (about 15 minutes after the send). */
export function receiptsDue(db: Database, now: Date, delayMinutes: number, limit = 300): ReceiptDue[] {
  return db
    .query(
      `SELECT id AS deliveryId, expo_ticket_id AS ticketId, device_id AS deviceId FROM push_delivery
       WHERE status = 'ticketed' AND expo_ticket_id IS NOT NULL AND created_at <= ? ORDER BY created_at, id LIMIT ?`,
    )
    .all(addMinutes(now, -delayMinutes).toISOString(), limit) as ReceiptDue[];
}

export function recordReceipt(
  db: Database,
  due: ReceiptDue,
  outcome: { ok: true } | { ok: false; errorCode: string; gone: boolean },
  now: Date,
): void {
  const at = now.toISOString();
  db.transaction(() => {
    if (outcome.ok) {
      db.query("UPDATE push_delivery SET status = 'delivered', receipt_checked_at = ? WHERE id = ? AND status = 'ticketed'").run(
        at,
        due.deliveryId,
      );
      return;
    }
    db.query("UPDATE push_delivery SET status = ?, error_code = ?, receipt_checked_at = ? WHERE id = ? AND status = 'ticketed'").run(
      outcome.gone ? "device_gone" : "failed",
      outcome.errorCode,
      at,
      due.deliveryId,
    );
    if (outcome.gone) disableDevice(db, due.deviceId, now);
  })();
}

/** Expo keeps receipts for a day. A delivery with no receipt after two days is closed as failed so it is not asked about again. */
export function expireReceipts(db: Database, now: Date): number {
  return db
    .query(
      "UPDATE push_delivery SET status = 'failed', error_code = 'no_receipt', receipt_checked_at = ? WHERE status = 'ticketed' AND created_at < ?",
    )
    .run(now.toISOString(), addDays(now, -2).toISOString()).changes;
}
