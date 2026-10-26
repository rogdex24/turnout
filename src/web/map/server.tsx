import type { Database } from "bun:sqlite";
import { renderToString } from "react-dom/server";
import { endOfDayIst, istCalendarDate, startOfDayIst, tonightBoundsIst, weekendRangeIst } from "../../utils/time.js";
import { FAVICON_LINK } from "../brand.js";
import { SITE_NAME } from "../config.js";
import { INTER_URL } from "../fonts.js";
import { htmlResponse } from "../html.js";
import { THEME_BOOT, THEME_CSS } from "../theme.js";
import type { NowFn } from "../types.js";
import type { MapBoot } from "./components/MapApp.js";
import { MapRoot } from "./components/MapRoot.js";
import { mapCss } from "./css/index.js";
import type { Windows } from "./model/filters.js";
import { loadMap, mapWindow } from "./queries.js";

export function mapWindows(now: Date): Windows {
  const weekend = weekendRangeIst(now);
  return {
    dayStart: { tonight: startOfDayIst(istCalendarDate(now)), weekend: startOfDayIst(weekend.from) },
    tonight: tonightBoundsIst(now),
    weekend: { fromIso: startOfDayIst(weekend.from), toIso: endOfDayIst(weekend.to) },
  };
}

const escapeAttr = (value: string): string => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

/**
 * GET /map: renders MapApp to HTML with the boot snapshot (every listed event in the window), so the list, pills and links
 * work without JavaScript. The same snapshot is embedded as JSON; the client hydrates from it and does not fetch it again.
 * The bundles are injected so a test can render the page without building them.
 */
export function mapPage(db: Database, url: URL, now: NowFn, assetsIn: { js: string; css: string } | null): Response {
  const windows = mapWindows(now());
  const { fromIso, toIso } = mapWindow(null, null, now);
  const data = loadMap(db, fromIso, toIso);
  let assets = assetsIn;
  const preview = url.searchParams.get("state");
  // ?state= previews a state for screenshots: empty drops every venue, error drops the client entirely.
  if (preview === "error") assets = null;
  const boot: MapBoot = { data, windows, search: url.search, preview };
  const body = renderToString(<MapRoot {...boot} />);
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");

  return htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Map · ${SITE_NAME}</title>
  ${FAVICON_LINK}
  ${THEME_BOOT}
  <meta name="description" content="Hyderabad events on a map: this week's listed events by venue.">
  <link rel="preload" href="${INTER_URL}" as="font" type="font/woff2" crossorigin>
  ${assets ? `<script>document.documentElement.classList.add("js-map")</script>` : ""}
  <style>${mapCss()}
${THEME_CSS}
</style>
  ${assets ? `<link rel="stylesheet" href="${escapeAttr(assets.css)}">` : ""}
</head>
<body class="map-page">
  <div id="root">${body}</div>
  <script type="application/json" id="map-boot">${json}</script>
  ${assets ? `<script type="module" src="${escapeAttr(assets.js)}"></script>` : ""}
</body>
</html>`);
}
