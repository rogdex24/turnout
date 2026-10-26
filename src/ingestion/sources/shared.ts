/** Helpers every scraper needs. Each source module used to carry its own copy. */

export type Json = Record<string, unknown>;

/** Junk filters from data-model.md 6.1: drop far-future events, clip long blurbs. */
export const MAX_DAYS_FROM_NOW = 400;
export const MAX_DESCRIPTION_LENGTH = 400;

export function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function readBool(value: unknown): boolean {
  return value === true;
}

const NOISE_PATTERNS: RegExp[] = [/\bpresents?\b/gi, /\bin association with\b/gi, /\bpowered by\b/gi, /\bfeat\.?\b/gi, /\bft\.?\b/gi];

export function cleanTitle(title: string): string {
  let cleaned = title;
  for (const pattern of NOISE_PATTERNS) cleaned = cleaned.replace(pattern, " ");
  return cleaned.trim().replace(/\s+/g, " ");
}

/** Ticket links must be absolute web URLs, never executable or relative schemes. */
export function isSourceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) && URL.canParse(value);
}

/** Covers are hotlinked, so on top of isSourceUrl they must be https. */
export function httpsCover(value: unknown): string | null {
  const text = readString(value);
  return text && isSourceUrl(text) && /^https:/i.test(text) ? text : null;
}
