import type { Database } from "bun:sqlite";
import { AREAS } from "../catalog/area.js";
import { CATEGORIES } from "../catalog/category.js";
import { istCalendarDate, toIstOffset, tonightBoundsIst, weekendRangeIst } from "../utils/time.js";
import { htmlResponse } from "./html.js";
import { collapseRuns, facetCounts, loadEligibleEvent, queryListingEvents, readFilters } from "./queries.js";
import { Detail, NotFound } from "./site/Detail.js";
import { renderDocument } from "./site/Document.js";
import { Listing } from "./site/Listing.js";
import { publicSourceUrl } from "./source-url.js";
import type { EventCard, FacetCounts, ListingFilters, NowFn } from "./types.js";

export function notFoundPage(): string {
  return renderDocument({ title: "Not found", children: <NotFound /> });
}

export function listingPage(db: Database, url: URL, now: NowFn): Response {
  const filters = readFilters(url);
  const rows = queryListingEvents(db, filters, now, 200, 7);
  return htmlResponse(renderListing(rows, filters, facetCounts(db, filters, now, 7), now));
}

interface ProgrammaticRoute {
  area: string | null;
  category: string | null;
  free: boolean;
  weekend: boolean;
  /** Asia/Kolkata calendar-day windows (§11). */
  dayMode: "today" | "tonight" | null;
  title: string;
  lede: string;
}

export function matchProgrammaticRoute(path: string): ProgrammaticRoute | null {
  const areaSet = new Set<string>(AREAS as unknown as string[]);
  const catSet = new Set<string>(CATEGORIES as unknown as string[]);

  if (path === "/this-weekend") {
    return {
      area: null,
      category: null,
      free: false,
      weekend: true,
      dayMode: null,
      title: "This weekend in Hyderabad",
      lede: "Friday–Sunday events across the city.",
    };
  }
  if (path === "/today") {
    return {
      area: null,
      category: null,
      free: false,
      weekend: false,
      dayMode: "today",
      title: "Today in Hyderabad",
      lede: "Events starting today (Asia/Kolkata).",
    };
  }
  if (path === "/tonight") {
    return {
      area: null,
      category: null,
      free: false,
      weekend: false,
      dayMode: "tonight",
      title: "Tonight in Hyderabad",
      lede: "Events from 5pm IST through end of day.",
    };
  }
  if (path === "/free") {
    return {
      area: null,
      category: null,
      free: true,
      weekend: false,
      dayMode: null,
      title: "Free events in Hyderabad",
      lede: "No-ticket / free listings for the next seven days.",
    };
  }

  let m = path.match(/^\/(?:in|hyderabad)\/([^/]+)\/this-weekend$/);
  if (m && areaSet.has(m[1]!)) {
    const area = m[1]!;
    return {
      area,
      category: null,
      free: false,
      weekend: true,
      dayMode: null,
      title: `This weekend in ${area}`,
      lede: `Friday–Sunday events in ${area}.`,
    };
  }
  m = path.match(/^\/(?:in|hyderabad)\/([^/]+)$/);
  if (m && areaSet.has(m[1]!)) {
    const area = m[1]!;
    return {
      area,
      category: null,
      free: false,
      weekend: false,
      dayMode: null,
      title: `Events in ${area}`,
      lede: `Upcoming events in ${area} for the next seven days.`,
    };
  }
  m = path.match(/^\/c\/([^/]+)\/this-weekend$/);
  if (m && catSet.has(m[1]!)) {
    const category = m[1]!;
    return {
      area: null,
      category,
      free: false,
      weekend: true,
      dayMode: null,
      title: `${category} this weekend`,
      lede: `Friday–Sunday ${category} in Hyderabad.`,
    };
  }
  m = path.match(/^\/c\/([^/]+)$/);
  if (m && catSet.has(m[1]!)) {
    const category = m[1]!;
    return {
      area: null,
      category,
      free: false,
      weekend: false,
      dayMode: null,
      title: `${category} in Hyderabad`,
      lede: `${category} events for the next seven days.`,
    };
  }
  m = path.match(/^\/(?:in|hyderabad)\/([^/]+)\/c\/([^/]+)$/);
  if (m && areaSet.has(m[1]!) && catSet.has(m[2]!)) {
    const area = m[1]!;
    const category = m[2]!;
    return {
      area,
      category,
      free: false,
      weekend: false,
      dayMode: null,
      title: `${category} in ${area}`,
      lede: `${category} events in ${area} for the next seven days.`,
    };
  }
  return null;
}

export function programmaticListingPage(db: Database, url: URL, now: NowFn, prog: ProgrammaticRoute): Response {
  const filters = readFilters(url);
  filters.area = prog.area ?? filters.area;
  filters.category = prog.category ?? filters.category;
  if (prog.free) filters.free = true;
  let defaultDays = 7;
  if (prog.weekend) {
    const { from, to } = weekendRangeIst(now());
    filters.from = from;
    filters.to = to;
    defaultDays = 0;
  } else if (prog.dayMode === "today") {
    const day = istCalendarDate(now());
    filters.from = day;
    filters.to = day;
    defaultDays = 0;
  } else if (prog.dayMode === "tonight") {
    const { fromIso, toIso } = tonightBoundsIst(now());
    filters.fromIso = fromIso;
    filters.toIso = toIso;
    defaultDays = 0;
  }
  const rows = queryListingEvents(db, filters, now, 200, defaultDays);
  if (rows.length === 0) return htmlResponse(notFoundPage(), 404);
  return htmlResponse(renderListing(rows, filters, facetCounts(db, filters, now, defaultDays), now, prog.title, prog.lede));
}

export function detailPage(db: Database, publicId: string, origin: string): Response {
  const row = loadEligibleEvent(db, publicId);
  if (!row) return htmlResponse(notFoundPage(), 404);
  return htmlResponse(renderDetail(row, origin));
}

export function venuePage(db: Database, url: URL, now: NowFn, slug: string): Response {
  const nameKey = slug.replace(/-/g, " ");
  const venue = db.prepare("SELECT id, name FROM venue WHERE name_key = ?").get(nameKey) as { id: string; name: string } | null | undefined;
  if (!venue) return htmlResponse(notFoundPage(), 404);
  const filters = readFilters(url);
  filters.venueId = venue.id;
  const rows = queryListingEvents(db, filters, now, 200, 30);
  if (rows.length === 0) return htmlResponse(notFoundPage(), 404);
  return htmlResponse(
    renderListing(rows, filters, facetCounts(db, filters, now, 30), now, `Events at ${venue.name}`, `Upcoming events at ${venue.name}.`),
  );
}

function renderListing(
  rows: EventCard[],
  filters: ListingFilters,
  facets: FacetCounts,
  now: NowFn,
  heading = "What’s on",
  lede = "Hyderabad events for the next seven days.",
): string {
  return renderDocument({
    title: heading,
    children: <Listing entries={collapseRuns(rows)} filters={filters} facets={facets} now={now()} heading={heading} lede={lede} />,
  });
}

function renderDetail(row: EventCard, origin: string): string {
  return renderDocument({ title: row.title, jsonLd: buildEventJsonLd(row, origin), children: <Detail row={row} /> });
}

/** data-model.md §10.3 schema.org/Event — only for listing-eligible (active canonical) detail pages. */
function buildEventJsonLd(row: EventCard, origin: string): object {
  const startLocal = row.timeKind === "date-only" ? istCalendarDate(new Date(row.startsAt)) : toIstOffset(row.startsAt);
  const offersUrl = publicSourceUrl(row.sourceUrl);
  const offers: Record<string, unknown> = {
    "@type": "Offer",
    priceCurrency: "INR",
    availability: "https://schema.org/InStock",
  };
  if (offersUrl) offers.url = offersUrl;
  if (row.isFree === 1) {
    offers.price = "0";
  } else if (row.priceMin != null) {
    offers.price = String(row.priceMin);
  }

  const postal: Record<string, unknown> = {
    "@type": "PostalAddress",
    addressLocality: "Hyderabad",
    addressRegion: "TS",
    addressCountry: "IN",
  };
  const street = row.address?.trim();
  if (street) postal.streetAddress = street;

  const place: Record<string, unknown> = {
    "@type": "Place",
    name: row.venueName,
    address: postal,
  };
  if (row.latitude != null && row.longitude != null) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }

  const eventUrl = origin ? `${origin}/e/${row.publicId}` : `/e/${row.publicId}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: row.title,
    startDate: startLocal,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: place,
    description: row.description ?? row.title,
    url: eventUrl,
    offers,
  };
  // Omit endDate when missing or end ≤ start (invalid for schema.org/Event).
  if (row.endsAt) {
    const startMs = Date.parse(row.startsAt);
    const endMs = Date.parse(row.endsAt);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      jsonLd.endDate = toIstOffset(row.endsAt);
    }
  }
  return jsonLd;
}
