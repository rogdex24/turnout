# Progress: /map React migration

## S1. Correctness fixes in the pure layer and the e2e harness

Done: S1.1, S1.2, S1.3, S1.4, S1.5.

- S1.1: `loadMap` now passes `row.sourceUrl` through `publicSourceUrl`, so `MapEvent.sourceUrl` is `string | null`. The expanded row renders the "View on" button only for an accepted URL. Test: `the map page and /api/map refuse unsafe source URLs too` (`test/site.test.ts`). The `mapPage` test seed used `source_url = 'u'`; it now uses an https URL, as real rows do.
- S1.2: `nextSevenDaysIst` in `src/utils/time.ts` returns today through today + 6 in IST; the listing's "Next 7 days" link uses it. Test: `the listing's Next 7 days link runs from today through today + 6 in IST` (checks the day rolls over at 18:30 UTC).
- S1.3: `src/web/map/model/selection.ts` exports `Selection` and `normalizeSelection`. Rules: an event resolves to its real host venue whatever `venue` says; an unknown event with a known venue keeps the venue; anything unknown is `none`. Tests in `test/mapSelection.test.ts`. Nothing calls it yet; `withEventVenue` stays until S4 moves the callers (D4, D6).
- S1.4: `groupEvents` pushes into the existing group array. Existing `groupEvents` tests pass.
- S1.5: `@playwright/test` 1.64.0 (exact), `bun run e2e` (`e2e/run.ts` picks a free port, Playwright starts `e2e/server.ts`, a seeded SQLite file in the OS temp dir behind `siteResponse` with a fixed clock). The basemap URL is stubbed with an empty style, so the specs need no network. `bun test` is limited to `test/` in `bunfig.toml` so it ignores `*.spec.ts`.

Baseline specs in `e2e/map.spec.ts`:

| Spec | State |
|---|---|
| slider drag changes the radius label and the count | passes now |
| hovering a pin shows its venue name | passes now |
| a collapsed section survives a pan | passes now |
| Back after selecting a venue returns to the list | passes now |
| a filter submit keeps `group` | `test.fixme` S4.2 (confirmed failing: the forms drop `group`) |
| failed basemap keeps the server list | `test.fixme` S5.6 (confirmed failing: the skeleton replaces the list first) |
| failed `/api/map` keeps the server list | `test.fixme` S5.6 (same) |

I ran the three fixme specs unskipped once to confirm they fail on today's code, so each fixme marks a real gap and not a flaky test.

Notes:
- Software WebGL makes the first map frame slow (5 to 15 s in a cold worker). The config uses 2 workers, a 15 s expect timeout and a 60 s test timeout. With 4 workers and all 7 specs unskipped the live specs timed out, so keep the worker count at 2.
- `bunx playwright install chromium` downloaded chromium 1248 and the install removed one older cached Chromium build (1234) from `~/Library/Caches/ms-playwright`. Other projects that pinned it will re-download.
- No screenshots in this slice.
- Deferred: nothing from S1. The other six review bugs (stale pin label, `[hidden]` pill, approximate reload, the failed-load list) belong to later slices as the plan assigns them.

## S2. DESIGN.md v2, tokens, font and the shared theme

Done: S2.1, S2.2, S2.3, S2.4. Screenshots: `docs/screenshots/s2/` (`map-desktop|phone-light|dark.png`, `admin-light|dark.png`, `admin-events-light|dark.png`, taken with the real OpenFreeMap basemap via `SHOTS=docs/screenshots/s2 SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts`).

- S2.1: `DESIGN.md` now has Inter (Typography), the two-layer shadow scale with alphas as numbers, the concentric radius scale (`rounded.panel` 24, `card` 16, `tile` 12, `full`; the `card` token went from 20 to 16), three motion durations and one curve, control height 36 with a 44 hit area (`control`, `hit-area` components; pills and the search pill went from 40 and 44 to 36), the chrome layout table, and a revised bundle budget. `bun run design:lint`: 0 errors, 0 warnings. Two colors changed: `muted` is now `muted-foreground` (so it equals shadcn's variable of that name) and `danger`/`on-danger` were added, with contrast computed in the Colors table (6.57 light, 7.76 and 7.11 dark).
- Bundle, measured before choosing the budget (`buildMapAssets()`, gzip): `map.js` 302,341 B, `maplibre-worker.js` 146,240 B, `map.css` 10,739 B, first load 459,320 B. React DOM in production mode (`hydrateRoot` + `useReducer`, `bun build --minify --production`) is 67,725 B gzip; the development build is 131,220 B. New budget: `map.js` 400 KB, and `map.js` + worker + CSS 560 KB. After S2: `map.js` 302,344 B, `map.css` 10,826 B (the Tailwind theme and utilities add 87 B because nothing uses a utility yet), total 459,410 B. Inter adds one 48,256 B file (woff2, already compressed) outside the JS budget.
- Finding for S3: `assets.ts` calls `Bun.build` without a production define, so a React import would bundle the development build (131 KB). S3 must set `define: { "process.env.NODE_ENV": '"production"' }` or `Bun.build`'s equivalent before React goes in.
- S2.2: `src/web/map/tokens.ts` emits the shadcn variables from the roles (`--background`, `--foreground`, `--card`, `--popover`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`) in the light block and, through the roles, in the one dark block. `src/web/ui/styles.css` maps them with `@theme inline` and holds no values (and `--color-*: initial` removes the default palette). Tailwind runs through `bun-plugin-tailwind` in `buildMapAssets`, imported by the client entry; `source(none)` plus two `@source` lines stop it scanning the admin (without that the CSS grew by 68 KB). Preflight is not imported. Probe check: `bg-primary`, `text-muted-foreground`, `rounded-xl`, `shadow-e2`, `font-sans`, `h-control` all resolve to `var()` of the generated variables. `test/mapTokens.test.ts` now covers `src/web/map`, `src/web/ui` and `src/web/map/components` for `.ts`, `.tsx` and `.css`.
- `src/web/ui/components.json` is `base-nova`; `shadcn info` reads it as style `base-nova`, base `base`. `shadcn add` from the repo root or with `-c src/web/ui` waits on an interactive library prompt in this environment, so no component was generated in S2; the first one (S3) needs a non-interactive run, or the files can be written by hand from the registry.
- S2.3: `src/web/fonts.ts` serves `inter-latin-wght-normal.woff2` from `@fontsource-variable/inter` 5.3.0 at `/assets/fonts/inter-latin.<hash>.woff2` with `cache-control: public, max-age=31536000, immutable`; the face is in the generated block (`font-display: swap`) and `/map` preloads the file. Tests: `/map links the self-hosted Inter file...` (`test/theme.test.ts`) and the e2e `/map text is Inter from our own origin, with no font CDN request`. Known gap: the rupee sign U+20B9 is in Inter's latin-ext file, which we do not ship, so it draws in the fallback face.
- S2.4: `src/utils/theme.ts` is the one protocol: `themeProtocol(output, set?)` reads or sets `localStorage.theme` and writes `data-theme` (public) or the `.dark` class and `color-scheme` (admin). The public pages embed its source in their inline boot and toggle scripts (`bootScript`); the admin imports it from `src/admin/ui/theme-boot.ts` and `components/theme-toggle.tsx`. The old inline script in `admin/ui/index.html` and the public `localStorage` code are gone (test: only `src/utils/theme.ts` touches the key). Brand colors: `src/utils/brandMark.ts` takes `ink` and `primary-dark` from DESIGN.md; the public favicon, the header lockup and the admin favicon (now `/favicon.svg` on the admin server) use it, and the hex literals in `brand.ts` and the data URI in the admin HTML are deleted. `.dependency-cruiser.json` gained `web-ui-is-a-leaf`; the admin already may import `utils`. The admin keeps its own palette.
- Admin check in a browser (Playwright, `e2e/theme.spec.ts`): the shell renders light, toggles to dark (`.dark` on `<html>`, page color below 60 and above 200 of 255), survives a reload, and returns to auto, all through the shared protocol. Screenshots `admin-*.png` show it intact in both themes.
- Side effects to know: the admin's theme boot is now a module script, so it runs after parse and before DOMContentLoaded rather than blocking the head, so a dark-theme admin could flash light for a frame on a slow load. The HTML bundler could not resolve a root-relative favicon href, so `theme-boot.ts` adds the `<link rel="icon">` at runtime.
- Typecheck now has two more projects: `src/web/ui/tsconfig.json` and `e2e/tsconfig.json` (the specs need the DOM lib; `e2e/server.ts` and `run.ts` stay in the root project).
- Deferred: applying the chrome layout and the panel's new radii in code (S6.1); the filter and search pills still lack the 44 px hit area overlay (S4.2); the header "List view" link underline and its closeness to the theme toggle show in the screenshots (S6).

## S2 follow-ups (commit 7668dc7)

- Rupee sign: `src/web/fonts/inter-rupee.woff2` (1,220 B, wght axis kept) is a subset of the package's latin-ext file (85,068 B), declared as a second face of "Inter Variable" with `unicode-range: U+20B9`, so it loads only on a page that prints a price. Rebuild with `scripts/subset-inter-rupee.sh` (needs fonttools and brotli). Measured: latin 48,256 B, rupee 1,220 B, latin-ext not shipped. Tests: `test/theme.test.ts` (route, immutable cache, size under 5 KB), `test/mapTokens.test.ts` (the face and its range), e2e `/map text is Inter...` (`document.fonts.load('16px "Inter Variable"', "₹")` returns the rupee face).
- Admin flash: a classic inline script in `src/admin/ui/index.html` head applies the stored theme before paint. Test: it is run against `themeProtocol("class")` for stored in {none, light, dark, junk} x OS in {light, dark}, plus blocked storage; e2e blocks every `.js` request and still sees `.dark`.
- Production React: `Bun.build` defines `process.env.NODE_ENV` as `"production"`. `test/mapBundle.test.ts` fails on a development build and on the budget.

## S3. React results panel, server-rendered and hydrated

Done: S3.1 to S3.5. Screenshots: `docs/screenshots/s3/` (desktop, phone, event expanded, venue grouping, phone sheet with a venue, light and dark, plus the admin). The only e2e `test.fixme` left is S4.2 (the filter form keeps `group`).

What changed, in the order the plan lists:
- S3.1: `src/web/map/server.tsx` renders `MapApp` with `renderToString` for GET /map. The same props, `{ data, windows, filters, preview }`, go into the page as `<script type="application/json" id="map-boot">` (D11); the client does not call `/api/map` (e2e checks the request never happens). Without JavaScript the pills are links, the search and Filters are GET forms, the list and event links work, and Near me and the theme toggle start hidden. Tests: `test/mapPage.test.ts` ("ships its snapshot as boot JSON...", "without JavaScript the pills are links..." plus the existing no-JS tests).
- S3.2: `client.tsx` calls `hydrateRoot`. e2e `the page hydrates without console errors or warnings...` captures console errors, warnings and page errors (I proved it catches a mismatch by adding `typeof window` to the tree: React error #418). `test/mapSource.test.ts` fails on any `innerHTML`, `dangerouslySetInnerHTML`, `insertAdjacentHTML` or `!important` under `src/web/map` and `src/web/ui`, and on `render.ts`, `page.ts`, `client/map.ts` or `icons.ts` existing. All four are deleted, with `scripts/vendor-lucide.ts` (icons are `lucide-react` now).
- S3.3: `ResultsPanel` (Toggle Group of links for Type / Day / Venue, then an Accordion with `multiple`, all open by default). Open state is the `collapsed` list in the `useReducer` of `model/state.ts` (D5), so a pan keeps it: e2e `a collapsed list section stays collapsed after the map is panned`. `EventRow` and `EventImage` own the image state (`failed`, `poster`) and read `complete` on mount for an image that finished before hydration. shadcn files in `src/web/ui/components/` (accordion, toggle, toggle-group) came from `https://ui.shadcn.com/r/styles/base-nova/<name>.json` (the URL pattern comes from the registry resolver in shadcn's source via ctx7) fetched 2026-10-11, registry served by shadcn 4.21.x; the sha256 prefixes are in each file's header, and I adapted classes and icons to our tokens. `@base-ui/react` 1.9.0 is pinned.
- S3.4: `aria-expanded` and `aria-controls` (`ex-<event id>`, a `role="region"`) on the row link. Focus follows the activated row into the venue card, stays on it when the details close, and "All events" focuses the first row or header of the venue it closed. e2e `focus returns to the event row when its details close...`.
- S3.5: the panel heading counts events in the unobscured viewport (the map minus the card or sheet, from `map.unproject` with the camera padding) and reads "N events" until the map reports one, then "N events in view"; the floating count is all matches plus unplaced; one visually hidden `aria-live="polite"` region announces the settled viewport count 400 ms after a move or filter change, and the floating count is no longer live. Tested in `test/mapPage.test.ts` (server side) and the hydration e2e (client side).

Other changes you should know about:
- Because no `innerHTML` may remain, the pills, markers, count, sheet controls and Near me moved to React in this slice as well: `FilterBar` (a straight port of the old pills, Popover and nuqs are still S4), `MapCanvas` (MapLibre in refs, markers as portals keyed by venue or cluster id, so a changed next event updates the tile and the stale pin label bug is gone; declutter reads every box then writes a `data-hidden` attribute, no `!important`), `SheetControls` (pointer capture and pointercancel handled, Expand and Collapse disabled at the ends), `LocationDot`, `ThemeToggle`, `Brand`. That pulls parts of S4.3, S5.2, S5.3 and S5.4 forward. They are not claimed done: the Slider, Combobox and Popover (S4.2, S4.3), the mapcn base and basemap fetch hardening (S5.1), Drawer (S5.5) and the approximate-venue reload rule beyond what `reveal` does (S5.6) are still to do.
- `MapApp` has one transition function `go()` for every link, form, marker click and Popstate (this is the shape S4.4 asks for); `parseFilters` and `toQuery` are still the codec until S4.1.
- Startup is bounded (20 s) and any failure removes `js-map`, shows the notice and leaves the server list, so the basemap-failure e2e spec is no longer `fixme` (`the server list stays visible`). The `/api/map` failure spec became "the client does not refetch /api/map on load" because the client no longer fetches it.
- Moved: `client/filters.ts` to `model/filters.ts` (grouping to `model/group.ts`), `client/style.ts` to `basemap.ts`, `page.ts` to `server.tsx`. The root `tsconfig.json` now has the DOM lib and `jsx: react-jsx` (it covers `.tsx` under `src` except the admin UI); `src/web/map/client/tsconfig.json` is gone. MapLibre is loaded through `maplibre.ts`, which re-exports four names: a bare `import("maplibre-gl")` kept every export and cost about 25 KB gzip.
- `tailwind-merge` is out of the public `cn` (9 KB gzip); see the budget below.
- Known gaps to fix in later slices: a viewport with no events shows "No events match" even when other events match elsewhere (an old behavior, not changed); the Toggle Group items carry `aria-pressed` on links (Base UI adds it; `aria-current` is the accurate one).

Bundle (gzip): `map.js` 396,321 B (limit 400 KB), `maplibre-worker.js` 146,240 B, `map.css` 12,184 B, total 554,745 B (limit 560 KB). Before S3: 302,344 / 146,240 / 10,826 / 459,410. React DOM is 211 KB raw of the 1,347 KB. The headroom is 3.7 KB and 5.3 KB, and S4 adds nuqs, Popover, Slider and Combobox, so S4 will have to either trade something out or revisit the budget with new measurements.

## S4. Filter bar and URL state

Done: S4.1 to S4.4, plus the two fixes you asked for. Screenshots: `docs/screenshots/s4/` (the S3 set plus the Filters popover open with the Type combobox filtering, and Near me with the slider, light and dark).

**Budget: it does not fit, and I did not change DESIGN.md.** Measured after S4 (gzip, `buildMapAssets()` with `splitting`):

| Part | Bytes |
|---|---|
| entry `map.js` | 91,269 |
| eager shared chunks (nuqs adapter, lucide, Base UI core for the accordion and toggles, React) | 28,366 |
| MapLibre chunk (loaded right after hydration) | 291,004 |
| `map.css` | 12,739 |
| `maplibre-worker.js` | 146,240 |
| first load, subtotal | 569,618 |
| Filters popover chunk (Popover, Combobox, floating-ui) | 53,552 |
| distance slider chunk | 8,146 |
| every file, total | 631,316 |

DESIGN.md says `map.js` 400 KB (the entry passes at 91 KB) and everything 560 KB. The sum of every file is 71 KB over, and even the first load, without the two lazy chunks, is 9.6 KB over. By piece: Popover + Combobox cost 53.6 KB, the Slider 8.1 KB, nuqs and the S4 shell about 5 KB; without the two lazy pieces the first load would be 559.2 KB. The Combobox is most of the cost (Base UI's combobox plus floating-ui). `test/mapBundle.test.ts` keeps the entry limit as a normal test and the 560 KB total as `test.failing`, so `bun run check` stays green, the breach is on record, and the test fails the moment the total fits again.

Proposal for you to decide (numbers from the table, about 2% headroom): first load (entry, eager chunks, MapLibre chunk, CSS, worker) at most 580 KB; on-demand chunks (popover, combobox, slider and future ones) at most 70 KB; total at most 650 KB. If you would rather keep 560 KB, the way to get there is to drop the Combobox for a native select with the same emoji labels (total 577.8 KB, first load still 569.6 KB, so even that needs the first-load line moved or about 10 KB more cut from React and Base UI).

- S4.1: `src/web/map/model/url.ts` is the one nuqs descriptor (`filterParsers`), with `loadFilters` (`createLoader`) for the server and `href` (`createSerializer`) for links. `parseFilters`, `toQuery` and `withEventVenue` are deleted (`test/mapSource.test.ts` fails if one comes back). `free` reads `1`, `true` and `on` and writes `1`; `q` is trimmed; an empty `category=` is none; key order is stable. `MapRoot` wraps `MapApp` in `NuqsAdapter` with `serverSearch`, the request's query string, on both server and client, so the first client render matches the server (the hydration e2e still passes, and boot JSON now carries `search` instead of `filters`). nuqs 2.10.2 is pinned. Tests: `test/mapFilters.test.ts` (round trip, `free` aliases, resolve rules, key order).
- S4.2: `FilterBar` has the search (a draft until submit; the form keeps `group`, so the S1 `test.fixme` is now a real test), the when presets as a shadcn Toggle Group of links, Free as a Toggle, Near me, and the Filters pill. The pill opens `FiltersPopover`: Popover (Base UI) with Type as a Combobox (options are `categoryLabel`, "😂 Comedy") and Area as a native select. Escape and an outside press close it and focus returns to the pill. Both parts are lazy chunks (`React.lazy`, Bun `splitting`, hashed `chunk.*.js` served by the existing asset route); the pill preloads on hover or focus. Without JavaScript the pill is a native `<details>` around a GET form with the same fields. Every control is 36 px with a 44 px hit area, checked in the browser by `every filter control is 36 px high with a 44 px hit area` (the search input is 44 px inside its 36 px pill, the slider control 44 px). Fixing that test also fixed the pill `::before`, which was 2 px short because of the border.
- S4.3: Near me is the `Location` union from S3, now with `aria-busy`, `disabled` and "Locating…" while requesting (e2e `Near me shows a pending state, then turns on with the distance slider` holds the geolocation call open to look at it). The slider is the shadcn Slider (Base UI), 1 to 25 km, default 4. Its drag updates the label at once and the results once per animation frame; the camera fits on commit.
- S4.4: `go()` only sets the URL (nuqs, `history: "push"`; typing does not push). Camera and sheet moves are one effect over the resulting filters: a newly opened venue or event flies to it, a changed search (when, category, area, free, q) fits the results, a change of grouping or closing a card leaves the camera alone. That also fixes Codex finding 1: Back or Forward to a state with a venue now reveals it. `history.pushState` appears nowhere in `src/web/map` (test). e2e `Back and Forward restore filter, grouping and selection changes in order` goes through filter, grouping and selection and back and forth again.
- Fix 1: the Toggle Group links carry `aria-current` only. `aria-pressed` is removed, and the hydration e2e asserts there is none and exactly one current item per group.
- Fix 2: a viewport with no events but matches elsewhere says "No events in this area", "N events match elsewhere on the map." and a "Show all" button that fits the map to the matches; no matches at all still says "No events match". e2e `panned to an empty area...`. DESIGN.md has the new copy under States.

Other things you should know about:
- DESIGN.md changed for the filter row, the Filters popover, Near me states and the slider, not for the budget.
- The e2e harness had two flaky causes, both fixed: `bunx playwright` could hang on a registry lookup (it now runs `node_modules/.bin/playwright`), and two free ports picked from the OS's ephemeral range could collide with the admin's inner server (they now come from 20000 to 40000).
- Components copied from the shadcn base-nova registry this slice: popover, combobox (trimmed: no chips, groups, Button or InputGroup), slider; headers carry the URL, date and sha256 prefix.
- Known gaps: the Area field is still a native select, and the popover's Apply applies the combobox and select together (no live apply).

## Budget decision after S4

Adopted on the owner's mandate: first load at most 580 KB gzip (entry, eager chunks, MapLibre chunk, CSS, worker) and on-demand chunks at most 70 KB in all. DESIGN.md records the S4 measurements as the reason. `buildMapAssets` now reports `onDemand`, the chunks reachable only through a dynamic import that is not MapLibre, and `test/mapBundle.test.ts` has plain tests for both lines (the `test.failing` is gone). S4 numbers against them: first load 569,618 B, on demand 61,698 B.

## S5. Map, markers, sheet and lifecycle

Done: S5.1 to S5.6. Screenshots: `docs/screenshots/s5/` (everything from S4 plus the phone sheet at peek, half and full, light and dark). No `test.fixme` remains.

**Toolchain finding that changes how to read bundle numbers.** `bun run` puts `node_modules/.bin` first, and that holds Bun 1.4.3 (installed as a peer of `bun-plugin-tailwind`); the `bun` on this machine's PATH is 1.3.14. The two split the same code into different chunks. My S4 measurements used 1.3.14 (first load 569.6 KB, on demand 61.7 KB) while `bun run check` measured with 1.4.3. All numbers below are from 1.4.3, which is what `bun run check`, `bun run e2e` and `bun run serve` use; AGENTS.md says so.

Bundle after S5 (gzip, Bun 1.4.3, `onDemand` as `buildMapAssets` reports it):

| Part | Bytes |
|---|---|
| entry `map.js` | 110,649 |
| first load (entry, eager chunks, map chunk with MapLibre, CSS, worker) | 563,485 |
| on demand, all | 68,972 (Filters popover chunk 32,447, phone sheet 13,592, shared Base UI code 13,437, slider 7,567, small 1,929) |
| every file | 632,457 |

The first load is under 580 KB and the on-demand total under 70 KB (1 KB of headroom). One thing the budget lines do not capture: a phone also fetches the sheet chunk and the Base UI code it shares at load, 27,675 B, so a phone's first load is 591,160 B. I did not change DESIGN.md; if you want that counted, a "phone first load at most 600 KB" line would cover it.

- S5.1: `src/web/ui/map.tsx` is mapcn's `Map`, `MapMarker` and `MarkerContent` (from `https://mapcn.dev/r/map.json`, the registry build of `src/registry/map.tsx`, repo commit d160bd7 of 2026-09-06, MIT, fetched 2026-10-11; the header lists what is kept and what changed). `MapCanvas` is built on it with our basemap (OpenFreeMap styles, our repaint, the venue and radius sources), our worker URL and our markers. Changes to mapcn, each in the header: the style is a loader (`loadStyle`) not a URL; only the newest theme request applies, and a change back to the theme on screen retires a request in flight (found by the e2e); a style that fails to load leaves the one on screen; theme detection falls back to the OS when the document stops naming a theme (mapcn keeps the last one); startup is bounded; markers take a class and no wrapper. What mapcn blocked: its cluster layer draws circles, but DESIGN.md wants stacked tiles with a caption, which are DOM markers, so clusters stay as markers from our code; its controls, popups, routes, arcs and GeoJSON layers are not used and were left out (the Map module is 79 KB of source). So `react-map-gl` was not needed. e2e (`e2e/map-lifecycle.spec.ts`): a slow dark style does not win after you went back to light, a failed dark style keeps the light one with no notice, and a loaded one applies (checked through `data-basemap`).
- S5.2: one `MapMarker` per venue keyed by venue id; a pin whose next event changes updates in place (e2e: search "open mic" and the same pin reads "Open mic at Near Hall, Comedy, 1 event"); cluster keys are `c<id>@<revision>`, the revision bumping each time the source data changes, so an old cluster id is never reused for a different cluster. The accessible name is "<next event> at <venue>, <category word>, <n events>" (e2e).
- S5.3: `MapEngine` reads every label and tile box once, decides, then writes `data-hidden` on the labels; it reruns after each settled move, label-zoom change and data change. No inline `visibility`, no `!important` (`test/mapSource.test.ts`). Fix found by the e2e: the selected venue's label is never hidden (DESIGN.md says so) and the pass used to skip reruns after zoom. e2e `overlapping labels are hidden with an attribute...`, with two fixture venues 150 m apart.
- S5.4: `LocationDot` and `RadiusRing` are components under the map, driven only by the location union; the e2e follows the slider with arrow keys and Near me off clears both (`data-ring` on the map container mirrors the radius).
- S5.5: `MobileSheet` is the shadcn Drawer (Base UI, base-nova registry, trimmed to a non-modal bottom sheet, source and hash in the header) with snap points 120 px, 50dvh and 100dvh - 72 px, as visible heights in px. It is its own chunk, loaded only when the screen is phone-sized; until then, and without JavaScript, the list is the plain block. Expand and Collapse are disabled at the ends, a tap on the handle cycles, `onOpenChange` is ignored so a swipe past peek springs back, and camera padding follows the detent's height (a `refresh` request recomputes the viewport once it settles). e2e (`e2e/phone.spec.ts`, 390 x 844): starts at peek with 120 px visible and no overlay; Expand and Collapse reach 422 px and 772 px and stop; a real touch drag (through CDP touch events) moves peek to half and back; the map pans with the sheet open and the sheet stays at half; opening a venue lands its pin above the sheet. A fast flick is read by speed (it can skip a detent), so the drag tests move steadily and rest before letting go.
- S5.6: the server list is never replaced; the map has 20 s to be ready; a style error, a chunk that will not load and a timeout all show the notice with a "Try again" button, which restores the map layout and starts the map again (e2e, the timeout one with a fake clock). Approximate venues never move the camera, on click or on reload: `fit`, `focus` and `reveal` only use exact points (e2e: the row click and a `?venue=` load leave the pins where they were, and an exact venue does move them, so the check is not vacuous).

Other things you should know about:
- DESIGN.md changed for the Drawer, the map failure copy, marker names and the declutter rules, not for the budget.
- The e2e fixture gained an approximate venue and two close venues; counts in the specs moved (12 events, 7 venues).
- `SheetControls` and its hand-written pointer handling are deleted (the Drawer does the dragging).
- At peek, the sheet shows the heading and not yet a row (DESIGN.md says one row); that is a spacing matter for S6.

## S6. Polish to DESIGN.md v2

Done: S6.1 to S6.4 and the six review fixes. Screenshots: `docs/screenshots/map-v2/before/` (the S5 build, 24 files, the old matrix names) and `docs/screenshots/map-v2/after/` (74 files, `<state>-<size>-<theme>.png`, real basemap, 1280 x 800 and 390 x 844, light and dark). `e2e/shots.spec.ts` now takes the whole matrix of `docs/map-states.md`: `SHOTS=<dir> SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts`. The admin shots are gone from it (S6 does not touch the admin). The fixture gained a landscape cover (e1), a portrait poster (e4) and an organiser (e2), answered by the browser tests themselves so nothing leaves the machine.

DESIGN.md changed first (lint 0 errors, 0 warnings): chrome layout rewritten, `event-row`, `view-switch` components, panel inset 8, the open event as a card, the light face for black emoji outside tiles, e-levels per surface, popover motion.

### The six fixes

| # | Before | After | Evidence |
|---|---|---|---|
| 1 Header | "List view" underlined link sat on the theme toggle at 1280 and 390 (`before/map-desktop-light.png`, `before/map-phone-light.png`) | One wrapping flex row: brand pill, search, List / Map switch, icon-only theme button. Phone: mark only, search fills the rest, one line | `after/idle-desktop-light.png`, `after/idle-phone-light.png`; e2e `S6.1 the top row ... do not overlap anything` runs at both sizes in both themes: 4 items on one line in order, each 36 px, no bounding box overlaps the controls, filter row, count or panel, no sideways scroll |
| 2 Expanded event | Thumbnail plus "Hide details" above a duplicate cover (`before/map-event-light.png`) | The row becomes a card (radius 16, e1): cover inset 4 px with a 12 px corner, title, meta, organiser, actions, credit; a 36 px round X over the cover is the row's own link (same element, so focus stays) | `after/event-cover-desktop-light.png`, `event-poster-*`, `event-organiser-*`, `event-plain-*`; e2e `the open event is a card` (one `.cover`, no `.thumb`, no "Hide details", radii 16/12, inset 4, Enter closes and focus stays on `[data-event]`); `test/mapPage.test.ts` for the no-JS render |
| 3 Black emoji | Music thumbnails, covers and group headings were black on dark (`before/map-desktop-dark.png`) | `--emoji-face` exists only in dark and is the tile's light face (ink 72% into surface). `.ph` takes it for music and film; headings and meta lines get a halo of it (4 px and 2 px, a shadow, so no layout cost) | `after/idle-desktop-dark.png`, `group-venue-desktop-dark.png`, `event-cover-*-dark.png`; e2e `dark mode shows black emoji` (music placeholder luminance above 0.45, comedy below 0.3, heading chip lit) |
| 4 Peek | Heading only, no row (`before/map-sheet-peek-light.png`) | Handle zone 20 px, heading, then one whole row inside 120 px. At peek the Group by switch and section headers step aside (CSS, phone only), so the first row sits under the heading | `after/sheet-peek-phone-light.png`, `-dark.png`; e2e `the sheet shows the handle, the heading and one whole row`: the row's text box ends above the 120 px edge, Group by is hidden at peek and back after Expand |
| 5 Row spacing | `.panel .meta { margin: 0 0 12px }` also hit every row's meta span, so the venue line sat 16 px under the meta line (12 + 4) and rows were 92 px apart; the heading and rows had no shared inset | One anatomy for type, day and venue lists, the venue card and the sheet: lines 4 apart, padding 4 above and below and 12 at the sides, 12 between thumbnail and text, rows 8 apart (80 px pitch with three lines, 72 with two), min height 64, radius 16 with a 12 px thumbnail, thumbnail aligned with heading text. The margin rule is scoped (`.lede`) | e2e `one row anatomy` measures 4, 4, 8, 16, 12, 4, 12, 12, 64 and the thumbnail-to-heading offset 0 |
| 6 Shadow, radius, motion | Toast at e3, notice and secondary buttons flat, popover without motion, mixed 8 and 12 radii inside the panel | Panel inset 8 so rows and cards sit 8 from the edge (24 - 8 = 16); e1 on pills, switch, count, controls, secondary buttons, the open card and notices; e2 on tiles, the dot and toasts; e3 on panel, sheet and popovers. Popovers fade and scale from the anchor at `base`; hover, press and pill state use `fast` on listed properties. Controls carry `touch-action: manipulation` | e2e `surfaces take their shadow level from the table` resolves `--e1` to `--e3` on a probe and compares computed shadows for pill, switch, count, tile, panel, open card, primary button and popover |

### S6 IDs

- S6.1: chrome layout matches DESIGN.md at 1280 x 800 and 390 x 844, light and dark. Wide: top row top left, control column 8 px left of the card and vertically centred (zoom in, zoom out, locate, a compass that shows only while the map is rotated, built from `MapControls` and camera requests `zoom` and `north`), filter row above the count bottom left. e2e: `desktop placement` and `zoom buttons move the map and the compass appears...`.
- S6.2: the matrix, every state of `docs/map-states.md` in 74 files: idle, cluster, venue, approximate, expanded event with cover, poster, organiser and neither, group by day and venue, loading, empty, error, denied, Filters open, Near me, hover and focus (desktop), the three sheet detents (phone).
- S6.3: bundle below. `/` loads no map JavaScript (`test/mapPage.test.ts`: the listing has no `/assets/` and no `maplibre`).
- S6.4: `no transition: all` (`test/mapSource.test.ts`, covers `transition: all` and Tailwind `transition-all`); `touch-action: manipulation` on pills, buttons, links, rows, the close button, the switch, triggers, tiles (e2e); tabular numbers on time, price, count and badge (e2e); visible 2 px focus ring with a 2 px offset on every chrome control reached by 40 Tab presses (e2e); reduced motion gives `0s` transitions on pills, rows, switch and segments (e2e).

### Bundle (gzip, Bun 1.4.3, what `bun run check` measures)

| Part | Bytes | Limit |
|---|---|---|
| entry `map.js` | 111,127 | 400,000 |
| `map.css` | 13,041 | |
| `maplibre-worker.js` | 146,240 | |
| first load (entry, eager chunks, map chunk, CSS, worker) | 564,322 | 580,000 |
| on demand, all (Filters popover 32,524, phone sheet 13,591, shared Base UI 13,433, slider 7,563, small 1,929) | 69,040 | 70,000 |
| every file | 633,362 | |

S5 was 563,485 first load and 68,972 on demand, so S6 adds 837 B and 68 B (the control column and the header). The on-demand line has 960 B of headroom. A phone also fetches the sheet chunk and what it shares, 27,024 B, so a phone's first load is 591,346 B (the phone line I suggested in S5 still stands; DESIGN.md does not have one yet). Under the global Bun 1.3.14 the same code splits differently (on demand 84,555 B); only 1.4.3 counts.

### Deviations and things to know

- Phone filter row: the old S2.1 text put it just above the peek detent. At half and full the sheet covers that spot, so the filters would be unreachable. It is a second row under the top row instead, and the control column hangs below it. DESIGN.md says so and why (Layout).
- Near me moved from the filter row into the control column as the locate button (`#near`, `aria-pressed`, `aria-busy`, named "Near me" or "Locating…"). The slider stays in the filter row. The e2e pending check reads the accessible name instead of the text.
- On phones the floating count is hidden (the sheet heading is the count), so "+N unplaced" is not shown there.
- The control column only shows once the map is ready, so a failed map has no zoom buttons.
- At peek in Venue grouping the venue name header is hidden too, so a peek row there has no venue line.
- Not fixed, found while looking: the MapLibre attribution box in dark mode is a grey strip with low-contrast text (it was like this in S2 to S5); the Type combobox options in the Filters popover are plain text, so a black 🎵 is dark on dark there; Music and Film headings in the Type list use the chip but the popover does not.
- Unit tests 312 pass, `bun run check` exit 0, `bun run e2e` 49 passed (the 74 screenshot specs skip without `SHOTS`).

## S6 follow-ups and S7. Listing, category, area and event pages on the same components

Screenshots: `docs/screenshots/s7/` (`listing`, `listing-filtered` and `event-page`, desktop and phone, light and dark, full page).

### S6 follow-ups (commit ffb9f27)

1. Phone first load: `buildMapAssets` now reports `phone`, the on-demand chunks a phone fetches at load (the sheet and what it imports), and `test/mapBundle.test.ts` measures a phone's first load against the same 580 KB line. Trims, not a bigger budget: MapLibre's stylesheet loses the rules for controls we do not draw (a Bun plugin; zoom, compass, geolocate, fullscreen, globe, popup, scale, logo; the attribution button's icon stays) for 9.4 KB, and the when presets, Free and Group by are plain links in a `role="group"` instead of Base UI Toggle and Toggle Group (they were links with the toggle state stripped and the tab stop forced), which takes Base UI's composite and floating-ui helpers out of the first paint. First load 546.8 KB, phone first load 577.9 KB. The phone chunks are no longer counted twice: they were in the 70 KB on-demand line, they now count against the phone line, and on demand is 41.3 KB (popover and slider). DESIGN.md says so.
2. Attribution: one specificity fix puts it on the glass surface with muted-foreground text (4.5:1 or better, checked in e2e in dark), the info button's black icon is inverted in dark through `--attrib-icon`, and on phones MapLibre's start-open compact box is closed so it is the button until tapped. The e2e stub style now carries an attribution so these can be tested.
3. The Type combobox options draw their emoji with `CategoryEmoji`, so music and film get the light face in dark mode. The input shows the word only.
4. `+N unplaced` is in the panel heading line on phones (`.unplaced`, hidden on wide screens where the floating count carries it).

### S7

- S7.1: `src/web/site/` renders the listing, category, area, venue and event pages with React (`renderToStaticMarkup`) from `Document`, `Header`, `Listing`, `Detail`. The page reads the same generated DESIGN.md block as the map (so Inter, tokens and dark mode are one set), plus `src/web/ui/chrome.ts`, the chrome both pages share (brand lockup, List / Map switch, pill, buttons, links, focus ring), moved out of the map's stylesheet. `Brand` and `ViewSwitch` are components in `src/web/ui/components/` used by the map header and the site header. There is no bundle: the only script after the theme boot in the head is the theme toggle's, and on an event page the JSON-LD data block. Tests: `test/sitePages.test.ts` (scripts, no `/assets/(map|chunk|maplibre)`, tokens, no hex outside the generated block), `test/mapTokens.test.ts` now covers `src/web/site`, e2e `loads with no console errors, no map bundle and Inter from our own origin` on `/`, `/c/comedy`, `/e/e1`.
- S7.2: `pages.ts` is `pages.tsx` and holds only route handlers, the programmatic-route matcher and the JSON-LD builder; `layout`, `eventCard`, `filterForm`, `select`, `option`, `brandLockup` and `themeToggle` are deleted (test checks). `htmlResponse` and `escapeHtml` moved to `src/web/html.ts`. Every `test/site.test.ts` assertion passes unchanged (feeds, JSON-LD, filters with counts, selected value kept, quick links, sitemap, `javascript:` refusal, `<dt>Category</dt><dd>😂 Comedy</dd>`).
- S7.3: `src/web/viewLinks.ts` writes the links. On the listing and its programmatic pages, Map is `/map?category=..&area=..&free=1`; on the map, List is `/?category=..&area=..&free=true` and follows filter changes live. e2e `filters round-trip`: choose Comedy and Free only on the listing, press Map (the map applies them: Free is current, the Filters pill is marked, every pin is a comedy venue), toggle Free (List href updates), press List (the form shows comedy and the checkbox checked). The event page gained "Show on the map" (`/map?event=<id>`).

Other things that changed with it: the theme button is icon-only on every page (the listing's inline script updates the icon and the accessible name); the listing's page heading is now the `h1` (the brand used to be); the `h1` brand lockup is a link in the header. Spec count: 61 e2e passing, 320 unit tests.

Bundle (gzip, Bun 1.4.3): entry 103,007, `map.css` 3,768, worker 146,240, first load 547,094 (limit 580,000), phone first load 578,215 (limit 580,000), on demand 41,338 (limit 70,000).

Known gaps: the event page's Category line is plain text (a test pins `<dd>😂 Comedy</dd>`), so a black 🎵 is dim on dark there; the GET filter form still sends its empty fields in the URL (`source=&area=`...), as before.

## S8 round 1 fixes

Source: `docs/review/verification-2026-10-11/report.md` (fix list 1 to 11) and R1 to R4 in the plan. For items 1 to 6 the e2e was written first and run against the code it was about to fix (it failed the way the verifier's probe did) before the fix. No existing test was weakened or deleted: where an API changed (item 8) the same assertions moved to the new API, and where the old assertion described the behavior being removed (item 9's handwritten script) the replacement is stricter (blocked storage is now in the table).

| # | Commit | Test | What changed |
|---|---|---|---|
| 1 | 81754f6 | `e2e/map-lifecycle.spec.ts` "a stalled map chunk" (holds the real MapLibre chunk, advances the clock 21 s, then releases it) | `MapSlot` owns one 20 s deadline from the moment the map is asked for; what is left goes to the map's own timer; a retired attempt's late answer is ignored. Notice, whole list and Try again appear. |
| 2 | 254a83a | `e2e/map-lifecycle.spec.ts` "failures after startup": a style whose source 404s after setStyle; WebGL context loss with 12 rows, not 10 | Only errors before the first load are fatal; a replacement style that errors before it settles is undone (previous basemap back, no notice); a lost context fails the map; failure clears the viewport so the fallback list is all 12 and the heading says "12 events". |
| 3 | b3788fb | `e2e/map.spec.ts` "the Filters popover shows the restored URL..." (Music, Comedy, Back, Forward, Clear all, edit across a pan) | The popover's draft starts over from `filters.category` and `filters.area` when they move; it keeps an edit while they do not. |
| 4 | e883d5f | `e2e/phone.spec.ts` "full detent, light/dark" (elementFromPoint at the middle and lower part of Tonight, Filters and the slider; heading equals half's) | R4: `sheetFullInset` 72 to 104 so full stops below the filter row (hit areas end at 96); camera and viewport padding at full is half's, so the list is not emptied. DESIGN.md says both. |
| 5 | 32c153c | `e2e/phone.spec.ts` "a real location denial..." (real denied callback, pills not scrolled) | The denial path scrolls the pill into view, the popover opens inside 390 px and takes focus on Area; Escape returns focus to the pill. |
| 6 | 2d305e9 | `e2e/phone.spec.ts` "sheet controls, Group by and the Filters popover fields..." | 2 px primary ring at 2 px offset on Expand, Collapse, the handle, Group by, Type input and trigger, Area, Apply, Clear all; 44 px targets (Group by and handle hit areas, labels, Clear all); Type and Area 36 px; the chevron is part of the field. |
| 7 | 060645d, 13d30c0 | `test/mapSource.test.ts` (all of `src/web`: no string-to-DOM setters, no `!important`, the React escape hatch only in `ui/rawBlock.tsx`) | R3: one `RawBlock` helper for the boot script, toggle script, token CSS and JSON-LD. The listing's theme button holds the same three Lucide icons as the map's and its script toggles `hidden`, so `theme.ts` has no `innerHTML` and no icon strings. `map/styles.ts` is replaced by `map/css/` (one file per surface, generated CSS identical modulo whitespace). |
| 8 | 3d52442 | `test/mapSelection.test.ts` (no venue/event pair in `MapFilters` or components; R1 policy), `test/mapFilters.test.ts` (same assertions on the new API) | R1 kept (known venue, unknown event keeps the venue). The URL's `venue` and `event` are resolved once in `MapApp` into a `Selection`; `MapFilters` has neither; components take a `Selection`, links a `MapState`; `url.ts` writes the union back as the pair; `EventRow` takes a `RowContext` (`type`, `day`, `venue`). AGENTS.md states this contract. |
| 9 | d8f01b0 | `test/theme.test.ts` (served script equals the protocol for stored x OS x blocked storage; only `utils/theme.ts` touches the preference) | The admin shell has a marker; `admin/themeBoot.ts` replaces it when the page is served with `bootScript("class")`. It still runs before the bundles (the e2e that blocks every `.js` still passes). |
| 10 | 3428deb | `e2e/map.spec.ts` (region, description, reading order), `e2e/phone.spec.ts` (detent communicated, hidden row reveals the sheet, last row reachable at half) | `role=region`; `aria-describedby` with time, price and venue (title stays the name); marker DOM order is reading order (on screen first), never moved while focused or pointed at; the handle has `aria-expanded` and a described detent; focusing a hidden row opens half and scrolls it into view. Also fixed: the sheet's scroll area was as tall as full, so at half its last rows could not be scrolled into view. |
| 11 | 06ffb8f | `test/mapTokens.test.ts`, `test/sitePages.test.ts`, `e2e/listing.spec.ts`, `e2e/map.spec.ts` | Tabular listing times; music and film Category on the event page on the light face (other categories keep the plain text a test pins); `:where()` anchor reset so `.link` is primary; venue-group headings at the title token; image attributes from `LAYOUT.image`, pinned to DESIGN.md; the 700 brand weight named as the one exception. |

Bundle (gzip, Bun 1.4.3): entry 103,386, first load 547,869 (limit 580,000), phone first load 579,361 (limit 580,000, 639 B headroom), on demand 41,422 (limit 70,000).

Counts: `bun run check` 328 tests pass; `bun run e2e` 75 pass (the screenshot specs skip without `SHOTS`). A heavily loaded machine made some map specs exceed 60 s once; they passed on a rerun and the cause was the marker reorder fixed in item 10 (it had moved an off-screen marker to the front, which `.first()` in those specs then tried to hover), not load.

Not done, and why: the screen-reader pass the verifier asked for in item 10 needs a real screen reader; what is covered is the accessible name and description, region role, focus order and the detent text, all asserted in the browser.

## S8 round 2 fixes

Source: `docs/review/verification-2026-10-11/report-round-2.md`, fix list 1 to 3. `e2e/round2.spec.ts` was written first and run against the unfixed code: all nine cases failed with the verifier's numbers (a press at the top edge of Tonight hit the map canvas; Expand, Collapse and the popover fields computed `touch-action: auto`; the denied preview popup was x=176..432 on a 390 px screen). All pass now.

| # | Test | Cause and fix (CSS first) |
|---|---|---|
| 1 | "every filter pill and the slider receive presses along their whole 44 px target", 390x844, light and dark, peek, half and full: `elementFromPoint` at the top edge, bottom edge and two corners of each pill's 44 px target, the slider's control edges, a real click at the slider's bottom edge (value changes, detent unchanged) and real clicks at the bottom edge of Free and the top edge of Filters | The row scrolls sideways, so `overflow-x: auto` clipped the 44 px targets to the 36 px row. The row now has vertical padding of 5 px (4 plus the border) and its top moves up by the same amount (`css/phone.ts`). The handle's hit area started 12 px above the sheet and covered the slider's lower target at full; it now runs from the sheet's top edge down, still 44 px. |
| 2 | "Expand, Collapse and the popover fields opt out of the double-tap delay, and the named links are 44 px targets": computed `touch-action` on Expand, Collapse, Type input and trigger, Area, and every link and button on the plain event page; effective height of the venue disclosure, All events, Details and Back to listing | `.detents button` (`all: unset`) and the popover controls were missing from the touch-action list. The venue disclosure was lowered to 36 px, `.back` and `.link` had no minimum: `.link` and `.back` are now 44 px tall, and the 36 px override on `.venue .trigger` is gone. |
| 3 | "denied preview" light and dark: `?state=denied` at 390x844 with no manual scrolling, popup and its Type, Area and Apply inside the viewport, focus on Area, Escape returns focus to the pill | The preview opened the popover directly. It now takes the real refusal's path (`openFiltersForDenial`, after the filter row has rendered). That exposed a second cause: the non-modal Drawer took initial focus when it mounted and stole it from Area, so `drawer.tsx` sets `initialFocus={false}` (a sheet that never traps focus should not grab it either). |

Bundle (gzip, Bun 1.4.3): entry 103,405, first load 547,886 (limit 580,000), phone first load 579,386 (limit 580,000, 614 B headroom), on demand 41,421 (limit 70,000). All three fixes are CSS or two lines of logic; the phone line moved by 25 B.

`bun run check`: 328 tests pass. `bun run e2e`: 84 pass.
