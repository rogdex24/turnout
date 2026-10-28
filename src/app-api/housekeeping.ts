import type { Database } from "bun:sqlite";
import { addDays } from "../social/dates.js";
import { allPhotoKeys } from "../social/profiles.js";
import { deleteExpiredMessages } from "../social/thread.js";
import { allTicketKeys } from "../social/tickets.js";
import { sweepOrphans } from "../utils/objectStore.js";
import { checkOtpSpend, OTP_SENDS_KEY } from "./alerts.js";
import type { AppContext } from "./context.js";
import { windowFor } from "./rateLimit.js";

/** The send counters stay about two months so the spend alert can add up a whole month. */
const SEND_COUNTER_DAYS = 62;
const SWEEP_MARKER_KEY = "sweep:files";
/** The only prefixes the sweep looks at. */
const SWEPT_PREFIXES = ["photos/", "tickets/"] as const;

/** Every file key a row points at. */
function referencedFileKeys(db: Database): Set<string> {
  return new Set([...allPhotoKeys(db), ...allTicketKeys(db)]);
}

/** The audit trail of operator actions is kept a year. */
const OPERATOR_ACTION_DAYS = 365;
/** A sent alert only has to outlast the thing it was about, which is over within a day of the show. */
const ALERT_SENT_DAYS = 30;

/** Rows that have done their job: old challenges, sessions long past their use, and counters whose window is over. */
export function sweepRows(db: Database, now: Date, revokedRetentionDays: number, noticeRetentionDays = 30): void {
  const epoch = Math.floor(now.getTime() / 1000);
  db.query("DELETE FROM otp_challenge WHERE expires_at < ?").run(addDays(now, -1).toISOString());
  const cutoff = addDays(now, -revokedRetentionDays).toISOString();
  db.query("DELETE FROM auth_session WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)").run(cutoff, cutoff);
  db.query("DELETE FROM rate_bucket WHERE bucket_key != ? AND window_start + window_seconds <= ?").run(OTP_SENDS_KEY, epoch);
  db.query("DELETE FROM rate_bucket WHERE bucket_key = ? AND window_start < ?").run(
    OTP_SENDS_KEY,
    epoch - SEND_COUNTER_DAYS * 24 * 60 * 60,
  );
  const noticeCutoff = addDays(now, -noticeRetentionDays).toISOString();
  db.transaction(() => {
    db.query("DELETE FROM push_delivery WHERE created_at < ?").run(noticeCutoff);
    db.query("DELETE FROM push_delivery WHERE notice_id IN (SELECT id FROM notice WHERE created_at < ?)").run(noticeCutoff);
    db.query("DELETE FROM notice WHERE created_at < ?").run(noticeCutoff);
  })();
  db.query("DELETE FROM alert_sent WHERE sent_at < ?").run(addDays(now, -ALERT_SENT_DAYS).toISOString());
  db.query("DELETE FROM operator_action WHERE created_at < ?").run(addDays(now, -OPERATOR_ACTION_DAYS).toISOString());
}

/**
 * Once an IST day: delete stored files no row points at. Returns the keys removed (empty when it already ran today). The day is
 * marked done only after the pass finishes, so a pass that fails (the store is down) is tried again on the next tick.
 */
export async function sweepFiles(app: AppContext, now: Date): Promise<string[]> {
  const day = windowFor("ist_day", now);
  const done = app.db.query("SELECT 1 FROM rate_bucket WHERE bucket_key = ? AND window_start = ?").get(SWEEP_MARKER_KEY, day.start);
  if (done !== null) return [];
  const removed = await sweepOrphans(app.store, referencedFileKeys(app.db), now, SWEPT_PREFIXES);
  app.db
    .query("INSERT OR IGNORE INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, ?, 1)")
    .run(SWEEP_MARKER_KEY, day.start, day.seconds);
  return removed;
}

/** One round of upkeep, run by the ticker. Each step is independent: one failing does not stop the others. */
export async function housekeeping(app: AppContext): Promise<void> {
  const now = app.now();
  const steps: (() => unknown)[] = [
    () => sweepRows(app.db, now, app.config.tunables.session.revokedRetentionDays, app.config.tunables.noticeRetentionDays),
    () => deleteExpiredMessages(app.db, now, app.config.tunables),
    () => checkOtpSpend(app.db, now, app.alerts, app.config.tunables),
    () => sweepFiles(app, now),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      app.log({
        at: now.toISOString(),
        method: "TICK",
        route: "housekeeping",
        status: 500,
        ms: 0,
        error: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}
