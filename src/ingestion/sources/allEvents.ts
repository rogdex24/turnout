import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import { cleanTitle, isSourceUrl, MAX_DAYS_FROM_NOW } from "./shared.js";

// AllEvents.in Hyderabad city listing: HTML page with embedded JSON-LD (title,
// url, venue, geo) and a parallel event-card list (date text, price text) that
// JSON-LD doesn't carry. We correlate the two by the numeric event id, which
// appears both in the JSON-LD url and as the card's `data-eid` attribute.

export const SOURCE_NAME = "allevents";
const BASE_URL = "https://allevents.in/hyderabad/all";
export const RATE_LIMIT_MS = 1100; // just over 1 req/sec, per SPEC.md 9.3
const MAX_PAGES = 20;
const MAX_VENUES_PER_TITLE = 12; // data-model.md 6.1 junk filter

// data-model.md 6.1: reject known spam patterns before storage.
const SPAM_TITLE_PATTERNS: RegExp[] = [
  /\bastrology\b/i,
  /\bmake money\b/i,
  /\badmission open\b/i,
  /\bdistance mba\b/i,
  /\bwebinar\b(?=.*\bcertificate\b)/i,
];

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

// Matches "Sat, 19 Sep • 06:00 PM" and "Fri, 02 Oct, 2026 - 06:30 PM"
// (year and separator both vary; a trailing "+ 2 more" is ignored).
const DATE_TEXT_PATTERN = /(\d{1,2})\s+([A-Za-z]{3})(?:,?\s*(\d{4}))?\s*[•-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;

export interface AllEventsRawEvent {
  id: string;
  title: string;
  sourceUrl: string;
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Raw scraped text, e.g. "Sat, 19 Sep • 06:00 PM"; null when the card had none. */
  startsAtText: string | null;
  /** Raw scraped text: "Free", "INR 499", "INR 1.0k", or null when unknown. */
  priceText: string | null;
}

interface JsonLdEvent {
  "@type"?: string;
  name?: string;
  url?: string;
  location?: {
    name?: string;
    address?: { streetAddress?: string };
    geo?: { latitude?: string; longitude?: string };
  };
}

function extractJsonLdEvents(html: string): JsonLdEvent[] {
  for (const match of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(match[1]!) as unknown; // group 1 is mandatory in the pattern
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.["@type"] === "Event") {
        return parsed as JsonLdEvent[];
      }
    } catch {
      // not JSON, or not the events block; keep scanning other script tags
    }
  }
  return [];
}

function idFromUrl(url: string | undefined): string | null {
  const match = url?.match(/\/(\d+)\/?$/);
  return match ? match[1]! : null; // group 1 is mandatory in the pattern
}

function findCardBlock(html: string, id: string): string | null {
  const start = html.indexOf(`data-eid="${id}"`);
  if (start === -1) return null;
  const end = html.indexOf("</li>", start);
  return end === -1 ? html.slice(start) : html.slice(start, end);
}

function extractDateText(cardBlock: string): string | null {
  const match = cardBlock.match(/class="date"[^>]*>\s*([^<]+?)\s*<\/div>/);
  return match ? match[1]!.replace(/\s+/g, " ").trim() : null;
}

function extractPriceText(cardBlock: string): string | null {
  const start = cardBlock.indexOf('class="meta-bottom"');
  const scope = start === -1 ? cardBlock : cardBlock.slice(start);
  const text = scope.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  if (/\bFree\b/i.test(text)) return "Free";
  const priced = text.match(/INR\s*[\d.]+k?/i);
  return priced ? priced[0].trim() : null;
}

/** Parses one listing page's HTML into raw event records. Pure function, no I/O. */
export function parseListingPage(html: string): AllEventsRawEvent[] {
  const events: AllEventsRawEvent[] = [];

  for (const raw of extractJsonLdEvents(html)) {
    const id = idFromUrl(raw.url);
    if (!id || !raw.name || !raw.url) continue;
    const cardBlock = findCardBlock(html, id);
    const latitude = Number(raw.location?.geo?.latitude);
    const longitude = Number(raw.location?.geo?.longitude);

    events.push({
      id,
      title: raw.name,
      sourceUrl: raw.url,
      venueName: raw.location?.name ?? null,
      address: raw.location?.address?.streetAddress ?? null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      startsAtText: cardBlock ? extractDateText(cardBlock) : null,
      priceText: cardBlock ? extractPriceText(cardBlock) : null,
    });
  }

  return events;
}

/** Wall-clock text is Asia/Kolkata, matching every other Indian Tier A source. */
export function parseStartsAt(dateText: string, now: Date = new Date()): string | null {
  const match = dateText.match(DATE_TEXT_PATTERN);
  if (!match) return null;
  // The month, hour, minute and AM/PM groups are mandatory in DATE_TEXT_PATTERN.
  const [, dayStr, monthStr, yearStr, hourStr, minuteStr, ampm] = match;
  const month = MONTHS[monthStr!.toLowerCase()];
  if (month === undefined) return null;

  let hour = Number(hourStr) % 12;
  if (ampm!.toUpperCase() === "PM") hour += 12;
  const day = Number(dayStr);
  const minute = Number(minuteStr);

  const build = (year: number): Date =>
    new Date(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
        `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`,
    );

  if (yearStr) {
    const withYear = build(Number(yearStr));
    return Number.isNaN(withYear.getTime()) ? null : withYear.toISOString();
  }

  // No year on the card: assume the current IST year, rolling to next year
  // for dates that would otherwise land in the past (e.g. scraped in late
  // December for an early-January event).
  const currentYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", year: "numeric" }).format(now));
  const candidate = build(currentYear);
  if (Number.isNaN(candidate.getTime())) return null;
  const oneDayMs = 24 * 60 * 60 * 1000;
  return candidate.getTime() < now.getTime() - oneDayMs ? build(currentYear + 1).toISOString() : candidate.toISOString();
}

export function parsePrice(priceText: string | null): { priceMin: number | null; isFree: boolean } {
  if (!priceText) return { priceMin: null, isFree: false }; // "unknown" is distinct from "free"
  if (/free/i.test(priceText)) return { priceMin: 0, isFree: true };
  const match = priceText.match(/INR\s*([\d.]+)(k)?/i);
  if (!match) return { priceMin: null, isFree: false };
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return { priceMin: Number.isFinite(value) ? value : null, isFree: false };
}

function isSpamTitle(title: string): boolean {
  return SPAM_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/**
 * data-model.md 6.1's "same title at more than 12 venues" rule needs the
 * whole batch, not one record, so it runs as a separate pass over the
 * fetched page(s) rather than inside toOccurrence.
 */
export function dropVenueFloodedTitles(events: AllEventsRawEvent[]): AllEventsRawEvent[] {
  const venuesByTitle = new Map<string, Set<string>>();
  for (const event of events) {
    const key = event.title.trim().toLowerCase();
    const venues = venuesByTitle.get(key) ?? new Set<string>();
    if (event.venueName) venues.add(event.venueName);
    venuesByTitle.set(key, venues);
  }
  return events.filter((event) => (venuesByTitle.get(event.title.trim().toLowerCase())?.size ?? 0) <= MAX_VENUES_PER_TITLE);
}

/** Applies the section 6.1 junk filter and normalises a survivor into an Occurrence. Returns null to hold. */
export function toOccurrence(raw: AllEventsRawEvent, now: Date = new Date()): Occurrence | null {
  if (!isSourceUrl(raw.sourceUrl)) return null;
  if (!raw.venueName && !raw.address) return null; // online-only, no Hyderabad venue
  if (isSpamTitle(raw.title)) return null;

  const startsAt = raw.startsAtText ? parseStartsAt(raw.startsAtText, now) : null;
  if (!startsAt) return null;
  const daysFromNow = (new Date(startsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (Math.abs(daysFromNow) > MAX_DAYS_FROM_NOW) return null;

  const { priceMin, isFree } = parsePrice(raw.priceText);

  return {
    sourceEventId: raw.id,
    sourceSlotId: "default",
    slug: null,
    title: cleanTitle(raw.title),
    description: null,
    timeKind: "timed",
    startsAt,
    endsAt: null,
    venueName: raw.venueName,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    categories: [],
    tags: [],
    priceMin,
    isFree,
    sourceUrl: raw.sourceUrl,
  };
}

export interface FetchAllEventsOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

async function fetchPage(page: number, fetchImpl: FetchLike): Promise<string> {
  const url = page <= 1 ? BASE_URL : `${BASE_URL}?page=${page}`;
  const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`AllEvents page ${page} failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/** Pages until a page repeats only already-seen ids, which is how this site signals "past the end". */
export async function fetchAllEvents(options: FetchAllEventsOptions = {}): Promise<AllEventsRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const seen = new Set<string>();
  const all: AllEventsRawEvent[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const html = await fetchPage(page, fetchImpl);
    const events = parseListingPage(html);
    if (events.length === 0) break;

    let newOnPage = 0;
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        all.push(event);
        newOnPage += 1;
      }
    }
    if (newOnPage === 0) break;
    if (page < MAX_PAGES && sleepMs > 0) await Bun.sleep(sleepMs);
  }

  return dropVenueFloodedTitles(all);
}
