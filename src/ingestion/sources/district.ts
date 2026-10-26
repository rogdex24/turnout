import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, USER_AGENT } from "../../utils/http.js";
import type { Json } from "./shared.js";
import {
  asRecord,
  cleanTitle,
  httpsCover,
  isSourceUrl,
  MAX_DAYS_FROM_NOW,
  MAX_DESCRIPTION_LENGTH,
  readNumber,
  readString,
} from "./shared.js";

/** District (Zomato) Hyderabad events via public city listing JSON-LD + event-detail pages. */
export const SOURCE_NAME = "district";
export const RATE_LIMIT_MS = 1100;

export const LISTING_URLS = [
  "https://www.district.in/events/upcoming-events-in-hyderabad",
  "https://www.district.in/events/events-this-weekend-in-hyderabad",
];
export const SITEMAP_URL = "https://cdn.district.in/sitemap/event-detail-pages.xml";
const MAX_DETAIL_FETCHES = 250;

export interface DistrictRawEvent {
  id: string;
  title: string;
  sourceUrl: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  priceMin: number | null;
  imageUrl: string | null;
}

function extractJsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]!) as unknown; // group 1 is mandatory in the pattern
      if (parsed && typeof parsed === "object") blocks.push(parsed as Json);
    } catch {
      // skip malformed blocks
    }
  }
  return blocks;
}

function slugFromUrl(url: string): string | null {
  const match = url.match(/\/events\/([a-z0-9-]+)\/?/i);
  return match ? match[1]! : null; // group 1 is mandatory in the pattern
}

function firstImage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }
  }
  return null;
}

function locationFields(location: unknown): {
  venueName: string | null;
  address: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
} {
  const loc = asRecord(location);
  if (!loc) return { venueName: null, address: null, locality: null, latitude: null, longitude: null };
  const address = asRecord(loc.address);
  const geo = asRecord(loc.geo);
  const street = readString(address?.streetAddress);
  const locality = readString(address?.addressLocality);
  const venueName = readString(loc.name);
  const composed = [street, locality].filter(Boolean).join(", ") || null;
  return {
    venueName,
    address: composed,
    locality,
    latitude: readNumber(geo?.latitude),
    longitude: readNumber(geo?.longitude),
  };
}

function offerPriceMin(offers: unknown): number | null {
  const offer = asRecord(offers);
  if (!offer) return null;
  const low = readNumber(offer.lowPrice);
  if (low !== null) return low;
  return readNumber(offer.price);
}

function eventFromJsonLd(event: Json): DistrictRawEvent | null {
  if (event["@type"] !== "Event") return null;
  const sourceUrl = readString(event.url);
  if (!sourceUrl) return null;
  const id = slugFromUrl(sourceUrl);
  const title = readString(event.name);
  if (!id || !title) return null;
  const loc = locationFields(event.location);
  const description = readString(event.description);
  return {
    id,
    title,
    sourceUrl,
    description: description ? description.slice(0, MAX_DESCRIPTION_LENGTH) : null,
    startsAt: readString(event.startDate),
    endsAt: readString(event.endDate),
    venueName: loc.venueName,
    address: loc.address,
    latitude: loc.latitude,
    longitude: loc.longitude,
    priceMin: offerPriceMin(event.offers),
    imageUrl: firstImage(event.image),
  };
}

/** True when the listing is clearly a Hyderabad event (city pages sometimes include touring leftovers). */
export function isHyderabadEvent(raw: DistrictRawEvent): boolean {
  const haystack = `${raw.sourceUrl} ${raw.venueName ?? ""} ${raw.address ?? ""}`.toLowerCase();
  if (haystack.includes("hyderabad")) return true;
  // Nanakramguda / Gachibowli etc. without the city name still count when on a Hyd city page URL.
  return false;
}

export function parseListingPage(html: string): DistrictRawEvent[] {
  const out: DistrictRawEvent[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    if (block["@type"] !== "ItemList" || !Array.isArray(block.itemListElement)) continue;
    for (const entry of block.itemListElement) {
      const listItem = asRecord(entry);
      const event = asRecord(listItem?.item) ?? listItem;
      if (!event) continue;
      const parsed = eventFromJsonLd(event);
      if (parsed) out.push(parsed);
    }
  }
  return out;
}

export function parseEventDetailPage(html: string): DistrictRawEvent | null {
  for (const block of extractJsonLdBlocks(html)) {
    const parsed = eventFromJsonLd(block);
    if (parsed) return parsed;
  }
  return null;
}

export function parseSitemapEventUrls(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*(https:\/\/www\.district\.in\/events\/[^<\s]+)\s*<\/loc>/gi)) {
    urls.push(match[1]!.trim()); // group 1 is mandatory in the pattern
  }
  return urls;
}

export function hyderabadSitemapUrls(urls: string[]): string[] {
  return urls.filter((url) => /hyderabad/i.test(url));
}

export function toOccurrence(raw: DistrictRawEvent, now: Date = new Date()): Occurrence | null {
  if (!isSourceUrl(raw.sourceUrl)) return null;
  if (!isHyderabadEvent(raw)) return null;
  if (!raw.startsAt) return null;
  const startsAtMs = Date.parse(raw.startsAt);
  if (Number.isNaN(startsAtMs)) return null;
  const daysFromNow = (startsAtMs - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysFromNow < -1 || daysFromNow > MAX_DAYS_FROM_NOW) return null;

  const priceMin = raw.priceMin;
  const isFree = priceMin !== null && priceMin <= 0;
  return {
    sourceEventId: raw.id,
    sourceSlotId: raw.startsAt.slice(0, 10),
    slug: raw.id,
    title: cleanTitle(raw.title),
    description: raw.description,
    timeKind: "timed",
    startsAt: new Date(startsAtMs).toISOString(),
    endsAt: raw.endsAt && !Number.isNaN(Date.parse(raw.endsAt)) ? new Date(raw.endsAt).toISOString() : null,
    venueName: raw.venueName,
    address: raw.address,
    latitude: raw.latitude,
    longitude: raw.longitude,
    categories: [],
    tags: [],
    priceMin,
    isFree,
    sourceUrl: raw.sourceUrl,
    imageUrl: httpsCover(raw.imageUrl),
  };
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml" },
  });
  if (!response.ok) throw new Error(`District fetch failed ${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
  /** When false, skip sitemap detail crawls (listing JSON-LD only). Default true. */
  fetchDetails?: boolean;
  maxDetailFetches?: number;
}

/**
 * Prefer city listing ItemList JSON-LD (fast, structured). Optionally enrich /
 * extend coverage by crawling Hyderabad URLs from the public event sitemap and
 * parsing each detail page's Event JSON-LD.
 */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<DistrictRawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const fetchDetails = options.fetchDetails ?? process.env.DISTRICT_FETCH_DETAILS !== "0";
  const maxDetailFetches =
    options.maxDetailFetches ??
    (process.env.DISTRICT_MAX_DETAIL_FETCHES ? Number(process.env.DISTRICT_MAX_DETAIL_FETCHES) : MAX_DETAIL_FETCHES);

  const byId = new Map<string, DistrictRawEvent>();

  for (let i = 0; i < LISTING_URLS.length; i += 1) {
    const html = await fetchText(LISTING_URLS[i]!, fetchImpl);
    for (const event of parseListingPage(html)) {
      const previous = byId.get(event.id);
      byId.set(event.id, previous ? mergeRaw(previous, event) : event);
    }
    if (sleepMs > 0 && i < LISTING_URLS.length - 1) await Bun.sleep(sleepMs);
  }

  if (fetchDetails) {
    const sitemapXml = await fetchText(SITEMAP_URL, fetchImpl);
    if (sleepMs > 0) await Bun.sleep(sleepMs);
    const detailUrls = hyderabadSitemapUrls(parseSitemapEventUrls(sitemapXml)).filter((url) => {
      const id = slugFromUrl(url);
      return !id || !byId.get(id)?.startsAt;
    });
    // A partial crawl cannot authorize removal of previously stored events.
    if (detailUrls.length > maxDetailFetches) throw new Error(`District detail crawl exceeds limit ${maxDetailFetches}`);
    for (let i = 0; i < detailUrls.length; i += 1) {
      const url = detailUrls[i]!; // i < detailUrls.length
      const html = await fetchText(url, fetchImpl);
      const detail = parseEventDetailPage(html);
      if (!detail?.startsAt || !Number.isFinite(Date.parse(detail.startsAt)))
        throw new Error(`District detail missing event or start date for ${url}`);
      const previous = byId.get(detail.id);
      byId.set(detail.id, previous ? mergeRaw(previous, detail) : detail);
      if (sleepMs > 0 && i < detailUrls.length - 1) await Bun.sleep(sleepMs);
    }
  }

  return [...byId.values()].filter(isHyderabadEvent);
}

function mergeRaw(a: DistrictRawEvent, b: DistrictRawEvent): DistrictRawEvent {
  return {
    id: a.id,
    title: a.title || b.title,
    sourceUrl: a.sourceUrl || b.sourceUrl,
    description: a.description ?? b.description,
    startsAt: a.startsAt ?? b.startsAt,
    endsAt: a.endsAt ?? b.endsAt,
    venueName: a.venueName ?? b.venueName,
    address: a.address ?? b.address,
    latitude: a.latitude ?? b.latitude,
    longitude: a.longitude ?? b.longitude,
    priceMin: a.priceMin ?? b.priceMin,
    imageUrl: a.imageUrl ?? b.imageUrl,
  };
}
