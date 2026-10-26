import type { Occurrence } from "../../catalog/types.js";
import type { FetchLike } from "../../utils/http.js";
import { asRecord, cleanTitle, httpsCover, isSourceUrl, readNumber, readString } from "./shared.js";

/**
 * BookMyShow events vertical (CT / PL / SP) for Hyderabad via legacy QUICKBOOK JSON.
 * Movies (MT) are intentionally skipped — see docs/data-model.md §6 and docs/research-bookmyshow-sync.md.
 */
export const SOURCE_NAME = "bookmyshow";
export const RATE_LIMIT_MS = 800;

export const QUICKBOOK_BASE = process.env.BOOKMYSHOW_QUICKBOOK_BASE ?? "https://in.bookmyshow.com/serv/getData";
export const REGION_CODE = process.env.BOOKMYSHOW_REGION_CODE ?? "HYD";
export const REGION_NAME = process.env.BOOKMYSHOW_REGION_NAME ?? "Hyderabad";
/** Events (CT), Plays (PL), Sports (SP). Never Movies (MT). */
export const EVENT_TYPES = (process.env.BOOKMYSHOW_EVENT_TYPES ?? "CT,PL,SP")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Cap date explosion so recurring workshops/courses don't fill 4 months of slots. */
export const MAX_DAYS_FROM_NOW = Number(process.env.BOOKMYSHOW_MAX_DAYS ?? 45);
export const MAX_DATES_PER_EVENT = Number(process.env.BOOKMYSHOW_MAX_DATES ?? 16);
/** Genres that explode into near-daily slots and drown the public listing. */
const DROPPED_GENRE_RE = /^workshops?$/i;
export interface BookMyShowVenue {
  venueCode: string;
  venueName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  regionCode: string | null;
  subRegionCode: string | null;
}

export interface BookMyShowDate {
  showDateCode: string;
  showEndDateCode: string | null;
  showDateDisplay: string | null;
}

export interface BookMyShowRawEvent {
  id: string;
  eventCode: string;
  eventType: string;
  title: string;
  sourceUrl: string;
  genre: string | null;
  genres: string[];
  language: string | null;
  length: string | null;
  minPrice: number | null;
  isFree: boolean;
  soldOut: boolean;
  isGlobal: boolean;
  bannerUrl: string | null;
  dates: BookMyShowDate[];
  venues: BookMyShowVenue[];
}

export function regionCookie(regionCode = REGION_CODE, regionName = REGION_NAME): string {
  return `Rgn=Code=${regionCode}|text=${regionName}`;
}

export function quickbookUrl(eventType: string): string {
  const url = new URL(QUICKBOOK_BASE);
  url.searchParams.set("cmd", "QUICKBOOK");
  url.searchParams.set("type", eventType);
  return url.toString();
}

/** YYYYMMDD → {y,m,d} or null. */
export function parseShowDateCode(code: string | null): { y: number; m: number; d: number } | null {
  if (!code || !/^\d{8}$/.test(code)) return null;
  const y = Number(code.slice(0, 4));
  const m = Number(code.slice(4, 6));
  const d = Number(code.slice(6, 8));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Date anchor at IST midnight. This is not an advertised start time. */
export function showDateToUtcIso(code: string): string | null {
  const parts = parseShowDateCode(code);
  if (!parts) return null;
  return new Date(Date.UTC(parts.y, parts.m - 1, parts.d, -5, -30)).toISOString();
}

/** Parse "1 hr 30 mins" / "2 hrs" into minutes. */
export function parseLengthMinutes(length: string | null): number | null {
  if (!length) return null;
  const hours = length.match(/(\d+)\s*hrs?/i);
  const mins = length.match(/(\d+)\s*mins?/i);
  const h = hours ? Number(hours[1]) : 0;
  const m = mins ? Number(mins[1]) : 0;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

export function isHyderabadVenue(venue: BookMyShowVenue): boolean {
  const code = `${venue.regionCode ?? ""} ${venue.subRegionCode ?? ""}`.toUpperCase();
  if (/\bHYD\b|\bSCBD\b/.test(code)) return true;
  const hay = `${venue.venueName} ${venue.address ?? ""}`.toLowerCase();
  return /\bhyderabad\b|\bsecunderabad\b|\bmadhapur\b|\bgachibowli\b/.test(hay);
}

function parseVenue(entry: unknown): BookMyShowVenue | null {
  const row = asRecord(entry);
  if (!row) return null;
  const venueCode = readString(row.VenueCode);
  const venueName = readString(row.VenueName);
  if (!venueCode || !venueName) return null;
  return {
    venueCode,
    venueName,
    address: readString(row.VenueAddress),
    latitude: readNumber(row.VenueLatitude),
    longitude: readNumber(row.VenueLongitude),
    regionCode: readString(row.RegionCode),
    subRegionCode: readString(row.SubRegionCode),
  };
}

function parseDate(entry: unknown): BookMyShowDate | null {
  const row = asRecord(entry);
  if (!row) return null;
  const showDateCode = readString(row.ShowDateCode);
  if (!showDateCode || !parseShowDateCode(showDateCode)) return null;
  return {
    showDateCode,
    showEndDateCode: readString(row.ShowEndDateCode),
    showDateDisplay: readString(row.ShowDateDisplay),
  };
}

export function parseQuickbookEvent(entry: unknown): BookMyShowRawEvent | null {
  const event = asRecord(entry);
  if (!event) return null;

  const eventCode = readString(event.EventCode);
  const title = readString(event.EventTitle);
  const eventType = readString(event.EventType) ?? "CT";
  if (!eventCode || !title) return null;
  // Hard skip movies even if a caller passes MT payload.
  if (eventType === "MT") return null;

  const genres: string[] = [];
  if (Array.isArray(event.GenreArray)) {
    for (const g of event.GenreArray) {
      const s = readString(g);
      if (s) genres.push(s);
    }
  }
  const genre = readString(event.Genre);
  if (genre && !genres.includes(genre)) genres.unshift(genre);

  const venues: BookMyShowVenue[] = [];
  if (Array.isArray(event.arrVenues)) {
    for (const v of event.arrVenues) {
      const parsed = parseVenue(v);
      if (parsed) venues.push(parsed);
    }
  }

  const dates: BookMyShowDate[] = [];
  if (Array.isArray(event.arrDates)) {
    for (const d of event.arrDates) {
      const parsed = parseDate(d);
      if (parsed) dates.push(parsed);
    }
  }

  const minPrice = readNumber(event.MinPrice);
  const sourceUrl = readString(event.FShareURL) ?? `https://in.bookmyshow.com/events/${eventCode.toLowerCase()}/${eventCode}`;

  return {
    id: eventCode,
    eventCode,
    eventType,
    title,
    sourceUrl,
    genre,
    genres,
    language: readString(event.Language),
    length: readString(event.Length),
    minPrice,
    isFree: minPrice !== null && minPrice <= 0,
    soldOut: readString(event.EventSoldOut) === "Y",
    isGlobal: readString(event.EventIsGlobal) === "Y",
    bannerUrl: readString(event.BannerURL),
    dates,
    venues,
  };
}

export function parseQuickbookPayload(payload: unknown): BookMyShowRawEvent[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const bms = asRecord(data?.BookMyShow) ?? asRecord(root?.BookMyShow);
  const arr = bms?.arrEvent;
  if (!Array.isArray(arr)) return [];
  const out: BookMyShowRawEvent[] = [];
  for (const entry of arr) {
    const parsed = parseQuickbookEvent(entry);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function isHyderabadEvent(raw: BookMyShowRawEvent): boolean {
  return raw.venues.some(isHyderabadVenue);
}

export function primaryHydVenue(raw: BookMyShowRawEvent): BookMyShowVenue | null {
  return raw.venues.find(isHyderabadVenue) ?? null;
}

/** True when the event is a Workshops flood (drop from ingest). Movies already skipped. */
export function isWorkshopFlood(raw: BookMyShowRawEvent): boolean {
  const labels = [raw.genre, ...raw.genres].filter((g): g is string => g != null);
  if (labels.length === 0) return false;
  if (DROPPED_GENRE_RE.test(labels[0]!)) return true;
  return labels.every((g) => DROPPED_GENRE_RE.test(g));
}

export function toOccurrences(raw: BookMyShowRawEvent, now: Date = new Date()): Occurrence[] {
  if (!isSourceUrl(raw.sourceUrl)) return [];
  if (!isHyderabadEvent(raw)) return [];
  if (isWorkshopFlood(raw)) return [];
  const venue = primaryHydVenue(raw);
  if (!venue) return [];

  const priceMin = raw.minPrice;
  const isFree = raw.isFree || (priceMin !== null && priceMin <= 0);
  const categories = raw.genres.slice(0, 8);
  const tags = [raw.eventType, raw.language].filter((t): t is string => Boolean(t));

  const occurrences: Occurrence[] = [];
  const dates = raw.dates.slice(0, MAX_DATES_PER_EVENT);
  for (const date of dates) {
    const startsAt = showDateToUtcIso(date.showDateCode);
    if (!startsAt) continue;
    const startsAtMs = Date.parse(startsAt);
    if (Number.isNaN(startsAtMs)) continue;
    const daysFromNow = (startsAtMs - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysFromNow < -1 || daysFromNow > MAX_DAYS_FROM_NOW) continue;

    // Slot = date + venue so multi-venue tours don't collide.
    const sourceSlotId = `${date.showDateCode}-${venue.venueCode}`;

    occurrences.push({
      sourceEventId: raw.eventCode,
      sourceSlotId,
      slug: null,
      title: cleanTitle(raw.title),
      description: null,
      timeKind: "date-only",
      startsAt,
      endsAt: null,
      venueName: venue.venueName,
      address: venue.address,
      latitude: venue.latitude,
      longitude: venue.longitude,
      categories,
      tags,
      priceMin,
      isFree,
      sourceUrl: raw.sourceUrl,
      imageUrl: httpsCover(raw.bannerUrl),
    });
  }
  return occurrences;
}
export const BROWSER_UA =
  process.env.BOOKMYSHOW_UA ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Headers that succeed against Cloudflare where Bun's default fetch fingerprint gets 403. */
export function quickbookHeaders(): Record<string, string> {
  return {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": BROWSER_UA,
    "x-requested-with": "XMLHttpRequest",
    referer: "https://in.bookmyshow.com/",
    cookie: regionCookie(),
  };
}

/**
 * Prefer curl --http1.1 for live pulls (Cloudflare often 403s Bun/fetch TLS).
 * Falls back to fetchImpl when tests inject one.
 */
export async function fetchQuickbookJson(eventType: string, fetchImpl?: FetchLike): Promise<unknown> {
  const url = quickbookUrl(eventType);
  const headers = quickbookHeaders();

  if (!fetchImpl) {
    const args = [
      "curl",
      "-sS",
      "--http1.1",
      "-A",
      BROWSER_UA,
      "-H",
      `Accept: ${headers.accept}`,
      "-H",
      `Accept-Language: ${headers["accept-language"]}`,
      "-H",
      `X-Requested-With: ${headers["x-requested-with"]}`,
      "-H",
      `Referer: ${headers.referer}`,
      "-H",
      `Cookie: ${headers.cookie}`,
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
      url,
    ];
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const exit = await proc.exited;
    const marker = "\n__HTTP_STATUS__:";
    const idx = out.lastIndexOf(marker);
    const body = idx >= 0 ? out.slice(0, idx) : out;
    const status = idx >= 0 ? Number(out.slice(idx + marker.length).trim()) : exit === 0 ? 200 : 0;
    if (exit !== 0 || status < 200 || status >= 300) {
      throw new Error(`BookMyShow QUICKBOOK ${eventType} curl failed status=${status} exit=${exit} ${err.slice(0, 200)}`);
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error(`BookMyShow QUICKBOOK ${eventType} returned non-JSON (${body.slice(0, 120)})`);
    }
  }

  const response = await fetchImpl(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`BookMyShow QUICKBOOK ${eventType} failed ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
  eventTypes?: string[];
}

/** Fetch QUICKBOOK for CT/PL/SP with Rgn=HYD cookie. Movies (MT) never requested. */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<BookMyShowRawEvent[]> {
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const types = options.eventTypes ?? EVENT_TYPES;
  const byId = new Map<string, BookMyShowRawEvent>();

  for (let i = 0; i < types.length; i += 1) {
    const eventType = types[i]!; // i < types.length
    if (eventType === "MT") continue;
    const payload = await fetchQuickbookJson(eventType, options.fetchImpl);
    for (const event of parseQuickbookPayload(payload)) {
      if (!isHyderabadEvent(event)) continue;
      const existing = byId.get(event.id);
      if (!existing) {
        byId.set(event.id, event);
      } else {
        const dateCodes = new Set(existing.dates.map((d) => d.showDateCode));
        for (const d of event.dates) {
          if (!dateCodes.has(d.showDateCode)) existing.dates.push(d);
        }
        const venueCodes = new Set(existing.venues.map((v) => v.venueCode));
        for (const v of event.venues) {
          if (!venueCodes.has(v.venueCode)) existing.venues.push(v);
        }
      }
    }
    if (sleepMs > 0 && i < types.length - 1) await Bun.sleep(sleepMs);
  }

  return [...byId.values()];
}
