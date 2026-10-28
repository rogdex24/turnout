import { type HandleKind, normalizeHandle } from "@turnout/contract/profile";

export interface ParsedHandle {
  kind: HandleKind;
  handle: string;
}

/** Which service a pasted value points at. A link says so. A bare name with a hyphen cannot be an Instagram handle. Otherwise Instagram. */
export function guessHandleKind(input: string): HandleKind {
  const text = input.trim();
  if (/linkedin\.com/i.test(text) || /^\/?in\//i.test(text)) return "linkedin";
  if (/instagram\.com/i.test(text)) return "instagram";
  return text.includes("-") ? "linkedin" : "instagram";
}

/**
 * The one field on the profile takes an Instagram or LinkedIn handle in any form a person pastes. The contract's `normalizeHandle`
 * does the cleaning, so the form accepts what the server stores. Returns null when it is not a handle for the guessed service.
 */
export function parseHandleInput(input: string): ParsedHandle | null {
  const text = input.trim();
  const strayAt = text.includes("@") && !text.startsWith("@");
  const otherLink = /^https?:\/\//i.test(text) && !/(instagram|linkedin)\.com\//i.test(text);
  if (text === "" || /\s/.test(text) || strayAt || otherLink) return null;
  const kind = guessHandleKind(text);
  const handle = normalizeHandle(kind, text);
  return handle === null ? null : { kind, handle };
}
