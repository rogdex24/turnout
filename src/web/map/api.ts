import type { Database } from "bun:sqlite";
import { jsonResponse } from "../api.js";
import type { NowFn } from "../types.js";
import { loadMap, mapWindow } from "./queries.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/map?from=YYYY-MM-DD&to=YYYY-MM-DD, both IST days, default the next seven days. */
export function mapApi(db: Database, url: URL, now: NowFn): Response {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) return jsonResponse({ error: "bad_date" }, 400);
  const { fromIso, toIso } = mapWindow(from, to, now);
  // Compact on purpose: the browser downloads this whole, so indentation is wasted bytes.
  return new Response(JSON.stringify(loadMap(db, fromIso, toIso)), {
    headers: { "content-type": "application/geo+json; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
