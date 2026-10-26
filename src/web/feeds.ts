/**
 * iCalendar output. RFC 5545 wants CRLF line endings and lines folded at 75
 * octets, both of which are easy to lose if this lives next to HTML rendering.
 *
 * Times go out as TZID=Asia/Kolkata local values rather than UTC, so a calendar
 * client shows the wall-clock time the venue advertised.
 */
import type { Database } from "bun:sqlite";
import { AREAS } from "../catalog/area.js";
import { CATEGORIES } from "../catalog/category.js";
import { normalizeVenueKey } from "../catalog/venue.js";
import { istCalendarDate, toIstOffset, tonightBoundsIst, weekendRangeIst } from "../utils/time.js";
import { SITE_NAME } from "./config.js";
import { escapeHtml } from "./html.js";
import { emptyFilters, loadEligibleEvent, queryListingEvents, readFilters } from "./queries.js";
import { publicSourceUrl } from "./source-url.js";
import type { EventCard, NowFn } from "./types.js";

export function buildCalendarIcs(rows: EventCard[], calName: string, origin = ""): string {
  const stamp = toIcsUtc(new Date().toISOString());
  const base = origin || "https://hydsocial.in";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//hydsocial//${SITE_NAME}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-TIMEZONE:Asia/Kolkata",
    `X-WR-CALNAME:${icsEscape(calName)}`,
  ];
  for (const row of rows) {
    const startMs = Date.parse(row.startsAt);
    const endMs = row.endsAt ? Date.parse(row.endsAt) : Number.NaN;
    const endIso =
      !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs
        ? row.endsAt!
        : new Date((Number.isNaN(startMs) ? Date.now() : startMs) + 2 * 60 * 60 * 1000).toISOString();
    const dtStart = toIcsLocal(row.startsAt);
    const dtEnd = toIcsLocal(endIso);
    const location = [row.venueName, row.address].filter(Boolean).join(", ");
    const sourceUrl = publicSourceUrl(row.sourceUrl);
    const description = [row.description ?? "", sourceUrl ? `Source: ${sourceUrl}` : ""].filter(Boolean).join("\n");
    const eventUrl = `${base}/e/${row.publicId}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${row.id}@hydsocial.in`);
    lines.push(`DTSTAMP:${stamp}`);
    if (row.timeKind === "date-only") {
      lines.push(`DTSTART;VALUE=DATE:${istCalendarDate(new Date(row.startsAt)).replaceAll("-", "")}`);
      lines.push(`DTEND;VALUE=DATE:${istCalendarDate(new Date(startMs + 24 * 60 * 60 * 1000)).replaceAll("-", "")}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Kolkata:${dtStart}`);
      lines.push(`DTEND;TZID=Asia/Kolkata:${dtEnd}`);
    }
    lines.push(`SUMMARY:${icsEscape(row.title)}`);
    if (location) lines.push(`LOCATION:${icsEscape(location)}`);
    if (row.latitude != null && row.longitude != null) {
      lines.push(`GEO:${row.latitude};${row.longitude}`);
    }
    if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
    lines.push(`URL:${icsEscape(eventUrl)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR", "");
  return lines.flatMap(foldIcsLine).join("\r\n");
}

function toIcsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function toIcsLocal(iso: string): string {
  return toIstOffset(iso).replace(/[-:]/g, "").replace("+0530", "");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string): string[] {
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const charBytes = new TextEncoder().encode(char).length;
    if (bytes + charBytes > 75) {
      lines.push(current);
      current = ` ${char}`;
      bytes = charBytes + 1;
    } else {
      current += char;
      bytes += charBytes;
    }
  }
  lines.push(current);
  return lines;
}

export function textResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}

export function categoryOrAreaIcsFeed(db: Database, slug: string, url: URL, now: NowFn): Response {
  const areaSet = new Set<string>(AREAS as unknown as string[]);
  const catSet = new Set<string>(CATEGORIES as unknown as string[]);
  const filters = readFilters(url);
  if (areaSet.has(slug)) filters.area = slug;
  else if (catSet.has(slug)) filters.category = slug;
  else {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const rows = queryListingEvents(db, filters, now, 500, 30);
  const ics = buildCalendarIcs(rows, `hydsocial-${slug}-30d`, url.origin);
  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.ics"`,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}

export function eventIcs(db: Database, publicId: string, origin: string): Response {
  const row = loadEligibleEvent(db, publicId);
  if (!row) {
    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const ics = buildCalendarIcs([row], `hydsocial-${publicId}`, origin);
  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${publicId}.ics"`,
      "access-control-allow-origin": "*",
    },
  });
}

export function eventsIcsFeed(db: Database, url: URL, now: NowFn): Response {
  const filters = readFilters(url);
  const rows = queryListingEvents(db, filters, now, 500, 30);
  const ics = buildCalendarIcs(rows, "hydsocial-events-30d", url.origin);
  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="events.ics"',
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}

export function llmsTxt(origin: string): string {
  const base = origin || "https://hydsocial.in";
  return `# ${SITE_NAME} (Hyderabad)

Timezone: Asia/Kolkata
City: Hyderabad, India

This site aggregates public Hyderabad event listings from third-party ticketing
and discovery sources. Always attribute the original source URL on each event.

## Machine-readable

- JSON list: ${base}/api/events?limit=50
- JSON detail: ${base}/api/events/{id-or-slug}
- ICS (next 30 days, listing-eligible): ${base}/events.ics
- ICS by area/category: ${base}/feeds/{area|category}.ics
- Tools (thin HTTP; full MCP deferred): ${base}/tools/search_events , ${base}/tools/get_event?id= , ${base}/tools/whats_on_this_weekend , ${base}/tools/list_venues , ${base}/tools/list_areas
- Programmatic: ${base}/today , ${base}/tonight , ${base}/this-weekend , ${base}/free , ${base}/in/{area} , ${base}/c/{category} , ${base}/v/{venue-slug}
- Distance: ${base}/api/events?lat=17.44&lng=78.35&radius_km=5
- Single event ICS: ${base}/e/{slug}.ics

Example:

  curl '${base}/api/events?area=gachibowli&category=comedy&free=true&limit=10'

No API key. CORS open. Prefer linking people to the event \`url\` and \`source.url\`.

Attribution request: if you quote or recommend an event, keep the source link.
`;
}

export function robotsTxt(origin: string): string {
  const base = origin || "https://hydsocial.in";
  return `User-agent: *
Allow: /
Sitemap: ${base}/sitemap.xml
`;
}

export function sitemapXml(db: Database, origin: string, now: NowFn): string {
  const base = origin || "https://hydsocial.in";
  const rows = queryListingEvents(db, emptyFilters(), now, 2000, 400);
  const urls: string[] = [
    `${base}/`,
    `${base}/map`,
    `${base}/api/events`,
    `${base}/events.ics`,
    `${base}/llms.txt`,
    `${base}/tools/search_events`,
    `${base}/tools/whats_on_this_weekend`,
    `${base}/tools/list_areas`,
    `${base}/tools/list_venues`,
  ];

  const freeFilters = emptyFilters();
  freeFilters.free = true;
  if (queryListingEvents(db, freeFilters, now, 1, 7).length > 0) {
    urls.push(`${base}/free`);
  }

  const { from: weekendFrom, to: weekendTo } = weekendRangeIst(now());
  const weekendFilters = emptyFilters();
  weekendFilters.from = weekendFrom;
  weekendFilters.to = weekendTo;
  const weekendRows = queryListingEvents(db, weekendFilters, now, 500, 0);
  if (weekendRows.length > 0) {
    urls.push(`${base}/this-weekend`);
  }

  // Programmatic pages only appear when their own route will render.
  const today = istCalendarDate(now());
  const todayFilters = emptyFilters();
  todayFilters.from = today;
  todayFilters.to = today;
  if (queryListingEvents(db, todayFilters, now, 1, 0).length > 0) {
    urls.push(`${base}/today`);
  }
  const tonightFilters = emptyFilters();
  const tb = tonightBoundsIst(now());
  tonightFilters.fromIso = tb.fromIso;
  tonightFilters.toIso = tb.toIso;
  if (queryListingEvents(db, tonightFilters, now, 1, 0).length > 0) {
    urls.push(`${base}/tonight`);
  }

  for (const row of rows) {
    urls.push(`${base}/e/${row.publicId}`);
    if (row.venueName) urls.push(`${base}/v/${venueSlug(row.venueName)}`);
  }

  // /in/{area}, /c/{category} and their combination default to a 7-day
  // window (programmaticListingPage's defaultDays); compute membership from
  // that same window so the sitemap never links a page that 404s.
  const weekRows = queryListingEvents(db, emptyFilters(), now, 2000, 7);
  const areas = new Set<string>();
  const categories = new Set<string>();
  const areaCategoryPairs = new Set<string>();
  for (const row of weekRows) {
    if (row.area) areas.add(row.area);
    categories.add(row.category);
    if (row.area) areaCategoryPairs.add(`${row.area}\u0000${row.category}`);
  }
  for (const area of [...areas].sort()) {
    urls.push(`${base}/in/${area}`);
    urls.push(`${base}/feeds/${area}.ics`);
  }
  for (const cat of [...categories].sort()) {
    urls.push(`${base}/c/${cat}`);
    urls.push(`${base}/feeds/${cat}.ics`);
  }
  for (const pair of [...areaCategoryPairs].sort()) {
    const [area, cat] = pair.split("\u0000");
    urls.push(`${base}/in/${area}/c/${cat}`);
  }

  const wAreas = new Set<string>();
  const wCats = new Set<string>();
  for (const row of weekendRows) {
    if (row.area) wAreas.add(row.area);
    wCats.add(row.category);
  }
  for (const area of [...wAreas].sort()) urls.push(`${base}/in/${area}/this-weekend`);
  for (const cat of [...wCats].sort()) urls.push(`${base}/c/${cat}/this-weekend`);

  // Dedupe while preserving order
  const seen = new Set<string>();
  const unique = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
  const body = unique
    .map(
      (loc) => `  <url>
    <loc>${escapeHtml(loc)}</loc>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function venueSlug(name: string): string {
  return normalizeVenueKey(name).replaceAll(" ", "-");
}
