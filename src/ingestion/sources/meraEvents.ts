import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import {
  asRecord,
  cleanTitle,
  httpsCover,
  isSourceUrl,
  MAX_DAYS_FROM_NOW,
  MAX_DESCRIPTION_LENGTH,
  readBool,
  readNumber,
  readString,
} from "./shared.js";

/** MeraEvents Hyderabad via public unauthenticated JSON listing. */
export const SOURCE_NAME = "meraevents";
export const RATE_LIMIT_MS = 1100;

export const API_BASE = process.env.MERAEVENTS_API_BASE ?? "https://api.meraevents.com";
export const EVENTS_PATH = "/events";
export const LOCATION = process.env.MERAEVENTS_LOCATION ?? "hyderabad";
export const PAGE_SIZE = Number(process.env.MERAEVENTS_PAGE_SIZE ?? "50");
const MAX_PAGES = 20;

export interface MeraEventsRawEvent {
  id: string;
  eventId: number;
  urlSlug: string;
  title: string;
  sourceUrl: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  venueName: string | null;
  address: string | null;
  cityName: string | null;
  latitude: number | null;
  longitude: number | null;
  priceMin: number | null;
  isFree: boolean;
  eventMode: string | null;
  status: string | null;
  privateEvent: boolean;
  deleted: boolean;
  isPast: boolean;
  coverImageUrl: string | null;
  tags: string[];
}

export function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function eventUrlFromSlug(slug: string): string {
  return `https://meraevents.com/events/${slug}`;
}

export function normaliseIsoTime(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else {
      const row = asRecord(item);
      const name = readString(row?.name) ?? readString(row?.slug) ?? readString(row?.title);
      if (name) out.push(name);
    }
  }
  return out;
}

export function parseApiEvent(entry: unknown): MeraEventsRawEvent | null {
  const event = asRecord(entry);
  if (!event) return null;

  const eventId = readNumber(event.id);
  const urlSlug = readString(event.url) ?? readString(event.urlSlug) ?? readString(event.urlPath);
  const title = readString(event.title);
  if (eventId === null || !urlSlug || !title) return null;

  const minPrice = readNumber(event.minPrice);
  const minPaidPrice = readNumber(event.minPaidPrice);
  const priceMin = minPrice ?? minPaidPrice;
  const isFree = priceMin !== null && priceMin <= 0;

  const venueName = readString(event.venueName);
  const address1 = readString(event.venueAddress1);
  const address2 = readString(event.venueAddress2);
  const address = [address1, address2].filter(Boolean).join(", ") || null;
  const description = stripHtml(readString(event.description));

  return {
    id: String(eventId),
    eventId,
    urlSlug,
    title,
    sourceUrl: eventUrlFromSlug(urlSlug),
    description: description ? description.slice(0, MAX_DESCRIPTION_LENGTH) : null,
    startsAt: normaliseIsoTime(event.startDateTime),
    endsAt: normaliseIsoTime(event.endDateTime),
    timezone: readString(event.timezoneZone) ?? readString(event.timezone),
    venueName,
    address,
    cityName: readString(event.cityName),
    latitude: readNumber(event.latitude),
    longitude: readNumber(event.longitude),
    priceMin,
    isFree,
    eventMode: readString(event.eventMode),
    status: readString(event.status),
    privateEvent: readBool(event.private),
    deleted: readBool(event.deleted),
    isPast: readBool(event.isPast),
    coverImageUrl: readString(event.thumbnailImageUrl) ?? readString(event.bannerImageUrl) ?? readString(event.headerImageUrl),
    tags: readTags(event.tags),
  };
}

export function parseEventsPage(payload: unknown): {
  events: MeraEventsRawEvent[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
} {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.events)) {
    return { events: [], currentPage: 1, totalPages: 0, totalCount: 0, hasMore: false };
  }

  const events: MeraEventsRawEvent[] = [];
  for (const entry of root.events) {
    const parsed = parseApiEvent(entry);
    if (parsed) events.push(parsed);
  }

  const currentPage = readNumber(root.currentPage) ?? 1;
  const totalPages = readNumber(root.totalPages) ?? 0;
  const totalCount = readNumber(root.totalCount) ?? events.length;
  const hasNextPage = root.hasNextPage === true || currentPage < totalPages;

  return { events, currentPage, totalPages, totalCount, hasMore: hasNextPage };
}

/** Keep Hyderabad / Secunderabad / local Telangana listings; drop remote leftovers. */
export function isHyderabadEvent(raw: MeraEventsRawEvent): boolean {
  const haystack = `${raw.cityName ?? ""} ${raw.venueName ?? ""} ${raw.address ?? ""} ${raw.title} ${raw.urlSlug}`.toLowerCase();
  const remote = /\bmumbai\b|\bbengaluru\b|\bbangalore\b|\bdelhi\b|\bchennai\b|\bpune\b|\bkolkata\b/;
  const local =
    /\bhyderabad\b|\bhyderbad\b|\bsecunderabad\b|\bmadhapur\b|\bgachibowli\b|\bhitech\b|\bkondapur\b|\bnanakramguda\b|\bjubilee hills\b|\bshamshabad\b/;
  if (local.test(haystack)) return true;
  if (remote.test(haystack)) return false;
  // location=hyderabad query already scoped the feed; accept offline rows with a
  // venue when cityName is null (common in the live API payload).
  if (raw.eventMode !== "online" && raw.venueName && !raw.cityName) return true;
  if (/\btelangana\b/.test(haystack)) return true;
  return false;
}

export function toOccurrence(raw: MeraEventsRawEvent, now: Date = new Date()): Occurrence | null {
  if (!isSourceUrl(raw.sourceUrl)) return null;
  if (raw.deleted || raw.privateEvent || raw.isPast) return null;
  if (raw.status && raw.status !== "active") return null;
  if (!isHyderabadEvent(raw)) return null;
  // Online-only with no Hyderabad venue: junk filter (data-model.md 6.1).
  if (raw.eventMode === "online" && !raw.venueName) return null;
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
    slug: raw.urlSlug,
    title: cleanTitle(raw.title),
    description: raw.description,
    timeKind: "timed",
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: raw.endsAt && !Number.isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null,
    venueName: raw.venueName,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    categories: raw.tags.slice(0, 8),
    tags: [],
    priceMin,
    isFree,
    sourceUrl: raw.sourceUrl,
    imageUrl: httpsCover(raw.coverImageUrl),
  };
}

function listUrl(page: number): string {
  const url = new URL(`${API_BASE}${EVENTS_PATH}`);
  url.searchParams.set("location", LOCATION);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_SIZE));
  return url.toString();
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

/**
 * Paginate GET /events?location=hyderabad.
 * No auth. Pages are 1-indexed; hasNextPage drives the loop.
 */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<MeraEventsRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const byId = new Map<string, MeraEventsRawEvent>();
  let hasMore = true;

  for (let page = 1; page <= MAX_PAGES && hasMore; page += 1) {
    const url = listUrl(page);
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`MeraEvents fetch failed ${response.status} ${response.statusText} for ${url}`);
    }
    const payload = (await response.json()) as unknown;
    const parsed = parseEventsPage(payload);
    for (const event of parsed.events) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
    hasMore = parsed.hasMore;
    if (sleepMs > 0 && hasMore) await Bun.sleep(sleepMs);
  }

  return [...byId.values()].filter(isHyderabadEvent);
}
