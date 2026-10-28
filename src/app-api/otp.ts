import { createHmac, timingSafeEqual } from "node:crypto";
import type { OtpChallengeResponse, OtpDeliveryStatus, OtpRequest, OtpVerifyRequest, TokenPair } from "@turnout/contract/app/auth";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import { banReason, isPhoneRefused } from "../social/bans.js";
import { addMinutes } from "../social/dates.js";
import { createMember, getMemberByPhone, markPhoneVerified, recordConsent } from "../social/members.js";
import { normalizePhone } from "../social/model/phone.js";
import type { RateRule } from "../social/model/tunables.js";
import {
  type ChallengeRow,
  getChallenge,
  insertChallenge,
  latestOpenChallenge,
  recordSendFailed,
  recordSent,
  voidOpenChallenges,
} from "../social/otpChallenges.js";
import { revokeAllSessions } from "../social/sessions.js";
import { ulid } from "../utils/ulid.js";
import { OTP_SENDS_KEY } from "./alerts.js";
import type { AppContext } from "./context.js";
import type { AppConfig } from "./env.js";
import { AppError } from "./errors.js";
import { retryAfter } from "./http.js";
import { addUse, blockPhone, consumeAll, isPhoneBlocked, type LimitEntry, rateKey, usedNow } from "./rateLimit.js";
import { openSession } from "./sessions.js";

/** The answer for every refusal that must not tell the caller why (a banned number, a recent "I did not ask for this"). */
const unavailable = (): AppError => new AppError(403, "sign_in_unavailable", "sign in is not available for this number right now");

const invalidCode = (): AppError => new AppError(400, "invalid_code", "that code is not right, or it has expired");

/** The phone as the challenge table keeps it: a keyed hash, never the number. */
export function phoneHash(config: AppConfig, e164: string): string {
  return createHmac("sha256", config.otpPepper).update(`phone:${e164}`).digest("hex");
}

/** HMAC(OTP_PEPPER, challengeId + code). */
export function codeHmac(config: AppConfig, challengeId: string, code: string): string {
  return createHmac("sha256", config.otpPepper).update(`${challengeId}${code}`).digest("hex");
}

/** A 6 digit code from the system's random source. Values past the last whole multiple of 10^6 are thrown away so no digit is likelier. */
export function generateCode(digits = 6): string {
  const modulus = 10 ** digits;
  const limit = Math.floor(2 ** 32 / modulus) * modulus;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] as number;
    if (value < limit) return String(value % modulus).padStart(digits, "0");
  }
}

/**
 * Asks for a sign-in code. Checks run in this order: the ban list (refusing reasons only), the 24 hour "I did not ask" block, the per phone limits, the
 * per address limits, the daily cap. The first two refuse with one generic message; the limits say 429 with `Retry-After`. Nothing
 * is counted and no earlier code is cancelled unless every check passes, and nothing is sent before they have.
 */
export async function requestOtp(app: AppContext, input: OtpRequest, ip: string, now: Date): Promise<OtpChallengeResponse> {
  const { config, db } = app;
  const e164 = normalizePhone(input.phone, config.phoneAllowlist);
  if (e164 === null) throw new AppError(400, "bad_phone", "enter an Indian mobile number");
  if (isPhoneRefused(db, config.banPepper, e164) || isPhoneBlocked(db, config.otpPepper, e164, now)) throw unavailable();
  return issueCode(app, e164, "sign_in", ip, now);
}

/**
 * Asks for the code that confirms deleting the signed-in member's own account. It goes to the member's own number, under the same
 * limits, cap and reviewer rule as a sign-in code, and lives `deleteCodeExpiresMinutes`. A number the owner reported with
 * "I did not request this code" gets none, so a stolen session cannot delete the account.
 */
export async function requestDeleteCode(app: AppContext, e164: string, ip: string, now: Date): Promise<OtpChallengeResponse> {
  if (isPhoneBlocked(app.db, app.config.otpPepper, e164, now)) throw unavailable();
  return issueCode(app, e164, "delete_account", ip, now);
}

async function issueCode(
  app: AppContext,
  e164: string,
  purpose: ChallengeRow["purpose"],
  ip: string,
  now: Date,
): Promise<OtpChallengeResponse> {
  const { config, db } = app;
  const reviewer = config.reviewer !== null && config.reviewer.phone === e164;

  const rate = config.tunables.rate;
  const entries: LimitEntry[] = [];
  // The store-review number skips the per phone limits and the cap (a reviewer must always get in) but not the address limits.
  if (!reviewer) {
    entries.push({ name: "phone", key: rateKey(config.otpPepper, "otp:phone:short", e164), rule: rate.otpPerPhoneShort });
    entries.push({ name: "phone", key: rateKey(config.otpPepper, "otp:phone:day", e164), rule: rate.otpPerPhoneDay });
  }
  entries.push({ name: "ip", key: rateKey(config.otpPepper, "otp:ip:minute", ip), rule: rate.otpPerIpMinute });
  entries.push({ name: "ip", key: rateKey(config.otpPepper, "otp:ip:day", ip), rule: rate.otpPerIpDay });
  if (!reviewer) entries.push({ name: "cap", key: OTP_SENDS_KEY, rule: { limit: config.tunables.otp.dailyCap, window: "ist_day" } });

  const limited = consumeAll(db, entries, now);
  if (!limited.ok) {
    if (limited.name === "cap") {
      await app.alerts.notify(
        "otp_daily_cap",
        `The daily cap of ${config.tunables.otp.dailyCap} sign-in codes is used up; sign-in is paused until the IST day ends.`,
      );
      throw new AppError(503, "otp_cap_reached", "sign in is paused for today, try again tomorrow", retryAfter(limited.retryAfterSeconds));
    }
    throw new AppError(429, "rate_limited", "too many tries, wait a little and try again", retryAfter(limited.retryAfterSeconds));
  }

  const id = ulid(now);
  const code = reviewer && config.reviewer !== null ? config.reviewer.code : generateCode(config.tunables.otp.digits);
  const hash = phoneHash(config, e164);
  const expiresAt = addMinutes(
    now,
    purpose === "sign_in" ? config.tunables.otp.expiresMinutes : config.tunables.otp.deleteCodeExpiresMinutes,
  );
  db.transaction(() => {
    voidOpenChallenges(db, hash, now);
    insertChallenge(db, {
      id,
      phoneHash: hash,
      purpose,
      codeHmac: codeHmac(config, id, code),
      now,
      expiresAt,
      deliveryStatus: reviewer ? "reviewer" : "pending",
    });
  })();

  if (!reviewer) {
    let result: Awaited<ReturnType<typeof app.sender.send>>;
    try {
      result = await app.sender.send({ phone: e164, code });
    } catch {
      result = { ok: false, errorCode: null };
    }
    if (!result.ok) {
      recordSendFailed(db, id, result.errorCode, now);
      // 131042 means the WhatsApp account's billing is not in order: nothing will send until a person fixes it.
      await app.alerts.notify(
        result.errorCode === "131042" ? "whatsapp_131042" : "whatsapp_send_failed",
        result.errorCode === "131042"
          ? "WhatsApp refused to send a sign-in code (131042, billing). Check the WhatsApp Business payment method."
          : `WhatsApp could not send a sign-in code (error ${result.errorCode ?? "none"}).`,
      );
      throw new AppError(503, "otp_send_failed", "we could not send the code, try again in a minute");
    }
    recordSent(db, id, result.wamid, result.deliveryStatus ?? "sent", result.errorCode ?? null);
  }
  return { challengeId: id, expiresAt: expiresAt.toISOString() };
}

/** What the app is told about the message: `pending` reads as `sent`, and a reviewer code (never sent) as `delivered`. */
export function challengeDeliveryStatus(app: AppContext, challengeId: string, now: Date): OtpDeliveryStatus | null {
  const row = getChallenge(app.db, challengeId);
  if (row === null || new Date(row.expires_at).getTime() <= now.getTime()) return null;
  if (row.delivery_status === "pending") return "sent";
  if (row.delivery_status === "reviewer") return "delivered";
  return row.delivery_status;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Checks a code and spends it. Every problem with the code (unknown, someone else's, used, cancelled, expired, wrong) is the same
 * 400, so the answer teaches nothing. Each wrong try is counted atomically and the challenge is cancelled at the fifth. One case is
 * told apart: the caller's own sign-in code offered to confirm a deletion is a 403, so a code that opened a session cannot end the account.
 */
async function spendCode(
  app: AppContext,
  input: { challengeId: string; code: string },
  e164: string,
  purpose: ChallengeRow["purpose"],
  now: Date,
): Promise<void> {
  const { config, db } = app;
  // The store-review number has a fixed code and may ask for codes without limit, so its wrong tries are capped for the IST day.
  const failRule: RateRule = { limit: config.tunables.otp.reviewerFailCapPerDay, window: "ist_day" };
  const failKey = rateKey(config.otpPepper, "otp:reviewer:fail", e164);
  const reviewer = config.reviewer !== null && config.reviewer.phone === e164;
  if (reviewer && usedNow(db, failKey, failRule, now) >= failRule.limit) {
    await app.alerts.notify(
      "otp_reviewer_locked",
      "The store-review number has used up its wrong tries for today; its sign-in is refused until the IST day ends.",
    );
    throw invalidCode();
  }

  const challenge = getChallenge(db, input.challengeId);
  const at = now.toISOString();
  if (challenge === null || !sameHash(challenge.phone_hash, phoneHash(config, e164))) throw invalidCode();
  if (challenge.purpose !== purpose) {
    if (purpose === "delete_account") throw new AppError(403, "forbidden", "that code cannot be used to delete the account");
    throw invalidCode();
  }
  if (challenge.consumed_at !== null || challenge.voided_at !== null || challenge.expires_at <= at) throw invalidCode();

  const max = config.tunables.otp.maxAttempts;
  const counted = db
    .query("UPDATE otp_challenge SET attempts = attempts + 1 WHERE id = ? AND attempts < ? AND consumed_at IS NULL AND voided_at IS NULL")
    .run(challenge.id, max);
  if (counted.changes === 0) throw invalidCode();
  if (!sameHash(challenge.code_hmac, codeHmac(config, challenge.id, input.code))) {
    if (reviewer) addUse(db, failKey, failRule, now);
    if (challenge.attempts + 1 >= max)
      db.query("UPDATE otp_challenge SET voided_at = ? WHERE id = ? AND voided_at IS NULL").run(at, challenge.id);
    throw invalidCode();
  }
  const consumed = db
    .query("UPDATE otp_challenge SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND voided_at IS NULL")
    .run(at, challenge.id);
  if (consumed.changes === 0) throw invalidCode();
}

/** Confirms deleting the member's own account: the code must be a `delete_account` code sent to this number. */
export async function confirmDeleteCode(
  app: AppContext,
  input: { challengeId: string; code: string },
  e164: string,
  now: Date,
): Promise<void> {
  await spendCode(app, input, e164, "delete_account", now);
}

/**
 * Checks a code and signs the person in. The member and the first consent record are made here, once, the first time a number signs in.
 */
export async function verifyOtp(app: AppContext, input: OtpVerifyRequest, now: Date): Promise<TokenPair> {
  const { config, db } = app;
  if (input.noticeVersion !== NOTICE_VERSION)
    throw new AppError(400, "unknown_notice_version", "the privacy notice has been updated, reload the app");
  const e164 = normalizePhone(input.phone, config.phoneAllowlist);
  if (e164 === null) throw new AppError(400, "bad_phone", "enter an Indian mobile number");
  await spendCode(app, input, e164, "sign_in", now);

  // The ban list is read again here: a number can be banned between the request and the code being typed.
  if (isPhoneRefused(db, config.banPepper, e164)) throw unavailable();
  let member = getMemberByPhone(db, e164);
  if (member === null) {
    member = createMember(db, e164, now, banReason(db, config.banPepper, e164) === "downvote_stop");
  } else if (member.status === "banned" || member.deleted_at !== null) {
    throw unavailable();
  } else if (member.status === "suspended") {
    throw new AppError(403, "account_suspended", "this account is suspended");
  } else {
    markPhoneVerified(db, member.id, now);
  }
  recordConsent(db, member.id, input.noticeVersion, now);
  return openSession(app, member.id, now);
}

/**
 * "I did not request this code" (the WhatsApp button): the number gets no code for 24 hours and any open code stops working. When the
 * latest open code was a delete code, someone holding the member's session asked for it, so the member is signed out everywhere.
 */
export function handleNotRequested(app: AppContext, e164: string, now: Date): void {
  const hash = phoneHash(app.config, e164);
  const latest = latestOpenChallenge(app.db, hash);
  blockPhone(app.db, app.config.otpPepper, e164, now, app.config.tunables.otp.notRequestedBlockHours);
  voidOpenChallenges(app.db, hash, now);
  if (latest?.purpose === "delete_account") {
    const member = getMemberByPhone(app.db, e164);
    if (member !== null) revokeAllSessions(app.db, member.id, now);
  }
}
