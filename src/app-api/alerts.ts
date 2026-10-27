import type { Database } from "bun:sqlite";
import type { Tunables } from "../social/model/tunables.js";
import type { Clock } from "../utils/clock.js";
import type { FetchLike } from "../utils/http.js";
import { istCalendarDate } from "../utils/time.js";

/** Tells the operator something needs a person. The text never holds a phone number, a code or a name. */
export interface Alerts {
  notify(kind: string, text: string): Promise<void>;
}

/** A kind of alert is sent at most once an hour, so a loop of failures is one message. */
const REPEAT_MS = 60 * 60 * 1000;

export interface AlertOptions {
  now: Clock;
  fetch: FetchLike;
  /** An https webhook that takes `{ "text": "..." }` (Slack-style). Without one the alert goes to the process log. */
  webhookUrl: string | null;
  /** Where a message goes when there is no webhook, or the webhook fails. */
  write?: (line: string) => void;
}

export function createAlerts({ now, fetch, webhookUrl, write = (line) => console.error(line) }: AlertOptions): Alerts {
  const lastSent = new Map<string, number>();
  return {
    async notify(kind, text) {
      const at = now().getTime();
      const last = lastSent.get(kind);
      if (last !== undefined && at - last < REPEAT_MS) return;
      lastSent.set(kind, at);
      const message = `[turnout alert] ${kind}: ${text}`;
      if (webhookUrl === null) {
        write(message);
        return;
      }
      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        if (!response.ok) write(`${message} (the alert webhook answered ${response.status})`);
      } catch {
        write(`${message} (the alert webhook could not be reached)`);
      }
    },
  };
}

/** An alert collector for tests. */
export function recordingAlerts(): Alerts & { sent: { kind: string; text: string }[] } {
  const sent: { kind: string; text: string }[] = [];
  return {
    sent,
    async notify(kind, text) {
      sent.push({ kind, text });
    },
  };
}

/** The first and last second of the IST month holding `now`, as epoch seconds, and a label like `2026-10`. */
function istMonth(now: Date): { label: string; startSeconds: number; endSeconds: number } {
  const label = istCalendarDate(now).slice(0, 7);
  const [year, month] = label.split("-").map(Number) as [number, number];
  const start = Date.parse(`${label}-01T00:00:00+05:30`);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return { label, startSeconds: start / 1000, endSeconds: Date.parse(`${next}-01T00:00:00+05:30`) / 1000 };
}

/** The key the day-by-day count of code messages sent is kept under. It names no person, so it is not hashed. */
export const OTP_SENDS_KEY = "otp:sends";

/** Messages sent so far this IST month (the sum of the day counters). */
export function otpSendsThisMonth(db: Database, now: Date): number {
  const { startSeconds, endSeconds } = istMonth(now);
  const row = db
    .query("SELECT COALESCE(SUM(count), 0) AS total FROM rate_bucket WHERE bucket_key = ? AND window_start >= ? AND window_start < ?")
    .get(OTP_SENDS_KEY, startSeconds, endSeconds) as { total: number };
  return row.total;
}

/**
 * Alerts once for each spend level (500, 1,000 and 1,500 INR a month by default) the month's WhatsApp messages have reached.
 * A marker row per month and level makes it once, even across restarts. The ticker calls this.
 */
export async function checkOtpSpend(db: Database, now: Date, alerts: Alerts, t: Tunables): Promise<number[]> {
  const spend = otpSendsThisMonth(db, now) * t.otp.priceInr;
  const { label, startSeconds, endSeconds } = istMonth(now);
  const crossed: number[] = [];
  for (const level of t.otp.spendAlertsInr) {
    if (spend < level) continue;
    const marker = db
      .query("INSERT OR IGNORE INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, ?, 1)")
      .run(`alert:spend:${label}:${level}`, startSeconds, endSeconds - startSeconds);
    if (marker.changes === 0) continue;
    crossed.push(level);
    await alerts.notify(
      `otp_spend_${level}`,
      `WhatsApp sign-in codes have cost about ${Math.round(spend)} INR this month (alert level ${level} INR).`,
    );
  }
  return crossed;
}
