import type { Database } from "bun:sqlite";
import { AREAS } from "../catalog/area.js";
import { istCalendarDate, toIstOffset, weekendRangeIst } from "../utils/time.js";
import { readCursor, readLimit } from "./input.js";
import { cursorForEvent, emptyFilters, loadEligibleEvent, queryEventPage, queryListingEvents, readFilters } from "./queries.js";
import { publicSourceUrl } from "./source-url.js";
import type { EventCard, NowFn } from "./types.js";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}

export function whatsOnThisWeekendTool(db: Database, url: URL, now: NowFn): Response {
  const filters = readFilters(url);
  const { from, to } = weekendRangeIst(now());
  filters.from = from;
  filters.to = to;
  const limit = readLimit(url);
  const rows = queryListingEvents(db, filters, now, limit, 0);
  return jsonResponse({
    generated_at: now().toISOString(),
    timezone: "Asia/Kolkata",
    city: "Hyderabad",
    window: { from, to },
    count: rows.length,
    events: rows.map((row) => toApiEvent(row, url.origin, false)),
  });
}

export function listVenuesTool(db: Database, url: URL, now: NowFn): Response {
  const { area } = readFilters(url);
  const windowStart = now().toISOString();
  const windowEnd = new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const params: (string | number)[] = [windowStart, windowEnd];
  let areaClause = "";
  if (area) {
    areaClause = " AND v.area = ?";
    params.push(area);
  }
  const rows = db
    .prepare(
      `SELECT v.id, v.name, v.area, v.address, v.lat, v.lng,
              COUNT(e.id) AS upcoming_count
       FROM venue v
       LEFT JOIN listable_event e ON e.venue_id = v.id
         AND e.starts_at >= ?
         AND e.starts_at < ?
       WHERE 1=1${areaClause}
       GROUP BY v.id
       HAVING upcoming_count > 0
       ORDER BY upcoming_count DESC, v.name ASC
       LIMIT 200`,
    )
    .all(...params) as Array<{
    id: string;
    name: string;
    area: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    upcoming_count: number;
  }>;
  return jsonResponse({
    generated_at: now().toISOString(),
    timezone: "Asia/Kolkata",
    count: rows.length,
    venues: rows.map((v) => ({
      id: v.id,
      name: v.name,
      area: v.area,
      address: v.address,
      lat: v.lat,
      lng: v.lng,
      upcoming_count: v.upcoming_count,
    })),
  });
}

export function listAreasTool(db: Database, now: NowFn): Response {
  const rows = queryListingEvents(db, emptyFilters(), now, 2000, 30);
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.area, (counts.get(row.area) ?? 0) + 1);
  }
  const areas = (AREAS as unknown as string[]).map((slug) => ({
    slug,
    label: areaLabel(slug),
    event_count: counts.get(slug) ?? 0,
  }));
  return jsonResponse({
    generated_at: now().toISOString(),
    timezone: "Asia/Kolkata",
    city: "Hyderabad",
    count: areas.length,
    areas,
  });
}

function areaLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function eventsApiList(db: Database, url: URL, now: NowFn): Response {
  const filters = readFilters(url);
  const limit = readLimit(url);
  const after = readCursor(url, filters.lat !== null);
  const candidates = queryEventPage(db, filters, now, limit + 1, after);
  const rows = candidates.slice(0, limit);
  const nextCursor =
    // candidates.length > limit means rows is non-empty
    candidates.length > limit ? Buffer.from(JSON.stringify(cursorForEvent(rows[rows.length - 1]!, filters))).toString("base64url") : null;
  const generatedAt = now().toISOString();
  const body = {
    generated_at: generatedAt,
    timezone: "Asia/Kolkata",
    city: "Hyderabad",
    count: rows.length,
    next_cursor: nextCursor,
    events: rows.map((row) => toApiEvent(row, url.origin, false)),
  };
  return jsonResponse(body);
}

export function eventsApiDetail(db: Database, publicId: string, origin: string): Response {
  const row = loadEligibleEvent(db, publicId);
  if (!row) {
    return jsonResponse({ error: "not_found" }, 404);
  }
  return jsonResponse(toApiEvent(row, origin, true));
}

/** data-model.md §10.1 public event shape (list item; detail adds description + alternate_ticket_urls). */
function toApiEvent(row: EventCard, origin: string, includeDescription: boolean) {
  const path = `/e/${row.publicId}`;
  const event: Record<string, unknown> = {
    id: row.id,
    url: origin ? `${origin}${path}` : path,
    title: row.title,
    is_all_day: row.timeKind === "date-only",
    starts_at: row.timeKind === "date-only" ? null : row.startsAt,
    starts_at_local: row.timeKind === "date-only" ? istCalendarDate(new Date(row.startsAt)) : toIstOffset(row.startsAt),
    ends_at: row.endsAt,
    category: row.category,
    venue: {
      name: row.venueName,
      area: row.area,
      lat: row.latitude,
      lng: row.longitude,
    },
    is_free: row.isFree === 1,
    price_min: row.priceMin,
    price_max: null,
    currency: "INR",
    source: { name: row.source, url: publicSourceUrl(row.sourceUrl) },
    ticket_url: publicSourceUrl(row.sourceUrl),
    image_url: null,
  };
  if (includeDescription) {
    event.description = row.description;
    event.alternate_ticket_urls = [] as string[];
  }
  return event;
}
