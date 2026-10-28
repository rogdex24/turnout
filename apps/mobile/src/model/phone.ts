export type PhoneParse = { ok: true; phone: string; national: string } | { ok: false };

export interface PhoneOptions {
  /** Dev and e2e builds also take a full +1 202 555 01xx number, because the staging server's allowlist holds the seed members. */
  allowSeedNumbers?: boolean;
}

const SEED_NUMBER = /^\+1\d{3}55501\d{2}$/;

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * An Indian mobile number: 10 digits starting 6 to 9, typed with or without +91, 91 or a leading 0. The server does the real
 * parsing and answers `bad_phone`; this stops the obvious slips before a code is spent.
 */
export function parsePhoneInput(input: string, options: PhoneOptions = {}): PhoneParse {
  const trimmed = input.trim();
  if (options.allowSeedNumbers && SEED_NUMBER.test(trimmed.replace(/[\s-]/g, ""))) {
    const phone = trimmed.replace(/[\s-]/g, "");
    return { ok: true, phone, national: phone.slice(1) };
  }
  if (/[^\d\s+()-]/.test(trimmed)) return { ok: false };
  let digits = digitsOnly(trimmed);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return { ok: false };
  return { ok: true, phone: `+91${digits}`, national: digits };
}

/** `+91` then the number in two groups of five, for the code screen's lead and the field as it is typed. */
export function formatIndianMobile(national: string): string {
  const digits = digitsOnly(national).slice(0, 10);
  return digits.length > 5 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : `+91 ${digits}`.trim();
}
