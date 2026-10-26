import { createHash } from "node:crypto";
import type { Occurrence } from "../../catalog/types.js";
import { type FetchLike, sleep, USER_AGENT } from "../../utils/http.js";
import { istLocalToIso } from "../../utils/time.js";
import { MAX_DAYS_FROM_NOW } from "../sources/shared.js";
import type { FetchedItem } from "../sources/types.js";
import { type AgentRecord, parseStartsLocal } from "./record.js";

export type Verdict =
  | { kind: "accepted"; item: FetchedItem }
  | { kind: "quarantined"; reason: string }
  | { kind: "rejected"; reason: string };

export type Page = { ok: true; text: string; hash: string } | { ok: false; reason: string };
export type PageLoader = (url: string) => Promise<Page>;

const FETCH_TIMEOUT_MS = 15_000;

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Visible page text, or a quote from it, in one comparable form. */
export function normalizeText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[​ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Fetches each distinct URL once per run, politely, and remembers the outcome. */
export function makePageLoader(fetchImpl: FetchLike, sleepMs: number): PageLoader {
  const pages = new Map<string, Promise<Page>>();
  let fetchedAny = false;
  return (url) => {
    let page = pages.get(url);
    if (!page) {
      const wait = fetchedAny ? sleepMs : 0;
      fetchedAny = true;
      page = (async () => {
        if (wait > 0) await sleep(wait);
        try {
          const response = await fetchImpl(url, {
            headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!response.ok) return { ok: false, reason: `page fetch returned ${response.status}` } as Page;
          const html = await response.text();
          return { ok: true, text: normalizeText(html), hash: createHash("sha256").update(html).digest("hex") } as Page;
        } catch (error) {
          return { ok: false, reason: `page fetch failed: ${String(error)}` } as Page;
        }
      })();
      pages.set(url, page);
    }
    return page;
  };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Day, month and time must all fall within this many characters of the day number. */
const DATE_WINDOW_CHARS = 60;

function timePattern(hour: number, minute: number): RegExp {
  const mm = String(minute).padStart(2, "0");
  const h12 = hour % 12 || 12;
  const meridiem = hour < 12 ? "a\\.?m" : "p\\.?m";
  const minutes12 = minute === 0 ? "(?:[:.]00)?" : `[:.]${mm}`;
  const twelve = `(?<!\\d)0?${h12}${minutes12}\\s*${meridiem}\\b`;
  const twentyFour = `(?<![\\d:.])${String(hour).padStart(2, "0")}[:.]${mm}(?![\\d])`;
  return new RegExp(`${twelve}|${twentyFour}`);
}

/**
 * Is this start date stated on the page? Checked by parts, so a reworded date
 * ("Sat, 10 Oct, 2026 at 07:00 pm IST" for "Sat, 10 Oct 2026 • 7:00 PM (IST)")
 * passes: the day number, the month (name, 3-letter form, or d/m or m/d digits)
 * and, for a timed start, the time (7:00 PM, 7 pm, 19:00) must all fall within
 * DATE_WINDOW_CHARS of each other. Text must come from normalizeText.
 * Misses: the year, and day/month order for numeric dates (10/11 passes for both
 * 10 Nov and 11 Oct). A page that lists many dates can satisfy all three parts
 * from different events if they sit close together.
 */
export function dateOnPage(startsLocal: string, pageText: string): boolean {
  const [, month, day, hour, minute] = startsLocal
    .match(/^\d{4}-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)!
    .map((part) => (part === undefined ? NaN : Number(part))) as [number, number, number, number, number];
  const name = MONTHS[month - 1]!;
  const names = new RegExp(`\\b(?:${name}|${name.slice(0, 3)}${name === "september" ? "|sept" : ""})\\b`);
  const dayAt = new RegExp(`(?<!\\d)0?${day}(?:st|nd|rd|th)?(?![\\d:])`, "g");
  const numeric = `(?<!\\d)(?:0?${day}[/.\\-]0?${month}|0?${month}[/.\\-]0?${day})(?!\\d)`;
  const numericAt = new RegExp(numeric, "g");
  const numericNear = new RegExp(numeric);
  const time = Number.isNaN(hour) ? null : timePattern(hour, minute);

  const starts = [...pageText.matchAll(dayAt), ...pageText.matchAll(numericAt)].map((match) => match.index!);
  return starts.some((at) => {
    const near = pageText.slice(Math.max(0, at - DATE_WINDOW_CHARS), at + DATE_WINDOW_CHARS);
    return (names.test(near) || numericNear.test(near)) && (time === null || time.test(near));
  });
}

/** Lowercased host and path, no fragment, no tracking params, no trailing slash. */
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
}

export function sourceEventIdFor(record: AgentRecord): string {
  const key = `${normalizeUrl(record.source_url)}\n${normalizeText(record.title)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export async function verifyRecord(record: AgentRecord, loadPage: PageLoader, now: Date = new Date()): Promise<Verdict> {
  const { iso: startsAt, timeKind } = parseStartsLocal(record.starts_local)!;
  const daysAhead = (Date.parse(startsAt) - now.getTime()) / (24 * 60 * 60 * 1000);
  if (daysAhead < 0) return { kind: "rejected", reason: "start is in the past" };
  if (daysAhead > MAX_DAYS_FROM_NOW) return { kind: "rejected", reason: `start is more than ${MAX_DAYS_FROM_NOW} days ahead` };

  const page = await loadPage(record.source_url);
  if (!page.ok) return { kind: "quarantined", reason: page.reason };

  // Title, venue and price are checked verbatim. The date is checked by parts below.
  const { date: _date, ...verbatim } = record.evidence;
  const quotes = Object.entries(verbatim).filter((entry): entry is [string, string] => entry[1] !== null);
  for (const [field, quote] of quotes) {
    if (!page.text.includes(normalizeText(quote))) {
      return { kind: "rejected", reason: `evidence.${field} is not on the page: "${quote}"` };
    }
  }
  if (!dateOnPage(record.starts_local, page.text)) {
    const parts = timeKind === "timed" ? "day, month and time" : "day and month";
    return { kind: "rejected", reason: `starts_local ${record.starts_local} is not stated on the page (${parts} near each other)` };
  }

  const sourceEventId = sourceEventIdFor(record);
  const fields = {
    sourceEventId,
    sourceSlotId: startsAt,
    slug: null,
    title: record.title,
    description: null,
    startsAt,
    venueName: record.venue_name,
    address: record.address,
    latitude: null,
    longitude: null,
    categories: record.category_hint ? [record.category_hint] : [],
    tags: [],
    priceMin: record.is_free ? 0 : record.price_min,
    isFree: record.is_free || record.price_min === 0,
    sourceUrl: record.source_url,
  };
  const endsAt = record.ends_local ? istLocalToIso(record.ends_local) : null;
  const occurrence: Occurrence = timeKind === "timed" ? { ...fields, timeKind, endsAt } : { ...fields, timeKind, endsAt: null };
  return { kind: "accepted", item: { id: sourceEventId, raw: { record, pageHash: page.hash }, occurrences: [occurrence] } };
}
