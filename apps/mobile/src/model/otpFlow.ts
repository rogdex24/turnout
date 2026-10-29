import type { OtpStatusResponse } from "@turnout/contract/app/auth";
import { isApiError } from "./apiError";
import { digitsOnly, type PhoneOptions } from "./phone";

export const OTP = {
  codeLength: 6,
  /** The contract has no `resendAfter`, so this is the floor; a longer `Retry-After` wins. */
  resendWaitMs: 30_000,
  /** "Not there yet?" appears once a minute has passed since the send. */
  notThereYetMs: 60_000,
  pollEveryMs: 3_000,
  pollForMs: 120_000,
  /** The server cancels the code on the fifth wrong try. */
  maxWrongTries: 5,
} as const;

const DEFAULT_WAIT_SECONDS = 60;

/**
 * The phone field as it is typed or pasted: digits only, a pasted +91, 91 or leading 0 dropped, ten digits at most, grouped in
 * fives. Dev and e2e builds keep a full +1 202 555 01xx seed number whole, and keep a lone + so the number can be typed one key at
 * a time, which is how Maestro enters it.
 */
export function phoneFieldText(raw: string, options: PhoneOptions = {}): string {
  const trimmed = raw.trim();
  if (options.allowSeedNumbers && trimmed === "+") return trimmed;
  if (options.allowSeedNumbers && trimmed.startsWith("+1")) return `+${digitsOnly(trimmed).slice(0, 11)}`;
  let digits = digitsOnly(trimmed);
  if (digits.length >= 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length >= 11 && digits.startsWith("0")) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function resendAt(sentAt: number, retryAfterSeconds: number | null = null): number {
  return sentAt + Math.max(OTP.resendWaitMs, (retryAfterSeconds ?? 0) * 1000);
}

/** When "Not there yet?" shows: a minute after the send, or when resend opens if that is later. */
export function askAgainAt(sentAt: number, resendOpensAt: number): number {
  return Math.max(sentAt + OTP.notThereYetMs, resendOpensAt);
}

export function pollRemainingMs(startedAt: number, now: number): number {
  return Math.max(0, OTP.pollForMs - (now - startedAt));
}

export type DeliveryOutcome = "waiting" | "done" | "not_delivered" | "not_on_whatsapp";

export function deliveryOutcome(status: OtpStatusResponse["deliveryStatus"]): DeliveryOutcome {
  if (status === "undeliverable") return "not_on_whatsapp";
  if (status === "failed") return "not_delivered";
  if (status === "read") return "done";
  return "waiting";
}

export type SendFailure =
  | { kind: "bad_phone" }
  | { kind: "refused" }
  | { kind: "paused" }
  | { kind: "wait"; seconds: number }
  | { kind: "could_not_send" }
  | { kind: "offline" }
  | { kind: "server" };

/** Every 403 is the same refusal, so the screen never says why a number was turned away. */
export function sendFailure(error: unknown): SendFailure {
  if (!isApiError(error)) return { kind: "server" };
  if (error.kind === "offline") return { kind: "offline" };
  if (error.kind === "forbidden") return { kind: "refused" };
  if (error.code === "bad_phone") return { kind: "bad_phone" };
  if (error.code === "otp_cap_reached") return { kind: "paused" };
  if (error.code === "otp_send_failed") return { kind: "could_not_send" };
  if (error.kind === "rate_limited") return { kind: "wait", seconds: error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS };
  return { kind: "server" };
}

export type VerifyFailure =
  | { kind: "wrong_code"; triesLeft: number }
  | { kind: "too_many_tries" }
  | { kind: "refused" }
  | { kind: "update_app" }
  | { kind: "wait"; seconds: number }
  | { kind: "offline" }
  | { kind: "server" };

export function triesLeft(wrongTries: number): number {
  return Math.max(0, OTP.maxWrongTries - wrongTries);
}

/** `wrongTries` counts this attempt, so the fifth wrong code is the one that cancels the challenge. */
export function verifyFailure(error: unknown, wrongTries: number): VerifyFailure {
  if (!isApiError(error)) return { kind: "server" };
  if (error.kind === "offline") return { kind: "offline" };
  if (error.kind === "forbidden") return { kind: "refused" };
  if (error.code === "invalid_code") {
    const left = triesLeft(wrongTries);
    return left === 0 ? { kind: "too_many_tries" } : { kind: "wrong_code", triesLeft: left };
  }
  if (error.code === "unknown_notice_version") return { kind: "update_app" };
  if (error.kind === "rate_limited") return { kind: "wait", seconds: error.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS };
  return { kind: "server" };
}

/** Six digits from whatever was pasted, or an empty string when there are fewer than six. */
export function codeFromText(text: string): string {
  const digits = digitsOnly(text);
  return digits.length >= OTP.codeLength ? digits.slice(0, OTP.codeLength) : "";
}
