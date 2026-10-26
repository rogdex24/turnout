import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import {
  asRecord,
  cleanTitle,
  isSourceUrl,
  MAX_DAYS_FROM_NOW,
  MAX_DESCRIPTION_LENGTH,
  readBool,
  readNumber,
  readString,
} from "./shared.js";

/** Townscript Hyderabad workshops/marathons via public listings radar JSON. */
export const SOURCE_NAME = "townscript";
export const RATE_LIMIT_MS = 1100;

export const API_BASE = process.env.TOWNSCRIPT_API_BASE ?? "https://www.townscript.com";
export const RADAR_PATH = "/listings/event/radar";

/** Hyderabad city centre; radarDistance matches Townscript city pages (~50 km). */
export const HYD_LATITUDE = Number(process.env.TOWNSCRIPT_LATITUDE ?? "17.385");
export const HYD_LONGITUDE = Number(process.env.TOWNSCRIPT_LONGITUDE ?? "78.4867");
export const RADAR_DISTANCE_KM = Number(process.env.TOWNSCRIPT_RADAR_DISTANCE ?? "50");
export const PAGE_SIZE = Number(process.env.TOWNSCRIPT_PAGE_SIZE ?? "24");
const MAX_PAGES = 20;

export interface TownscriptRawEvent {
  id: string;
  eventId: number;
  shortName: string;
  title: string;
  sourceUrl: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  priceMin: number | null;
  isFree: boolean;
  paid: boolean;
  onlineEvent: boolean;
  live: boolean;
  keywords: string[];
  organizerName: string | null;
  coverImageUrl: string | null;
}

/** Townscript timestamps look like 2026-09-26T23:30:00+0000 — normalise to ISO Z. */
export function normaliseTownscriptTime(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export function eventUrlFromShortName(shortName: string): string {
  return `https://www.townscript.com/e/${shortName}`;
}

function absoluteImageUrl(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  if (raw.startsWith("//")) return `https:${raw}`;
  return raw;
}

function keywordCodes(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  const out: string[] = [];
  for (const item of keywords) {
    const row = asRecord(item);
    const code = readString(row?.topicKeywordCode) ?? readString(row?.topicKeywordName);
    if (code) out.push(code);
  }
  return out;
}

export function parseRadarEvent(entry: unknown): TownscriptRawEvent | null {
  const event = asRecord(entry);
  if (!event) return null;

  const eventId = readNumber(event.eventId);
  const shortName = readString(event.shortName);
  const title = readString(event.displayName) ?? readString(event.name);
  if (eventId === null || !shortName || !title) return null;

  const priceMin = readNumber(event.minimumTicketPrice);
  const paid = readBool(event.paid);
  const isFree = !paid && (priceMin === null || priceMin <= 0);

  const locality = readString(event.locality);
  const city = readString(event.city);
  const venueLocation = readString(event.venueLocation);
  const description = readString(event.shortDescription);

  return {
    id: String(eventId),
    eventId,
    shortName,
    title,
    sourceUrl: eventUrlFromShortName(shortName),
    description: description ? description.slice(0, MAX_DESCRIPTION_LENGTH) : null,
    startsAt: normaliseTownscriptTime(event.startTime),
    endsAt: normaliseTownscriptTime(event.endTime),
    timezone: readString(event.eventTimeZone),
    venueName: venueLocation ?? locality,
    address: [locality, city].filter(Boolean).join(", ") || city,
    city,
    locality,
    latitude: readNumber(event.latitude),
    longitude: readNumber(event.longitude),
    priceMin,
    isFree,
    paid,
    onlineEvent: readBool(event.onlineEvent) || readBool(event.virtualEvent),
    live: event.live !== false,
    keywords: keywordCodes(event.keywords),
    organizerName: readString(event.organizerName),
    coverImageUrl: absoluteImageUrl(event.coverImageUrl) ?? absoluteImageUrl(event.cardImageUrl),
  };
}

export function parseRadarPage(payload: unknown): {
  events: TownscriptRawEvent[];
  pageNumber: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
} {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  if (!data || !Array.isArray(data.data)) {
    return { events: [], pageNumber: 0, totalPages: 0, totalCount: 0, hasMore: false };
  }

  const events: TownscriptRawEvent[] = [];
  for (const entry of data.data) {
    const parsed = parseRadarEvent(entry);
    if (parsed) events.push(parsed);
  }

  const pageNumber = readNumber(data.pageNumber) ?? 0;
  const totalPages = readNumber(data.totalPages) ?? 0;
  const totalCount = readNumber(data.totalCount) ?? events.length;
  const hasMore = pageNumber + 1 < totalPages;

  return { events, pageNumber, totalPages, totalCount, hasMore };
}

/** Keep Hyderabad / Secunderabad / local Telangana listings; drop remote leftovers. */
export function isHyderabadEvent(raw: TownscriptRawEvent): boolean {
  const haystack =
    `${raw.city ?? ""} ${raw.locality ?? ""} ${raw.venueName ?? ""} ${raw.address ?? ""} ${raw.title} ${raw.shortName}`.toLowerCase();
  if (/\bhyderabad\b|\bsecunderabad\b|\bmadhapur\b|\bgachibowli\b|\bhitech\b|\bjubilee hills\b|\bshamshabad\b/.test(haystack)) {
    return true;
  }
  if (/\btelangana\b/.test(haystack) && !/\bmumbai\b|\bbengaluru\b|\bbangalore\b|\bdelhi\b|\bchennai\b|\bpune\b/.test(haystack)) {
    return true;
  }
  return false;
}

export function toOccurrence(raw: TownscriptRawEvent, now: Date = new Date()): Occurrence | null {
  if (!isSourceUrl(raw.sourceUrl)) return null;
  if (!isHyderabadEvent(raw)) return null;
  if (!raw.live) return null;
  if (!raw.startsAt) return null;
  const startsAtMs = Date.parse(raw.startsAt);
  if (Number.isNaN(startsAtMs)) return null;
  const daysFromNow = (startsAtMs - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysFromNow < -1 || daysFromNow > MAX_DAYS_FROM_NOW) return null;

  const priceMin = raw.priceMin;
  const isFree = raw.isFree || (priceMin !== null && priceMin <= 0);
  return {
    sourceEventId: raw.id,
    sourceSlotId: raw.startsAt.slice(0, 10),
    slug: raw.shortName,
    title: cleanTitle(raw.title),
    description: raw.description,
    timeKind: "timed",
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: raw.endsAt && !Number.isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null,
    venueName: raw.venueName,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    categories: raw.keywords.slice(0, 8),
    tags: raw.organizerName ? [raw.organizerName] : [],
    priceMin,
    isFree,
    sourceUrl: raw.sourceUrl,
  };
}

function radarUrl(page: number): string {
  const url = new URL(`${API_BASE}${RADAR_PATH}`);
  url.searchParams.set("lat", String(HYD_LATITUDE));
  url.searchParams.set("lng", String(HYD_LONGITUDE));
  url.searchParams.set("radarDistance", String(RADAR_DISTANCE_KM));
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(PAGE_SIZE));
  return url.toString();
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

/**
 * Paginate public POST /listings/event/radar around Hyderabad.
 * No auth. Empty JSON body; filters can be added later (topicCode, free, etc.).
 */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<TownscriptRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const byId = new Map<string, TownscriptRawEvent>();
  let hasMore = true;

  for (let page = 0; page < MAX_PAGES && hasMore; page += 1) {
    const url = radarUrl(page);
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`Townscript fetch failed ${response.status} ${response.statusText} for ${url}`);
    }
    const payload = (await response.json()) as unknown;
    const parsed = parseRadarPage(payload);
    for (const event of parsed.events) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
    hasMore = parsed.hasMore;
    if (sleepMs > 0 && hasMore) await Bun.sleep(sleepMs);
  }

  return [...byId.values()].filter(isHyderabadEvent);
}
