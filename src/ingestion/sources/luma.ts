import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import { asRecord, cleanTitle, isSourceUrl, MAX_DAYS_FROM_NOW, MAX_DESCRIPTION_LENGTH, readNumber, readString } from "./shared.js";

/** Luma (lu.ma / luma.com) Hyderabad events via public geo discover JSON API. */
export const SOURCE_NAME = "luma";
export const RATE_LIMIT_MS = 1100;

/** Prefer api.luma.com; api2.luma.com and api.lu.ma also serve the same discover path today. */
export const API_BASE = process.env.LUMA_API_BASE ?? "https://api.luma.com";
export const DISCOVER_PATH = "/discover/get-paginated-events";

/** Hyderabad city centre — Luma has no featured discover_place for Hyd (see bootstrap places). */
export const HYD_LATITUDE = Number(process.env.LUMA_LATITUDE ?? "17.385");
export const HYD_LONGITUDE = Number(process.env.LUMA_LONGITUDE ?? "78.4867");
export const PAGINATION_LIMIT = Number(process.env.LUMA_PAGINATION_LIMIT ?? "20");
const MAX_PAGES = 30;

export interface LumaRawEvent {
  id: string;
  slug: string;
  title: string;
  sourceUrl: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  priceMin: number | null;
  isFree: boolean;
  locationType: string | null;
  calendarName: string | null;
}

/** ticket_info.price may be a number, numeric string, or currency-ish string. */
export function parseTicketPrice(ticketInfo: unknown): { priceMin: number | null; isFree: boolean } {
  const ticket = asRecord(ticketInfo);
  if (!ticket) return { priceMin: null, isFree: false };
  if (ticket.is_free === true) return { priceMin: 0, isFree: true };
  const raw = ticket.price ?? ticket.max_price;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { priceMin: raw, isFree: raw <= 0 };
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    if (cleaned && Number.isFinite(Number(cleaned))) {
      const n = Number(cleaned);
      return { priceMin: n, isFree: n <= 0 };
    }
  }
  return { priceMin: null, isFree: false };
}

export function eventUrlFromSlug(slug: string): string {
  return `https://luma.com/${slug}`;
}

export function parseDiscoverEntry(entry: unknown): LumaRawEvent | null {
  const wrap = asRecord(entry);
  const event = asRecord(wrap?.event) ?? wrap;
  if (!event) return null;

  const id = readString(event.api_id);
  const slug = readString(event.url);
  const title = readString(event.name);
  if (!id || !slug || !title) return null;

  const geo = asRecord(event.geo_address_info);
  const coordinate = asRecord(event.coordinate);
  const calendar = asRecord(wrap?.calendar);
  const pricing = parseTicketPrice(wrap?.ticket_info);
  const description = readString(geo?.description) ?? readString(event.description) ?? (calendar ? readString(calendar.name) : null);

  return {
    id,
    slug,
    title,
    sourceUrl: eventUrlFromSlug(slug),
    description: description ? description.slice(0, MAX_DESCRIPTION_LENGTH) : null,
    startsAt: readString(event.start_at),
    endsAt: readString(event.end_at),
    timezone: readString(event.timezone),
    venueName: readString(geo?.address) ?? readString(geo?.city_state),
    address: readString(geo?.full_address) ?? readString(geo?.city_state),
    city: readString(geo?.city),
    latitude: readNumber(coordinate?.latitude),
    longitude: readNumber(coordinate?.longitude),
    priceMin: pricing.priceMin,
    isFree: pricing.isFree,
    locationType: readString(event.location_type),
    calendarName: calendar ? readString(calendar.name) : null,
  };
}

export function parseDiscoverPage(payload: unknown): {
  events: LumaRawEvent[];
  hasMore: boolean;
  nextCursor: string | null;
} {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.entries)) {
    return { events: [], hasMore: false, nextCursor: null };
  }
  const events: LumaRawEvent[] = [];
  for (const entry of root.entries) {
    const parsed = parseDiscoverEntry(entry);
    if (parsed) events.push(parsed);
  }
  return {
    events,
    hasMore: root.has_more === true,
    nextCursor: readString(root.next_cursor),
  };
}

/** Keep Hyderabad / Secunderabad / clearly local Telangana listings; drop remote leftovers. */
export function isHyderabadEvent(raw: LumaRawEvent): boolean {
  const haystack = `${raw.city ?? ""} ${raw.venueName ?? ""} ${raw.address ?? ""} ${raw.title}`.toLowerCase();
  if (/\bhyderabad\b|\bsecunderabad\b|\bmadhapur\b|\bgachibowli\b|\bhitech\b|\bhitech city\b/.test(haystack)) {
    return true;
  }
  // Geo search is scoped; accept Telangana city tags that aren't another metro name.
  if (/\btelangana\b/.test(haystack) && !/\bmumbai\b|\bbengaluru\b|\bbangalore\b|\bdelhi\b|\bchennai\b/.test(haystack)) {
    return true;
  }
  return false;
}

export function toOccurrence(raw: LumaRawEvent, now: Date = new Date()): Occurrence | null {
  if (!isSourceUrl(raw.sourceUrl)) return null;
  if (!isHyderabadEvent(raw)) return null;
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
    slug: raw.slug,
    title: cleanTitle(raw.title),
    description: raw.description,
    timeKind: "timed",
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: raw.endsAt && !Number.isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null,
    venueName: raw.venueName,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    categories: raw.calendarName ? [raw.calendarName] : [],
    tags: [],
    priceMin,
    isFree,
    sourceUrl: raw.sourceUrl,
  };
}

function discoverUrl(cursor: string | null): string {
  const url = new URL(`${API_BASE}${DISCOVER_PATH}`);
  url.searchParams.set("latitude", String(HYD_LATITUDE));
  url.searchParams.set("longitude", String(HYD_LONGITUDE));
  url.searchParams.set("pagination_limit", String(PAGINATION_LIMIT));
  if (cursor) url.searchParams.set("pagination_cursor", cursor);
  return url.toString();
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

/**
 * Paginate public geo discover around Hyderabad. No auth, no cookies.
 * Hyderabad is not a featured discover_place slug; lat/lon geo search is the path.
 */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<LumaRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const byId = new Map<string, LumaRawEvent>();
  let cursor: string | null = null;
  let hasMore = true;

  for (let page = 0; page < MAX_PAGES && hasMore; page += 1) {
    const url = discoverUrl(cursor);
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Luma fetch failed ${response.status} ${response.statusText} for ${url}`);
    }
    const payload = (await response.json()) as unknown;
    const parsed = parseDiscoverPage(payload);
    for (const event of parsed.events) {
      if (!byId.has(event.id)) byId.set(event.id, event);
    }
    hasMore = parsed.hasMore && Boolean(parsed.nextCursor);
    cursor = parsed.nextCursor;
    if (sleepMs > 0 && hasMore) await Bun.sleep(sleepMs);
  }

  return [...byId.values()].filter(isHyderabadEvent);
}
