import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import { asRecord, cleanTitle, isSourceUrl, MAX_DAYS_FROM_NOW, MAX_DESCRIPTION_LENGTH, readNumber, readString } from "./shared.js";

/**
 * Growezy organizer pages. Growezy hosts one page per organizer and has no
 * city-wide index, so this scrapes a named list of pages rather than the site.
 *
 * The pages are Next.js App Router, and the schema.org JSON-LD they emit carries
 * only a date (midnight UTC), not the time an event actually starts. The real
 * clock times live in the RSC payload the page streams for hydration, so that is
 * what this parses. If that format changes the parse yields nothing, which the
 * per-source health check treats as a silent failure and holds the events.
 */
export const SOURCE_NAME = "growezy";
export const RATE_LIMIT_MS = 1100;
export const BASE_URL = process.env.GROWEZY_BASE_URL ?? "https://growezy.club";

/** Organizer page slugs to scrape. Add one per organizer worth following. */
export const PAGES: string[] = (process.env.GROWEZY_PAGES ?? "events-by-marvity-")
  .split(",")
  .map((page) => page.trim())
  .filter(Boolean);

/** Prices come through in paise. */
const PAISE_PER_RUPEE = 100;

export interface GrowezyRawEvent {
  id: string;
  page: string;
  urlKey: string;
  title: string;
  description: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  isOnline: boolean;
  priceMin: number | null;
  /** One entry per bookable moment: an ISO UTC start plus the slot's own id. */
  slots: { slotId: string; startsAt: string }[];
}

/**
 * Rebuilds the RSC payload a Next.js page streams as `self.__next_f.push([1, "..."])`
 * chunks. Each chunk is a JSON string literal, and they concatenate in order.
 */
export function flightPayload(html: string): string {
  const chunks = html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g);
  let payload = "";
  for (const [, literal] of chunks) {
    try {
      payload += JSON.parse(literal!) as string; // group 1 is mandatory in the pattern;
    } catch {
      // A truncated chunk is not worth abandoning the rest of the page for.
    }
  }
  return payload;
}

/**
 * Long strings are streamed separately and referenced as "$25", resolved from a
 * `25:T<hex length>,<text>` line elsewhere in the payload.
 */
export function resolveTextRef(payload: string, value: unknown): string | null {
  const direct = readString(value);
  if (!direct) return null;
  if (!direct.startsWith("$")) return direct;

  const chunk = new RegExp(`(?:^|\\n)${direct.slice(1)}:T([0-9a-f]+),`).exec(payload);
  if (!chunk) return null;
  const start = chunk.index + chunk[0].length;
  return payload.slice(start, start + Number.parseInt(chunk[1]!, 16)).trim() || null;
}

/** Reads the first complete JSON array that starts at `from`, ignoring what follows. */
function readJsonArray(payload: string, from: number): unknown[] | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < payload.length; i += 1) {
    const char = payload[i];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') inString = !inString;
    else if (inString) continue;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(payload.slice(from, i + 1)) as unknown[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** IST is a fixed +05:30, so a wall-clock date and time convert without a tz database. */
function toUtcIso(date: unknown, time: unknown): string | null {
  const day = readString(date)?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const clock = readString(time) ?? "00:00";
  if (!/^\d{1,2}:\d{2}$/.test(clock)) return null;
  // The clock regex above guarantees both parts.
  const [hour, minute] = clock.split(":");
  const at = new Date(`${day}T${hour!.padStart(2, "0")}:${minute}:00+05:30`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function parseDisplayItem(item: unknown, page: string, payload: string): GrowezyRawEvent | null {
  const record = asRecord(item);
  if (record?.type !== "offering") return null;

  const id = readString(record.id);
  const urlKey = readString(record.urlKey);
  const title = readString(record.name);
  if (!id || !urlKey || !title) return null;

  const location = asRecord(record.locationDetails) ?? {};
  const description = resolveTextRef(payload, record.description);
  const price = readNumber(record.price);

  const slots: GrowezyRawEvent["slots"] = [];
  for (const day of Array.isArray(record.scheduleDetails) ? record.scheduleDetails : []) {
    const schedule = asRecord(day);
    if (!schedule) continue;
    for (const slot of Array.isArray(schedule.timeSlots) ? schedule.timeSlots : []) {
      const timeSlot = asRecord(slot);
      const startsAt = toUtcIso(schedule.date, timeSlot?.time);
      const slotId = readString(timeSlot?.id) ?? readString(schedule.dateId);
      if (startsAt && slotId) slots.push({ slotId, startsAt });
    }
  }

  return {
    id,
    page,
    urlKey,
    title,
    description: description ? stripHtml(description).slice(0, MAX_DESCRIPTION_LENGTH) : null,
    venueName: readString(location.venue),
    address: readString(location.address),
    city: readString(location.city),
    isOnline: location.isOnline === true,
    priceMin: price === null ? null : price / PAISE_PER_RUPEE,
    slots,
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePage(html: string, page: string): GrowezyRawEvent[] {
  const payload = flightPayload(html);
  const anchor = '"displayItems":';
  const at = payload.indexOf(anchor);
  if (at === -1) return [];
  const items = readJsonArray(payload, at + anchor.length);
  if (!items) return [];

  const events: GrowezyRawEvent[] = [];
  for (const item of items) {
    const parsed = parseDisplayItem(item, page, payload);
    if (parsed) events.push(parsed);
  }
  return events;
}

export function eventUrl(raw: GrowezyRawEvent): string {
  return `${BASE_URL}/${raw.page}/${raw.urlKey}`;
}

/** Organizers occasionally host outside the city; keep what is in Hyderabad. */
export function isHyderabadEvent(raw: GrowezyRawEvent): boolean {
  if (raw.isOnline) return false;
  const haystack = `${raw.city ?? ""} ${raw.venueName ?? ""} ${raw.address ?? ""}`.toLowerCase();
  return /\bhyderabad\b|\bsecunderabad\b/.test(haystack);
}

export function toOccurrences(raw: GrowezyRawEvent, now: Date = new Date()): Occurrence[] {
  if (!isHyderabadEvent(raw)) return [];

  const sourceUrl = eventUrl(raw);
  if (!isSourceUrl(sourceUrl)) return [];
  const title = cleanTitle(raw.title);
  const isFree = raw.priceMin !== null && raw.priceMin <= 0;

  const occurrences: Occurrence[] = [];
  for (const slot of raw.slots) {
    const daysFromNow = (Date.parse(slot.startsAt) - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysFromNow < -1 || daysFromNow > MAX_DAYS_FROM_NOW) continue;

    occurrences.push({
      sourceEventId: raw.id,
      sourceSlotId: slot.slotId,
      slug: raw.urlKey,
      title,
      description: raw.description,
      timeKind: "timed",
      startsAt: slot.startsAt,
      endsAt: null,
      venueName: raw.venueName,
      address: raw.address,
      latitude: null,
      longitude: null,
      categories: [],
      tags: [],
      priceMin: raw.priceMin,
      isFree,
      sourceUrl,
    });
  }
  return occurrences;
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<GrowezyRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const events: GrowezyRawEvent[] = [];

  for (const [index, page] of PAGES.entries()) {
    const url = `${BASE_URL}/${page}`;
    const response = await fetchImpl(url, {
      headers: { accept: "text/html", "user-agent": USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`Growezy fetch failed ${response.status} ${response.statusText} for ${url}`);
    }
    events.push(...parsePage(await response.text(), page));
    if (sleepMs > 0 && index < PAGES.length - 1) await Bun.sleep(sleepMs);
  }

  return events;
}
