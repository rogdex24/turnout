import type { Database } from "bun:sqlite";
import { createHmac } from "node:crypto";
import type { RateRule, RateWindow } from "../social/model/tunables.js";
import { AppError } from "./errors.js";
import { retryAfter } from "./http.js";

const IST_OFFSET_SECONDS = 5.5 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;

/** The fixed window that holds `now`: its start (epoch seconds) and length. An IST day starts at IST midnight. */
export function windowFor(window: RateWindow, now: Date): { start: number; seconds: number } {
  const epoch = Math.floor(now.getTime() / 1000);
  if (window === "ist_day")
    return { start: Math.floor((epoch + IST_OFFSET_SECONDS) / DAY_SECONDS) * DAY_SECONDS - IST_OFFSET_SECONDS, seconds: DAY_SECONDS };
  return { start: Math.floor(epoch / window.seconds) * window.seconds, seconds: window.seconds };
}

/** What a counter is stored under: a keyed hash of what is being counted, so the table holds no phone number or address. */
export function rateKey(pepper: string, scope: string, subject: string): string {
  return createHmac("sha256", pepper).update(`${scope}\n${subject}`).digest("hex");
}

export interface LimitEntry {
  /** A label the caller uses to tell which limit tripped. */
  name: string;
  key: string;
  rule: RateRule;
}

export type LimitResult = { ok: true } | { ok: false; name: string; retryAfterSeconds: number };

function used(db: Database, key: string, start: number): number {
  const row = db.query("SELECT count FROM rate_bucket WHERE bucket_key = ? AND window_start = ?").get(key, start) as {
    count: number;
  } | null;
  return row?.count ?? 0;
}

/**
 * Checks every entry and, only if all have room, counts one against each, in one transaction. A refused call counts nothing, so
 * being refused by one limit does not use up the others.
 */
export function consumeAll(db: Database, entries: readonly LimitEntry[], now: Date): LimitResult {
  return db
    .transaction((): LimitResult => {
      const windows = entries.map((entry) => ({ entry, window: windowFor(entry.rule.window, now) }));
      const epoch = Math.floor(now.getTime() / 1000);
      for (const { entry, window } of windows) {
        if (used(db, entry.key, window.start) >= entry.rule.limit) {
          return { ok: false, name: entry.name, retryAfterSeconds: Math.max(1, window.start + window.seconds - epoch) };
        }
      }
      const upsert = db.query(
        "INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, ?, 1) ON CONFLICT (bucket_key, window_start) DO UPDATE SET count = count + 1",
      );
      for (const { entry, window } of windows) upsert.run(entry.key, window.start, window.seconds);
      return { ok: true };
    })
    .immediate();
}

/** Counts one use of a limit and throws 429 with `Retry-After` when it is used up. */
export function enforce(db: Database, pepper: string, scope: string, subject: string, rule: RateRule, now: Date): void {
  const result = consumeAll(db, [{ name: scope, key: rateKey(pepper, scope, subject), rule }], now);
  if (!result.ok) throw new AppError(429, "rate_limited", "too many requests, try again later", retryAfter(result.retryAfterSeconds));
}

/** "I didn't request this code": this number gets no code for `hours`. A row that runs out by itself. */
export function blockPhone(db: Database, pepper: string, phone: string, now: Date, hours: number): void {
  const epoch = Math.floor(now.getTime() / 1000);
  db.query(
    "INSERT INTO rate_bucket (bucket_key, window_start, window_seconds, count) VALUES (?, ?, ?, 1) ON CONFLICT (bucket_key, window_start) DO NOTHING",
  ).run(rateKey(pepper, "notrequested", phone), epoch, hours * 3600);
}

export function isPhoneBlocked(db: Database, pepper: string, phone: string, now: Date): boolean {
  const epoch = Math.floor(now.getTime() / 1000);
  return (
    db
      .query("SELECT 1 FROM rate_bucket WHERE bucket_key = ? AND window_start + window_seconds > ?")
      .get(rateKey(pepper, "notrequested", phone), epoch) !== null
  );
}
