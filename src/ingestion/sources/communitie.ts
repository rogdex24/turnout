import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, sleep, USER_AGENT } from "../../utils/http.js";
import { cleanTitle, httpsCover, isSourceUrl, MAX_DESCRIPTION_LENGTH, readString } from "./shared.js";

// Communitie API shapes we actually read. The API returns more fields than
// this; we only type what normalizeEvent touches.

export interface RawCategory {
  slug: string;
}

export interface RawScheduleSlot {
  id: string;
  slotDate: string; // "YYYY-MM-DD", local (Asia/Kolkata)
  startTime: string; // "HH:mm:ss", local
  durationMinutes?: number;
  active?: boolean;
}

export interface RawTimeSlot {
  venueName?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  venueMode?: string;
  scheduleSlots?: RawScheduleSlot[];
}

export interface RawEvent {
  id: string;
  slug?: string | null;
  title: string;
  shortDesc?: string | null;
  status?: string;
  approvalStatus?: string;
  categories?: RawCategory[];
  tags?: string[];
  minimumBasePrice?: number | null;
  timeSlots?: RawTimeSlot[];
  [key: string]: unknown;
}

export const BASE_URL = process.env.COMMUNITIE_BASE_URL ?? "https://api.communitie.in/api/v1";
export const CITY_SLUG = process.env.COMMUNITIE_CITY_SLUG ?? "hyderabad";
export const PAGE_SIZE = 24;
export const RATE_LIMIT_MS = 1100; // just over 1 req/sec, per SPEC.md 9.3
const MAX_PAGES = 200; // safety cap: 200 * PAGE_SIZE = 4800 events, far above expected volume

export interface FetchAllOptions {
  fetchImpl?: FetchLike;
  sleepMs?: number;
}

function extractEvents(payload: unknown): RawEvent[] {
  if (Array.isArray(payload)) return payload as RawEvent[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["content", "events", "data"]) {
      if (Array.isArray(record[key])) return record[key] as RawEvent[];
    }
  }
  return [];
}

export async function fetchSearchPage(page: number, size: number = PAGE_SIZE, fetchImpl: FetchLike = fetch): Promise<RawEvent[]> {
  const response = await fetchImpl(`${BASE_URL}/customers/events/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify({ citySlug: CITY_SLUG, page, size }),
  });
  if (!response.ok) {
    throw new Error(`Communitie search page ${page} failed: ${response.status} ${response.statusText}`);
  }
  const payload: unknown = await response.json();
  return extractEvents(payload);
}

/** Pages through search results until a short page (or an empty one) signals the end. */
export async function fetchAllEvents(options: FetchAllOptions = {}): Promise<RawEvent[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepMs = options.sleepMs ?? RATE_LIMIT_MS;
  const seen = new Set<string>();
  const all: RawEvent[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const events = await fetchSearchPage(page, PAGE_SIZE, fetchImpl);
    if (events.length === 0) break;
    for (const event of events) {
      if (!seen.has(event.id)) {
        seen.add(event.id);
        all.push(event);
      }
    }
    if (events.length < PAGE_SIZE) break;
    if (sleepMs > 0) await sleep(sleepMs);
  }

  return all;
}

/**
 * Explodes one Communitie event into zero or more occurrence rows, one per
 * (timeSlot venue, scheduleSlot date+time) pair. An event that isn't live,
 * isn't approved, or has no usable start time yields no occurrences: it is
 * held rather than published with a placeholder.
 */
export function normalizeEvent(raw: RawEvent): Occurrence[] {
  if (raw.status !== "LIVE" || raw.approvalStatus !== "APPROVED") {
    return [];
  }

  const categories = (raw.categories ?? []).map((category) => category.slug).filter((slug): slug is string => Boolean(slug));
  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  const priceMin = typeof raw.minimumBasePrice === "number" ? raw.minimumBasePrice : null;
  const isFree = priceMin === null || priceMin <= 0;
  // The API endpoint we fetch from is not a page a reader can open. The public
  // site keys off the same slug, so link there; an event without one has no
  // public page and falls back to the city listing.
  const sourceUrl = raw.slug ? `https://events.communitie.in/events/${raw.slug}` : "https://events.communitie.in/hyderabad";
  if (!isSourceUrl(sourceUrl)) return [];
  const title = cleanTitle(raw.title);
  const description = raw.shortDesc ? truncate(raw.shortDesc, MAX_DESCRIPTION_LENGTH) : null;

  // Landscape fits the 16:9 cover best, then preview, then portrait.
  const imageUrl = httpsCover(raw.landscapeImageUrl) ?? httpsCover(raw.previewImageUrl) ?? httpsCover(raw.portraitImageUrl);
  const organiser = readString(raw.hostName);

  const occurrences: Occurrence[] = [];
  for (const timeSlot of raw.timeSlots ?? []) {
    for (const slot of timeSlot.scheduleSlots ?? []) {
      if (slot.active === false) continue;
      const startsAt = toUtcIso(slot.slotDate, slot.startTime);
      if (!startsAt) continue;

      occurrences.push({
        sourceEventId: raw.id,
        sourceSlotId: slot.id,
        slug: raw.slug ?? null,
        title,
        description,
        timeKind: "timed",
        startsAt,
        endsAt: addMinutes(startsAt, slot.durationMinutes),
        venueName: timeSlot.venueName ?? null,
        address: timeSlot.address ?? null,
        latitude: timeSlot.latitude ?? null,
        longitude: timeSlot.longitude ?? null,
        categories,
        tags,
        priceMin,
        isFree,
        sourceUrl,
        imageUrl,
        organiser,
      });
    }
  }
  return occurrences;
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Communitie's slotDate/startTime are Asia/Kolkata wall-clock; assume IST until a second city appears. */
function toUtcIso(slotDate: string | undefined, startTime: string | undefined): string | null {
  if (!slotDate || !startTime) return null;
  const date = new Date(`${slotDate}T${startTime}+05:30`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addMinutes(isoStart: string, minutes: number | undefined): string | null {
  if (!minutes) return null;
  return new Date(new Date(isoStart).getTime() + minutes * 60_000).toISOString();
}
