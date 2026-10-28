import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * The number as E.164, or null when it may not sign in. Indian mobile numbers (a bare 10 digits, with 0 or 91 or +91) are accepted;
 * any other number only when it is written out in `allowlist`, which holds the test phones and the reviewer's number.
 */
export function normalizePhone(raw: string, allowlist: readonly string[] = []): string | null {
  const compact = raw.trim().replace(/[\s\-().]/g, "");
  if (E164.test(compact) && allowlist.includes(compact)) return compact;
  const parsed = parsePhoneNumberFromString(raw.trim(), "IN");
  if (parsed === undefined || !parsed.isValid() || parsed.country !== "IN" || parsed.getType() !== "MOBILE") return null;
  return parsed.number;
}

/** The last four digits, for "signed in as ...1234" on the Settings screen. */
export function phoneLast4(e164: string): string {
  return e164.slice(-4);
}
