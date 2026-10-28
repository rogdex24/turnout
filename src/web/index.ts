import type { Database } from "bun:sqlite";
import { eventsApiDetail, eventsApiList, jsonResponse, listAreasTool, listVenuesTool, whatsOnThisWeekendTool } from "./api.js";
import { faviconResponse } from "./brand.js";
import { categoryOrAreaIcsFeed, eventIcs, eventsIcsFeed, llmsTxt, robotsTxt, sitemapXml, textResponse } from "./feeds.js";
import { fontResponse } from "./fonts.js";
import { htmlResponse } from "./html.js";
import { iconSpriteResponse } from "./icons.js";
import { PublicInputError } from "./input.js";
import { mapApi } from "./map/api.js";
import { assetResponse, mapAssetsNow } from "./map/assets.js";
import { mapPage } from "./map/server.js";
import { detailPage, listingPage, matchProgrammaticRoute, notFoundPage, programmaticListingPage, venuePage } from "./pages.js";
import { type GrievanceBlock, privacyPage } from "./privacy.js";
import type { NowFn } from "./types.js";

interface RouteContext {
  db: Database;
  url: URL;
  now: NowFn;
  options: SiteOptions;
  /** Decoded capture groups from the matching pattern. */
  params: [string, ...string[]];
}

/** What the host passes in that the database does not hold. */
export interface SiteOptions {
  /** The grievance officer, shown on /privacy. Null reads as "Details not set". */
  grievance?: GrievanceBlock | null;
}

/** Returns null to decline, letting the next route try. */
type RouteHandler = (context: RouteContext) => Response | null;

/**
 * robots.txt, sitemap.xml and llms.txt are defined at one exact path, so they
 * decline the trailing-slash form every other route accepts.
 */
function exactPath(canonical: string, handle: RouteHandler): RouteHandler {
  return (context) => (context.url.pathname === canonical ? handle(context) : null);
}

/**
 * Matched in order, so a more specific pattern must come first: /e/x.ics
 * before /e/x, and the programmatic routes before the event detail page.
 */
const ROUTES: Array<[RegExp, RouteHandler]> = [
  [
    /^\/(?:preview|samples\/api-preview\.html)$/,
    () =>
      new Response(Bun.file(new URL("../../samples/api-preview.html", import.meta.url)), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      }),
  ],

  [/^\/privacy$/, ({ options }) => privacyPage(options.grievance ?? null)],

  [/^\/favicon\.svg$/, exactPath("/favicon.svg", () => faviconResponse())],
  // Browsers ask for /favicon.ico before reading the page head; point them at the SVG.
  [/^\/favicon\.ico$/, () => new Response(null, { status: 301, headers: { location: "/favicon.svg" } })],

  [/^\/llms\.txt$/, exactPath("/llms.txt", ({ url }) => textResponse(llmsTxt(url.origin), "text/plain; charset=utf-8"))],
  [/^\/robots\.txt$/, exactPath("/robots.txt", ({ url }) => textResponse(robotsTxt(url.origin), "text/plain; charset=utf-8"))],
  [
    /^\/sitemap\.xml$/,
    exactPath("/sitemap.xml", ({ db, url, now }) => textResponse(sitemapXml(db, url.origin, now), "application/xml; charset=utf-8")),
  ],

  [/^\/events\.ics$/, ({ db, url, now }) => eventsIcsFeed(db, url, now)],
  [/^\/feeds\/([^/]+)\.ics$/, ({ db, url, now, params }) => categoryOrAreaIcsFeed(db, params[0], url, now)],

  [/^\/api\/events$/, ({ db, url, now }) => eventsApiList(db, url, now)],
  [/^\/assets\/((?:map|chunk)\.[0-9a-z]+\.(?:js|css)|maplibre-worker\.js)$/, ({ params }) => assetResponse(`/assets/${params[0]}`)],
  [/^\/assets\/fonts\/inter-(?:latin|rupee)\.[0-9a-f]+\.woff2$/, ({ url }) => fontResponse(url.pathname)],
  [/^\/assets\/icons\/categories\.[0-9a-f]+\.svg$/, ({ url }) => iconSpriteResponse(url.pathname)],
  [/^\/map$/, ({ db, url, now }) => mapPage(db, url, now, mapAssetsNow())],
  [/^\/api\/map$/, ({ db, url, now }) => mapApi(db, url, now)],
  [/^\/api\/events\/([^/]+)$/, ({ db, url, params, now }) => eventsApiDetail(db, params[0], url.origin, now)],

  // Thin HTTP tool endpoints matching data-model 10.4 names (full MCP transport deferred).
  [/^\/tools\/search_events$/, ({ db, url, now }) => eventsApiList(db, url, now)],
  [
    /^\/tools\/get_event$/,
    ({ db, url, now }) => {
      const id = url.searchParams.get("id") ?? url.searchParams.get("slug");
      return id ? eventsApiDetail(db, id, url.origin, now) : jsonResponse({ error: "missing_id" }, 400);
    },
  ],
  [/^\/tools\/get_event\/([^/]+)$/, ({ db, url, params, now }) => eventsApiDetail(db, params[0], url.origin, now)],
  [/^\/tools\/whats_on_this_weekend$/, ({ db, url, now }) => whatsOnThisWeekendTool(db, url, now)],
  [/^\/tools\/list_venues$/, ({ db, url, now }) => listVenuesTool(db, url, now)],
  [/^\/tools\/list_areas$/, ({ db, now }) => listAreasTool(db, now)],

  [/^\/e\/([^/]+)\.ics$/, ({ db, url, params }) => eventIcs(db, params[0], url.origin)],
  [/^\/v\/([^/]+)$/, ({ db, url, now, params }) => venuePage(db, url, now, params[0])],
  [/^\/$/, ({ db, url, now }) => listingPage(db, url, now)],

  // Programmatic listing pages (spec 11). Its own matcher decides, so this
  // declines rather than matching a pattern.
  [
    /^\//,
    ({ db, url, now }) => {
      const route = matchProgrammaticRoute(normalizePath(url.pathname));
      return route ? programmaticListingPage(db, url, now, route) : null;
    },
  ],

  [/^\/e\/([^/]+)$/, ({ db, url, params }) => detailPage(db, params[0], url.origin)],
];

/** A trailing slash never changes the resource, so strip it once here instead of in every route. */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

export function siteResponse(db: Database, request: Request, now: NowFn = () => new Date(), options: SiteOptions = {}): Response {
  try {
    const url = new URL(request.url);
    // Validate encoding even on a path that no route matches.
    decodeURIComponent(url.pathname);
    decodeURIComponent(url.search);
    const path = normalizePath(url.pathname);
    for (const [pattern, handle] of ROUTES) {
      const match = pattern.exec(path);
      if (!match) continue;
      // Every pattern that reads params[0] has a mandatory capture group.
      const response = handle({
        db,
        url,
        now,
        options,
        params: match.slice(1).map((part) => decodeURIComponent(part!)) as [string, ...string[]],
      });
      if (response) return response;
    }
    return htmlResponse(notFoundPage(), 404);
  } catch (error) {
    if (!(error instanceof PublicInputError) && !(error instanceof URIError)) throw error;
    const response = jsonResponse({ error: "invalid_input" }, 400);
    response.headers.set("cache-control", "no-store");
    return response;
  }
}
