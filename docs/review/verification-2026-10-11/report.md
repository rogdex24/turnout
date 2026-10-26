# Independent S8 verification, 2026-10-11

**FAIL: 7 failed rows and 6 partial rows (34 pass) across 47 decision, acceptance and mandatory-brief checks.**

Counts below include overlapping requirements; they are not a count of unique bugs. All 42 D/S IDs are present. The five QC rows cover the remaining mandatory checks. The original-review resolution tables are cross-references and are not counted again.

Reviewed HEAD `fb18907010d8f185f071a559dc2283ea467eb2bb` in `/Users/example/orca/workspaces/hydsocial/map-react`. The initial tracked and untracked working tree was clean. I read the verification brief and its five inputs in the requested order, then checked source, installed packages, tests, browser behavior and screenshots independently. Progress-note statements alone are not evidence.

## Fresh command results

| Command | Result |
|---|---|
| `bun install` | Exit 0; Bun 1.3.14; checked 551 installs across 556 packages, **no changes**. An earlier `bun install --frozen-lockfile` also made no changes. |
| `bun run check` | Exit 0: four TypeScript projects passed; design lint **0 errors, 0 warnings**; **320 pass, 0 fail, 1,928 assertions, 38 test files**; dependency-cruiser **0 violations, 182 modules, 586 dependencies**. Repeated with the same passing summary to retain the complete final counts after the first tool output was truncated. |
| `bun run e2e --output=/tmp/hydsocial-verifier-playwright --reporter=line` | Exit 0; **61 passed, 86 skipped**, 1.3 minutes. The skipped cases are opt-in screenshots, not deferred functionality. No `test.fixme` or `test.failing` remains in `e2e/` or `test/`. |
| `bun run test test/mapBundle.test.ts` | Exit 0; **4 pass, 0 fail, 9 assertions**; Bun **1.4.3**. |
| `SHOTS=docs/review/verification-2026-10-11 SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts --output=/tmp/hydsocial-verifier-shots --reporter=line` | Exit 0; **86 passed**, 3.7 minutes; real OpenFreeMap basemap. All 86 screenshots were produced by this verification run and inspected. |
| Independent inline Playwright probes | Confirmed stale popover after Back, clipped denial popup, full-detent overlap, missing keyboard focus rings, undersized targets, missing chunk-load deadline and incorrect fallback after theme/source failure. Also checked no-JS navigation, touch cancellation, normal-page console output and four live-basemap size/theme combinations. Results below. |
| `git diff --check` and write-scope check | No tracked diff or whitespace errors. Only this report and PNG screenshots under the permitted directory are authored. No source, test, config, design, ingestion or data file in the repository was edited; no commit. Runtime fixture databases and Playwright output used OS temporary directories. |

The repository scripts resolve Bun 1.4.3, as AGENTS.md specifies. Bundle figures below use that binary, not the bare Bun 1.3.14. The final independent browser probes also used a fixture server started with the repository Bun first on PATH.

### Independently measured bundle

Built in memory with `buildMapAssets()` under Bun 1.4.3, compressing each asset with `node:zlib.gzipSync`. No output bundle was written.

| Part | Raw bytes | Gzip bytes | Limit |
|---|---:|---:|---:|
| Entry `map.9s2y27f6.js` | 312,865 | 103,007 | 400,000 |
| MapCanvas/MapLibre chunk | 1,057,232 | 294,079 | Included below |
| CSS | 16,956 | 3,768 | Included below |
| Worker | 508,314 | 146,240 | Included below |
| Desktop first load | | **547,094** | 580,000 |
| Phone additional chunks | | 31,121 | Included below |
| Phone first load | | **578,215** | 580,000 |
| Remaining on-demand chunks | | **41,338** | 70,000 |
| All assets | | 619,553 | No current all-assets limit |

The reported S7 numbers reproduce exactly. The phone line has only **1,785 bytes** headroom. These are separately gzipped build assets, not observed compressed HTTP transfer sizes; fonts, boot HTML/JSON and basemap resources are outside this JS/CSS/worker budget. `assetResponse` itself does not set Content-Encoding (`src/web/map/assets.ts:110`).

## Decisions and acceptance criteria

PASS means the stated behavior has direct source or runtime evidence. PARTIAL means some specified behavior or structure is absent even where the deviation has a recorded justification. FAIL means the required behavior is contradicted. A documented deviation is not silently rewritten into a passing literal criterion.

| ID | Status | Evidence |
|---|---|---|
| D1 | PASS | Installed React/react-dom **19.3.0**; `src/web/map/server.tsx:41` renders MapRoot through react-dom/server; `client.tsx:8` hydrates the same boot props; `MapRoot.tsx:10` supplies the same serverSearch. E2E “the page hydrates without console errors or warnings, and the list then narrows to the viewport” passed. No application framework/router was added. |
| D2 | PASS | `package.json:25` shadcn **4.21.4**, `src/web/ui/components.json:3` **base-nova**, root `components.json:3` **radix-nova**. Public Accordion, Drawer, Popover, Combobox and Slider import Base UI and carry registry source headers. |
| D3 | PASS | `src/web/ui/map.tsx:1` records mapcn registry URL, MIT attribution, commit `d160bd7`, fetch date and hash prefix; MapCanvas uses its Map/MapMarker/MarkerContent (`MapCanvas.tsx:4`, `:104`). OpenFreeMap repaint is used. Custom DOM cluster adaptation is documented and justified below; no fallback wrapper was needed. |
| D4 | PASS | One `filterParsers` descriptor, createLoader/createSerializer at `model/url.ts:14`, `:26`; plain React adapter at `MapRoot.tsx:10`; useQueryStates at `MapApp.tsx:48`, push on committed changes at `:91`. E2E Back/Forward and draft-search tests passed. Legacy codec search returned no hits. |
| D5 | PASS | `model/state.ts:7` location union and `:13` session; `MapApp.tsx:50` is the session reducer. Radius exists in the on branch. Section, location and detent tests passed; no Redux, Zustand or query cache. Local presentation states remain local components. |
| D6 | PARTIAL | Selection union exists at `model/selection.ts:4`. However normalized downstream filters still have independent nullable venue/event (`model/filters.ts:15`), resolveFilters projects the union back into them (`url.ts:40`), and MapApp normalizes again against filtered data (`MapApp.tsx:71`). “Normalized once” is not the actual contract. Unknown-event policy also differs from S1.3. Fix 8. |
| D7 | PARTIAL | Generated shadcn roles/Tailwind mapping are present (`tokens.ts:35`, `src/web/ui/styles.css:17`); public and admin controls call `utils/theme.ts`. A handwritten second preference reader remains in `src/admin/ui/index.html:12`. Its pre-paint justification is real, but it diverges when storage throws; `test/theme.test.ts:119` intentionally pins the difference. Fix 9. |
| D8 | PARTIAL | Inter **5.3.0**, Latin plus small rupee subset, font-display swap and immutable cache at `src/web/fonts.ts:12`, `:29`, `:37`. Map times/prices/distances are tabular and relevant E2E passed. Listing times are not: independent computed-style probe on “Sun, 11 Oct at 3:30 PM” returned `fontVariantNumeric: normal` (`site/styles.ts:36`, `Listing.tsx:75`). Fix 11. |
| D9 | PASS | Installed/pinned Playwright **1.64.0**; `e2e/run.ts:7` reserves free ports, `e2e/server.ts:43` seeds SQLite, config uses headless Chromium. 61 interaction tests passed independently. |
| D10 | PASS | `src/web/ui/components/drawer.tsx:13` forces non-modal, downward swipe and no pointer dismissal; `MobileSheet.tsx:25` sets three pixel snap points and controlled open state. Phone drag, map pan and disabled-end controls tests passed. Independent CDP touchCancel cleared swiping and subsequent Expand reached full. Focus/chrome deficiencies are separately failed under S6.1/S6.4. |
| D11 | PASS | Snapshot embedded at `server.tsx:40`, `:62`, read at `client.tsx:8`. E2E “the client does not refetch /api/map on load: the boot snapshot is the data” passed. |
| S1.1 | PASS | Map query boundary calls publicSourceUrl (`queries.ts:98`); expanded row conditionally renders accepted source action (`EventRow.tsx:96`). “the map page and /api/map refuse unsafe source URLs too” (`test/site.test.ts:1152`) passed for stored javascript URL. |
| S1.2 | PASS | `site/Listing.tsx:31`, `:58` uses nextSevenDaysIst. “the listing's Next 7 days link runs from today through today + 6 in IST” (`test/site.test.ts:1168`) passed with UTC-to-IST day rollover. |
| S1.3 | FAIL | Plan says an unknown event drops selection to none. `model/selection.ts:18` instead keeps a known venue. `test/mapSelection.test.ts` explicitly expects normalizeSelection(features, “v1”, “nope”) to return venue v1. The green test encodes the deviation rather than satisfying this criterion. Mismatched real events do resolve to their real host. Fix 8. |
| S1.4 | PASS | Existing group array receives `group.push(item)` at `model/group.ts:29`; no per-event copied accumulation array. Group ordering and grouping tests in `test/mapFilters.test.ts` passed. |
| S1.5 | PASS | Pinned fixture harness and all listed interaction scenarios are implemented and passed (`e2e/map.spec.ts:15`, `:38`, `:46`, `:68`, `:126`, `:138`). Failed initial API fetch was appropriately replaced with the stronger D11 no-refetch check. No fixme remains. Existing failure coverage is insufficient for the additional S5.6 cases below. |
| S2.1 | PASS | DESIGN.md contains Inter, shadow layers/alphas, concentric radii, fast/base UI motion, hit-area 44, control 36, responsive chrome/empty states and measured budget rationale (Typography, Layout, Elevation & Depth, Bundle budget). Lint rerun returned 0 errors/0 warnings. Camera's separately documented 400 ms duration is addressed under deviations. |
| S2.2 | PASS | `tokens.ts` maps semantic roles in light/dark; `ui/styles.css:17` consumes them through @theme inline. “no hex color literal … outside the generated block” covers map, public UI/components and site, and passed (`test/mapTokens.test.ts`). |
| S2.3 | PASS | `fonts.ts:37` returns one-year immutable cache headers; hashed Latin and rupee files are served locally. Unit font route/cache tests and E2E “/map text is Inter from our own origin, with no font CDN request” passed. |
| S2.4 | PARTIAL | Shared function, brand geometry and DESIGN colors are used; theme/favicon E2E passed, including pre-paint dark with script bundles blocked. Duplicate handwritten theme boot remains (`admin/ui/index.html:12`) and storage-blocked output differs. Literal duplicate-deletion requirement is unmet. Fix 9. |
| S3.1 | PASS | SSR tree and boot at `server.tsx:40`; all mapPage no-JS tests passed. Independent real JS-disabled browser: 12 event links, hidden Near me/theme, native search GET retained `group=day`, native event link opened `#ex-e1`. |
| S3.2 | PASS | hydrateRoot at `client.tsx:9`; hydration/viewport E2E passed without errors or mismatch warnings. No innerHTML/string-to-DOM path exists under map or public UI. This does not satisfy the brief's wider src/web deletion check, QC1. |
| S3.3 | PARTIAL | Accordion multiple/open keys at `ResultsPanel.tsx:71` and reducer collapse state; pan/collapse test passed. Image failure/poster state is owned by `EventImage.tsx:14`. **Group by uses plain links, not shadcn Toggle Group** (`ResultsPanel.tsx:16`). The recorded budget/native-link reason holds, but the literal component requirement was changed. Explained deviation; no request to restore unnecessary Toggle Group. Remaining target deficiency goes to Fix 6. |
| S3.4 | PASS | Activated row focus request at `EventRow.tsx:65`, region linkage at `:69`, `:89`; MapApp focus routing at `:147`. Close and All events focus-return E2E passed. Row metadata is still missing an accessible description, addressed in original-review gap A4/Fix 10. |
| S3.5 | PASS | Normal operation distinguishes all-match count (`MapApp.tsx:260`) from viewport ranking/count (`:74`, `ResultsPanel.tsx:69`), using unprojected padded bounds (`MapCanvas.tsx:221`). One viewport announcement is delayed 400 ms (`MapApp.tsx:173`). Hydration, empty-area and unplaced count tests passed. Failed-map stale bounds are a S5.6 failure, not proof of normal count semantics failing. |
| S4.1 | PASS | Shared nuqs loader/descriptor at `url.ts:14`; free aliases parse and only 1 is emitted. Round-trip/aliases tests passed. Searches found no parseFilters, toQuery or withEventVenue anywhere under src/web. |
| S4.2 | FAIL | Main search draft, popover Escape/outside/focus-return, emoji options and main-pill geometry tests passed. **Back restores category=music while the retained popover still says Comedy**: independent probe and [screenshot](probe-popover-history.png); category/area state initializes only once (`FiltersPopover.tsx:23`). Denial popup is off-screen on phone: left 176, right 432 versus viewport 390 ([screenshot](probe-location-denied.png)). Popover fields also miss uniform geometry: Type 36 px with no expanded target, Area 40 px. Presets are documented native-link substitutions. Fixes 3, 5, 6. |
| S4.3 | PASS | Location union/requesting status at `state.ts:7`, `MapApp.tsx:124`; request disabled/busy state tested. Slider min 1/max 25/default 4 via LAYOUT; `FilterBar.tsx:79` updates label immediately and coalesces radius changes through RAF; commit fits camera. Drag/pending/ring tests passed. |
| S4.4 | PASS | All committed link/form/marker changes use go and nuqs push (`MapApp.tsx:89`, `nav.tsx:27`, `FilterBar.tsx:52`, `MapApp.tsx:194`). History goes through nuqs's state owner; camera and sheet derive from resulting filters in the same effect (`MapApp.tsx:95`). Back/Forward test passed. The stale popover is component-local draft reconciliation, not a separate history writer. |
| S5.1 | FAIL | Latest-request guard and failed style-JSON fetch retention tests passed (`ui/map.tsx:131`). A valid replacement style whose source returns 404 fails after setStyle: `ui/map.tsx:110` mistakes loaded() false for initial startup, signals failed, and removes the old map. Independent probe found mapPresent=0 and failure notice. [Evidence](probe-theme-source-failure.png). Fix 2. |
| S5.2 | PASS | Venue keys are venue IDs and cluster keys contain revision (`MapCanvas.tsx:207`, `:307`). Accessible marker title/category/count at `Markers.tsx:24`. E2E “a pin names its next event and changes in place…” passed; stale label bug resolved. |
| S5.3 | PASS | Declutter reads tile/label boxes, decides visibility, then writes data-hidden in a separate final loop (`MapCanvas.tsx:268`); settled movement/source/label changes invalidate it. Overlap/hover E2E passed. No inline visibility or !important remains in this path. No claim about production frame-rate profiling. |
| S5.4 | PASS | RadiusRing derives location at `MapCanvas.tsx:125`; LocationDot exists only for on at `:313`. Radius/live-dot/off-clearing E2E passed. |
| S5.5 | PASS | Non-modal controlled snap points, keyboard alternatives, safe-area padding and settled detent padding at `MobileSheet.tsx:25`, `styles.ts:256`, `MapApp.tsx:183`, `:188`. Phone gesture/pan/selection tests passed; independent cancellation probe passed. Full-detent chrome overlap and keyboard styling are separately failed. |
| S5.6 | FAIL | Existing basemap-fetch failure, timeout-after-MapCanvas-mount, retry and approximate click/reload tests passed. **Chunk import is outside the startup timer** (`MapSlot.tsx:15`, `ui/map.tsx:100`): holding MapCanvas chunk and advancing 25 seconds gave notice=0, mapPresent=0, html class=js-map ([screenshot](probe-chunk-timeout.png)). **Failure after a viewport exists preserves that subset**, not all events: 10 rows versus 12 total with “list … has every event” (`MapApp.tsx:74`, `:120`; [screenshot](probe-theme-source-failure.png)). Fixes 1, 2. |
| S6.1 | FAIL | Idle chrome/row anatomy tests passed at both sizes and themes; own screenshots confirm major polish improvement. At phone full detent, pills occupy y=56..92 but sheet starts y=72. After scrolling Filters into view, its center/lower portion hits sheet detent controls, not Filters. [Evidence](probe-full-filters.png), `styles.ts:218`, `layout.ts:17`. This defeats DESIGN's “stays reachable at every detent”. Fix 4. |
| S6.2 | PASS | Existing map-v2/after has 74 map-state files, with six before/after differences in progress lines 153 onward. Own run produced **86** map/site state screenshots; matrix/state list below. Inspected all through in-memory contact sheets and individual defect screenshots. Defects are reported, not treated as screenshot-generation failures. |
| S6.3 | PASS | Four independent bundle tests passed and numerical measurement reproduced S7 totals. phone=578,215 <580,000; desktop=547,094; on-demand=41,338. Map-bundle exclusion tests and actual network checks on listing/detail passed. |
| S6.4 | FAIL | No transition-all source hits; reduced motion, tabular map numbers and main chrome focus tests passed. Those tests miss phone controls and popover input. Keyboard-focused Expand has outline-style none; Type input has :focus-visible=true but outline-style none. Group by links are 26 px high with no hit-area pseudo-element; input target is 36 px. `styles.ts:73`, `:234`, `ui/combobox.tsx:18`. [Focus screenshot](probe-sheet-keyboard-focus.png). Fix 6. |
| S7.1 | PASS | `site/Document.tsx:38` renderToStaticMarkup; Listing/Detail/Header use shared tokens/chrome and self-hosted Inter. Actual listing/category/area/venue/detail loads and E2E checks show no map JS; only theme boot/toggle and event JSON-LD scripts. Rendering raw static script/style blocks is separately counted against QC1's literal ban. |
| S7.2 | PASS | All site.test.ts tests passed (feeds, JSON-LD, filters, source policy, sitemap). `pages.tsx:210` composes JSX and routes; legacy page/card/form string-template functions are absent. “the string templates are gone” (`test/sitePages.test.ts:89`) passed. |
| S7.3 | PASS | Shared category/area/free translation at `viewLinks.ts:20`; filters round-trip E2E and sitePages unit tests passed; live map List link changes with committed filters. |
| QC1: deleted code | FAIL | No !important under src/web; legacy map render.ts/page.ts/client/map.ts/icons.ts and old URL codec are gone. But `web/theme.ts:29` still assigns innerHTML; `site/ThemeToggle.tsx:10` and `site/Document.tsx:23`, `:24`, `:26`, `:31` use dangerouslySetInnerHTML. `map/styles.ts:51` still contains panel CSS through line 267. Duplicate admin boot remains. The narrower mapSource test does not cover all src/web. Fixes 7, 9. |
| QC2: library choices | PASS | Manifest exact pins and installed package JSON agree for all migration choices; versions and copy provenance listed below. No Vaul/react-map-gl introduced. Unrelated pre-existing TypeScript/cn caret ranges are outside the migration-library check. |
| QC3: dependency rule | PASS | Fresh dependency-cruiser found no violations (182 modules/586 edges). web-ui leaf rule at `.dependency-cruiser.json:80`. Git comparison with plan commit showed no ingestion edits; admin edits are theme/favicon files permitted by S2.4. |
| QC4: AGENTS accuracy | PARTIAL | Folder/SSR/library/command descriptions at `AGENTS.md:31` correctly describe actual layout. Claim that selection resolves once (`:33`) conflicts with `url.ts:41` and `MapApp.tsx:71`. “One theme protocol” also omits the handwritten pre-paint copy. Fixes 8, 9; update documentation with the final actual contract. |
| QC5: page console errors | PASS | Existing hydration/listing/detail E2E console checks passed. Independent valid /, /c/music, /c/comedy, /in/other, /v/near-hall, /e/e1 and normal map/selected/group/preview routes had no application console/page errors. Live OpenFreeMap idle probes at both sizes in both themes returned errors=[]. An exploratory invalid /a/gachibowli and empty fixture area paths returned expected 404 resource messages; they are not valid-page failures. Forced network-failure probes intentionally produce diagnostic errors. |

## Independent reproductions and screenshot inspection

All paths in this section are relative to this report's directory.

1. **Popover history:** load /map; Apply Music; Apply Comedy; Back; reopen Filters. URL is `/map?category=music`, panel shows four music events, input says **Comedy**. Clicking Apply now reapplies the stale value. [probe-popover-history.png](probe-popover-history.png).
2. **Chunk deadline:** intercept `/assets/chunk.z2191xyf.js` without answering, install Playwright clock, load /map and advance 25,000 ms. Boot list has 12 rows but no map, no notice, no retry and js-map remains. [probe-chunk-timeout.png](probe-chunk-timeout.png). The earlier exploratory probe targeted the wrong build's hash and was discarded; this screenshot/output uses Bun 1.4.3 and the matching MapCanvas chunk.
3. **Theme/source failure:** start with a successful light blank basemap and an established viewport, then make dark's style JSON valid but its GeoJSON source return 404. Result: old map unmounted, “list … has every event”, **10 events in view**, **12 events · 7 venues**. [probe-theme-source-failure.png](probe-theme-source-failure.png). Existing lifecycle tests abort the style-JSON fetch, so they do not cover failure after setStyle. MapLibre documents that [loaded() becomes false while changed sources/style are still loading](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#loaded); it is not an “initial startup” flag.
4. **Phone full:** 390x844, Expand twice, scroll filter row to show Filters. Sheet top 72; Filters top 56/height 36. elementFromPoint at the button center returns the detent area, lower-half point returns Collapse. [probe-full-filters.png](probe-full-filters.png), [sheet-full-phone-light.png](sheet-full-phone-light.png), [sheet-full-phone-dark.png](sheet-full-phone-dark.png).
5. **Real location denial:** replace getCurrentPosition with a denied callback, load a phone map, press Near me without first scrolling the pills. Popup left **176**, right **432**, width **256**, viewport **390**. Its controls run beyond the right edge. [probe-location-denied.png](probe-location-denied.png). The same clipping appears in the live matrix's denied phone light/dark screenshots.
6. **Keyboard/targets:** keyboard return to Expand yields outline-style **none**, offset **0px**; Type input is focus-visible but outline-style **none**. Group by Type/Day/Venue heights are **26px**, pseudo-element content **none**; popover Type input **36px**, Area **40px**. [probe-sheet-keyboard-focus.png](probe-sheet-keyboard-focus.png). The existing “every control” tests only cover their selected desktop/main-chrome scope.
7. **Successful boundaries:** JS-disabled search kept `group=day` and event link opened its region; Near me/theme were actually invisible. CDP touchCancel left zero data-swiping nodes and a subsequent Expand reached full. Normal and live-basemap console checks were clean.
8. **Other visual defects:** full-detent idle expansion replaces the useful results list with “No events in this area / 12 events match elsewhere” because the sheet shrinks the computed viewport to a top strip. This follows the current unobscured-viewport rule, but defeats the research's full-sheet reading intent; Fix 4 calls for reconciling those requirements explicitly. The event page's black music emoji is dim in dark mode ([event-page-phone-dark.png](event-page-phone-dark.png)); the popover chevron still appears as a browser-default grey square. Thumbnail dimensions and venue-group heading size also retain the original geometry inconsistencies described below.

### Screenshot matrix actually taken

**86 matrix PNGs plus 6 independent defect PNGs: 92 total.** The matrix uses fixture events, two fixture SVG covers and a fixture organiser, but real basemap styles/tiles. Each `<state>-desktop-<theme>.png` is 1280x800; each phone file is 390x844, except listing/event plain-page screenshots use fullPage and can be taller.

- Both sizes, both themes: idle, cluster, venue, approximate, event-cover, event-poster, event-organiser, event-plain, group-day, group-venue, loading, empty, error, denied, filters-open, near-me, listing, listing-filtered, event-page.
- Desktop, both themes: hover and focus.
- Phone, both themes: sheet-peek, sheet-half and sheet-full.
- Six probes: popover-history, chunk-timeout, theme-source-failure, full-filters, sheet-keyboard-focus and location-denied.

Representative starting points: [idle-desktop-light.png](idle-desktop-light.png), [idle-desktop-dark.png](idle-desktop-dark.png), [idle-phone-light.png](idle-phone-light.png), [idle-phone-dark.png](idle-phone-dark.png), [filters-open-phone-dark.png](filters-open-phone-dark.png), [near-me-desktop-light.png](near-me-desktop-light.png), [listing-desktop-light.png](listing-desktop-light.png), [event-page-phone-dark.png](event-page-phone-dark.png).

The desktop denied preview's transient toast can expire before the harness's “map ready + 3.5s” capture; the phone captures and immediate real-denial probe do show it. A late screenshot alone is not evidence that denial feedback never existed. Loading/error previews are preview render paths, not substitutes for the actual injected-failure probes.

## Library pins and provenance

| Choice | Manifest and installed version | Direct evidence |
|---|---|---|
| React / react-dom | 19.3.0 / 19.3.0 | package.json:39/40 and installed package JSON; actual SSR/hydration passed |
| shadcn | 4.21.4 | package.json:25; own public base-nova config, admin radix-nova config |
| Base UI | @base-ui/react 1.9.0 | package.json:29; public copied component imports/headers |
| nuqs | 2.10.2 | package.json:37; shared server parsers and plain React adapter |
| MapLibre | 6.13.0 | package.json:36; installed package JSON and actual browser map |
| mapcn | Owned source, not an npm dependency | ui/map.tsx:1 records registry URL, d160bd7, MIT/date/hash prefix, retained pieces and adaptations |
| Inter | @fontsource-variable/inter 5.3.0 | package.json:30; local hashed font routes; font/cache/runtime tests |
| Playwright | @playwright/test 1.64.0 | package.json:20; fixture Chromium suites ran |
| Tailwind | 4.3.3 | package.json:42; generated semantic-role variables consumed via @theme inline |

Copied shadcn files record base-nova URLs/date/hash prefixes; Drawer, Slider, Popover and Combobox are present and exercised. No claim that a fresh upstream registry today reproduces those historical hash prefixes: original registry JSON snapshots were not supplied. The criterion that source is **recorded** is satisfied.

## Deviations from the approved plan and research

| Deviation | Recorded reason and independent assessment | Research intent |
|---|---|---|
| Custom cluster DOM markers instead of mapcn ClusterLayer | ui/map.tsx:16 and progress S5 explain mapcn's circles cannot supply stacked tiles/caption. Actual source uses mapcn marker lifetimes with custom cluster content; screenshot cluster states and revision-key tests support it. Reason holds. | Met: branded clusters, component lifetime, no stale cluster identity. |
| Plain links for presets, Free and Group by instead of Toggle/Toggle Group | Progress:198 and DESIGN Bundle budget explain reducing eager composite/floating helpers and retaining native link semantics. Current graph/measurements reproduce the small phone headroom; links preserve no-JS/history/modified clicks and aria-current. Reason holds. | Mostly met; no need to restore costly toggle machinery. The **26px Group by targets** were not justified and must be fixed independently. S3.3 remains a literal partial. |
| Budget 320KB entry -> 400KB entry; 560KB total -> 580KB desktop/phone first load plus 70KB remaining lazy chunks | Measured React and Base UI cost, split demand loads, CSS trims and explicit phone-at-load accounting are documented in DESIGN/progress. Fresh numbers exactly match S7 and tests enforce all four lines. Reason holds. | Met as a deliberately revised asset budget. It does not establish mid-range Android/4G performance or actual transfer compression. |
| Phone filters moved under header; Near me moved to control column; phone floating count hidden | Progress S6 explains keeping filters reachable above sheet and avoiding duplicate counts. Dot/slider, locate semantics and unplaced heading tests pass. | Only partly met: full sheet still covers filters, denied popup's invisible anchor overflows. Recorded rationale is sound, implementation falls short. |
| React marker/filter shell and other later work pulled forward into S3 | Progress S3 explains eliminating every innerHTML path in the interactive map together. Actual deleted renderers and stable component identity support it. | Met; slice ordering variation did not retain two live interactive renderers. |
| SSR renderToString/renderToStaticMarkup instead of suggested readable stream | D1 requires react-dom/server in Bun, not a specific streaming API. Those APIs render matching boot markup and plain pages correctly. | Met; this is an API choice within D1, not a failed decision. |
| Area remains native select; Type input shows word while menu options show emoji + word | Progress S4/S6 follow-up records this. A native Area select was not prohibited by S4.2. Source and actual options agree. | Met for semantics/labels. Geometry and Type focus ring still fail. |
| Unknown event with known venue keeps venue | Progress S1:9 records policy but provides no reason for contradicting S1.3. | Unexplained contract change; fail, Fix 8. |
| Handwritten admin pre-paint theme reader | Progress S2 follow-up records preventing a light flash; module boot alone was too late. Blocking script bundles proved the benefit. A separate handwritten preference implementation is not necessary to that benefit, and blocked-storage semantics diverge. | Partly met; share generated protocol text rather than duplicating logic, Fix 9. |
| Three motion durations, including 400ms camera | DESIGN Elevation & Depth explicitly separates two UI durations from the camera's existing movement duration; reduced motion makes both CSS and camera paths instant. | Met for the specified fast/base UI motion and reduced-motion intent. |
| Raw static inline HTML in site shell/theme icons, retained map styles.ts | Document.tsx:10 explains raw fixed script/style/escaped-JSON-LD blocks, and site pages have no client framework bundle. This is different from old full-panel DOM rebuilds and has an understandable implementation purpose. No recorded deletion waiver for styles.ts panel CSS was found. | Interactive no-rebuild intent is met, but **the brief's explicit wider deletion gate is not**. QC1 cannot pass without removal or a formally revised gate. |
| Separate admin palette | DESIGN explicitly permits it; only theme preference and brand colors are shared. | Met; no need to move admin onto the public green palette. |
| Cross-view transfers only category/area/free | D/S7.3 and viewLinks.ts explicitly scope the shared contract; other filters belong to one surface. | Approved narrower requirement is met. Original finding 8's suggestion to tell users about unsupported filters is still not implemented. |

## Original Codex review: numbered findings

References here use the current source, not the old review's deleted paths.

### Section 1 findings

| Finding | Resolution | Evidence |
|---|---|---|
| 1: four URL transition paths | Largely resolved | go/nuqs + state-derived camera/sheet, MapApp.tsx:89/95; Back/Forward E2E passed. History-restored popover draft remains inconsistent (Fix 3). |
| 2: inconsistent count/geography meanings | Partly resolved | SSR “N events” vs live “N events in view”, all-match totals and settled live region are explicit; relevant E2E passed. Failed-map fallback still says all while retaining viewport subset (Fix 2); full sheet's viewport loses the list (Fix 4). |
| 3: DOM as second state store | Partly resolved | Component-local draft/image/poster state and reducer sheet/collapse replace DOM patches. No map innerHTML remains. Popover draft has no reconciliation with restored URL (Fix 3). |
| 4: forms drop grouping | Resolved | FilterBar.tsx:38 hidden Keep fields; both E2E submit and independent native no-JS GET retained day grouping. |
| 5: stale marker/cache identity | Resolved | VenueMarker receives current feature, venue-id key, cluster revision key; “a pin names its next event…” E2E passed. |
| 6: invalid selection combinations | Partly resolved | Union normalizes host and removes unknown selections, but downstream independent strings and repeated normalization remain; unknown-event+valid-venue changes S1.3 (Fix 8). |
| 7: approximate venue camera drift | Resolved | MapCanvas exact/focus/reveal/fit only use exact points (:153); approximate click/reload and exact non-vacuity E2E passed. |
| 8: listing/map filter context and seven-day meaning | Resolved for approved scope; broader suggestion outstanding | Shared filters transfer and seven-day test passed. Dates/source/max-price do not transfer and no UI notice says so; this is the expressly narrower S7.3 contract, rather than a newly invented verifier failure. |
| 9: inconsistent source URL policy | Resolved | Map/detail share publicSourceUrl; unsafe-source map/API/detail tests passed. |
| 10: visual/theme ownership | Partly resolved | Public site/map share tokens, fonts, chrome, Brand/ViewSwitch; admin palette exception is documented. Handwritten pre-paint duplicate and separate public theme icon implementation remain (Fixes 7/9). |

### Section 6 numbered performance findings

| Finding | Resolution | Evidence |
|---|---|---|
| 1: repeated panel reconstruction/filtering | Resolved at architecture level | MapApp.tsx:69/70 memoize matches/radius filtering; keyed React rows/sections replace full HTML rebuild. Viewport selection still makes two inBounds traversals (:74/75), a small remaining duplication, not the old lifecycle cost. No device-performance claim. |
| 2: unbounded slider input work | Resolved | FilterBar.tsx:79..91 RAF coalescing plus camera-on-commit; slider drag E2E passed. |
| 3: marker churn despite cache | Resolved | ui/map.tsx:166 stable MapMarker; key by venue and update coordinates/content; marker continuity test passed. |
| 4: interleaved/cubic declutter | Resolved | MapCanvas.tsx:270..286 batches reads/decisions/writes and avoids repeated owner scans. Actual overlap/hover test passed. It remains pairwise collision work; no profiling claim. |
| 5: copied group arrays | Resolved | group.ts:29 appends in place; ordering/group tests passed. |
| 6: worker excluded from budget | Resolved | assets.ts:105 and mapBundle tests include worker/CSS/eager graph and phone extras. Fresh byte table above. HTTP compressed variants not verified. |
| 7: initial data fetched twice | Resolved | Boot JSON + hydrate, no initial /api/map request E2E passed. |
| 8: permanent loading/failure | Partly resolved | Basemap startup timeout/retry works; stalled dynamic import lacks a deadline, theme source error removes map, and fallback loses non-viewport events (Fixes 1/2). |

### Top-10 change recommendations

| Rank | Resolution | Evidence |
|---|---|---|
| 1: one normalized selection/transition owner | Partial | MapApp go/nuqs passes history tests; D6/S1.3 and local draft reconciliation remain, Fixes 3/8. |
| 2: shared SSR panel/rows/images and persistent filters | Mostly resolved | Matching SSR/hydration, native no-JS, keyed rows and image state; filter persistence now needs navigation reconciliation, Fix 3. |
| 3: retained usable list with bounded startup | Partial | Initial basemap failure tests passed; import deadline and complete late fallback fail, Fixes 1/2. |
| 4: stable marker identity/invalidation | Resolved | Venue-id/revision keys and unchanged-pin label update E2E. |
| 5: complete non-modal sheet/popup contract | Partial | Drag/cancel/pan/detents/dismissal work. Full-detent overlap, denied popup placement, focus styling fail, Fixes 4/5/6. |
| 6: coherent geography/count/empty states | Partial | Correct normal count distinction and exact-only camera; late failure and full-sheet list loss remain, Fixes 2/4. |
| 7: typography/header/target tokens | Partial | Major screenshot and anatomy improvements; small Group by/field targets, venue heading token and fixed image sizes remain, Fixes 6/11. |
| 8: native forms and shared public contracts | Resolved for migration scope | Group retained with/without JS; shared view filters, source policy, seven-day link tests passed. Unsupported cross-view filters remain deliberately outside S7.3. |
| 9: batch derived rendering/declutter/group append | Resolved structurally | Memoized filtering, RAF, batched boxes/writes, in-place append; tests passed. Production profiling remains unverified. |
| 10: browser regressions and whole bundle budget | Substantially resolved, coverage gaps found | 61 green interaction tests, 86 independent screenshots, worker/phone-inclusive budget. New failure/focus/history probes identify missing regression coverage (Fixes 1..6). |

### Other original accessibility, styling and component-contract observations

| Original observation | Current resolution/evidence |
|---|---|
| A1: marker ordering and stable native-button identity | Identity/native buttons fixed; marker names present and clicked-marker focus policy documented. Ordering still follows querySourceFeatures, not ranked list order (MapCanvas.tsx:203). No intentional ordering test; Fix 10. |
| A2: marker name lacks category | Resolved, Markers.tsx:24 and marker-name E2E. |
| A3: unexplained role=application | Unresolved: MapSlot.tsx:19 still uses it with no help/application keyboard contract. Use a labelled region or establish/test the required screen-reader behavior, Fix 10. |
| A4: event accessible name hides metadata / lacks region relation | Region/focus fixed and tested; closed row still aria-label=title and no aria-describedby for time/price/venue (EventRow.tsx:70). Fix 10. |
| A5: sheet controls communicate little / focus below peek | End disabled and aria-controls now present. No detent description; keyboard focus can reach content beyond peek without expanding, and Expand/Collapse have no focus ring. Fixes 6/10. |
| A6: sheet pointer cancellation | Resolved: Base UI owns gesture lifecycle; independent real touchCancel followed by Expand succeeded with swiping=0. |
| A7: venue link inside disclosure | Resolved: separate venue name link and Accordion trigger (ResultsSection.tsx:44/47). |
| A8: popup dismissal/drafts/focus policy | Escape/outside/focus-return E2E passes. History drafts and denied phone positioning remain, Fixes 3/5. |
| A9: range target/value text; Near me pending/pressed | Main range/near semantics and pending tests passed. Input and group targets outside this range check remain, Fix 6. |
| A10: viewport live-region announcement | Resolved in normal operation, MapApp.tsx:173/264; hydration/count E2E. |
| A11: inert Near me with JS unavailable | Resolved by conditional controls and hidden rules; independent no-JS check found both Near me/theme invisible. |
| Type/day heading token | Resolved: styles.ts:69 uses title font; screenshot anatomy checks passed. Venue grouping still uses control font at styles.ts:60, Fix 11. |
| Brand shrunk/overlapping; fourth weight | Mark is now 28px and header wraps; four-size/theme chrome checks passed. 700 brand weight is still specified alongside a three-weight prohibition in DESIGN; clarify the exception, Fix 11. |
| Fixed thumbnail/cover attributes vs token size | Unresolved: EventImage.tsx:29 still fixes 56 and 400x225 independently of tokens; current screenshots look correct at current token values, but original drift risk remains, Fix 11. |
| Clear-search layout and focus | Persistent SearchBox and declared 44px clear control (FilterBar.tsx:46, styles.ts:37); draft and grouping behavior passed. |
| !important / inline declutter / skeleton layout hacks | Interactive map overrides are gone; declarative Skeleton and data-hidden replace DOM styles. Explicit global prohibition still fails elsewhere under src/web (QC1). |
| Semantic link colors overridden by anchor reset | Still present: map-page a at styles.ts:19 and site a at site/styles.ts:12 outrank plain .link. “All events”/“Details” inherit ink rather than primary; Fix 11. |
| Header wrap / safe areas | Header wrap and sheet bottom safe-area implemented; full detent filter overlap remains, Fix 4. |
| Async theme order/failure | Style-JSON ordering/retention tests passed; later replacement-source error fails, Fix 2. |
| EventRow context as a union rather than optional flags | Still uses RowShow.category plus optional venue (EventRow.tsx:11), permitting combinations beyond the three intended contexts. Narrow this contract as part of Fix 8. |
| Shared theme icon source | Map uses lucide components; static site still has hand-coded ICONS in web/theme.ts:15. Fix 7 can also eliminate the two icon representations without adding a client icon registry. |

## Seven bugs from the merged review

| Bug | Resolution | Evidence |
|---|---|---|
| 1: stale next-event pin label | Resolved | Current feature props/stable key and label-update E2E passed. |
| 2: search/filter submit drops grouping | Resolved | Keep hidden group, filter-submit E2E and actual no-JS search URL retained day. |
| 3: failed load loses list | **Partly resolved** | Initial basemap failure preserves boot list. Stalled chunk never exits loading, and post-ready failure keeps only 10 of 12 events. S5.6/Fixes 1/2. |
| 4: map source links skip URL check | Resolved | queries.ts:98 + stored javascript URL tests on map/API passed. |
| 5: approximate venue reload moves camera | Resolved | Exact-only camera functions and click/reload/non-vacuity E2E passed. |
| 6: listing seven days ends at weekend | Resolved | nextSevenDaysIst link and IST rollover regression passed. |
| 7: hidden pill overridden by display styling | Resolved | chrome.ts:40 pill[hidden], controls[hidden] rule and actual JS-disabled invisibility. |

## Fix list, ordered by severity

1. **P1: bound the entire map startup, including its dynamic import.** File: `src/web/map/components/MapSlot.tsx:12` (coordinate with MapApp lifecycle). A pending MapCanvas import presently never reaches the inner startup timer. **Done:** withholding the map chunk for the configured startup period produces the recoverable notice, usable all-match list and Try again; late completion cannot resurrect a retired attempt. Add an actual chunk-stall regression, not another style-fetch stall.

2. **P1: distinguish startup from replacement-style failure and restore a complete fallback.** Files: `src/web/ui/map.tsx:110`, `:137`; `src/web/map/components/MapApp.tsx:74`, `:120`. loaded() is false on later source/style updates too. A new-theme source failure removes the good map, and the remaining list retains stale viewport bounds. **Done:** delayed/404 source, sprite or tile failure during a theme change leaves the previous working basemap and no startup notice; a genuine fatal map failure resets viewport-derived presentation and exposes every current matching boot event, with honest heading/counts and a working retry. Verify the 12-event fixture does not fall back to 10.

3. **P1: reconcile popover drafts with restored committed URL state.** File: `src/web/map/components/FiltersPopover.tsx:23`. **Done:** Music -> Comedy -> Back shows Music in both results and popover, and Apply cannot silently revive Comedy. Cover Back/Forward and Clear all; keep unsubmitted edits across unrelated map pans without treating old committed navigation as a draft.

4. **P1: keep phone filters usable at full detent and reconcile the full-sheet results model.** Files: `src/web/map/layout.ts:17`, `styles.ts:218`, `:246`, `MapApp.tsx:183`. **Done:** at 390x844 in light/dark, all filter visual/hit/focus areas stay above the full sheet, including the scrolled Filters/slider; elementFromPoint on their center reaches that control. Expanding a sheet to read its existing results must not empty it solely because its own padding hides the map; resolve the current viewport/detent design conflict explicitly and verify the reading flow while retaining correct camera padding.

5. **P2: position automatically opened phone filters against a visible anchor.** Files: `MapApp.tsx:133`, `FilterBar.tsx:118`, `FiltersPopover.tsx:49`. **Done:** denying location without scrolling the pill row opens the full Type/Area/Apply popup inside the 390px viewport, with intended focus on the area choice and predictable close/focus return. Test the actual denial callback, not just manual Filters activation after Playwright scrolls its anchor.

6. **P2: finish keyboard focus and target geometry for the controls omitted by current tests.** Files: `styles.ts:73`, `:234`; `src/web/ui/chrome.ts:47`; `src/web/ui/components/combobox.tsx:18`; `FiltersPopover.tsx:63`. **Done:** phone handle, Expand/Collapse, Group by links, Type input/trigger, Area and popup actions have visible 2px primary rings with 2px offset when reached by keyboard and at least 44px effective mobile targets. Type/Area have the intended 36px visual control geometry; the chevron is styled as the same control language rather than a browser-grey square. Extend focus/target checks to phone, grouping and popup controls; retain reduced-motion behavior.

7. **P2: satisfy or explicitly revise the deletion gate; do not rely on its narrower test.** Files: `src/web/theme.ts:29`, `src/web/site/ThemeToggle.tsx:10`, `site/Document.tsx:23`, `src/web/map/styles.ts:51`, `test/mapSource.test.ts`. **Done under the current brief:** banned string-to-DOM identifiers no longer occur anywhere under src/web; old styles.ts panel rules are moved to the owned component styling and the replaced path retired; enforcement covers the full promised scope. The raw trusted script/style/JSON-LD purpose is recorded and interactive rebuilds are gone, but this verifier cannot grant an exception to the explicit wider prohibition. If those static blocks or styling are intentionally retained, formally change the gate before calling it passed. Reuse one theme icon representation while preserving plain-page no-bundle behavior.

8. **P2: honor the normalized selection contract and narrow downstream context.** Files: `model/selection.ts:15`, `model/url.ts:40`, `model/filters.ts:15`, `MapApp.tsx:71`, `EventRow.tsx:11`, `AGENTS.md:33`. **Done:** unknown event/venue policy matches S1.3, including a known venue plus unknown event; real mismatched event resolves to its host. Resolve external selection once into none/venue/event and carry the union downstream instead of recreating independent optional pairs. Give row context the intended type/day/venue alternatives and document the actual data/filter-resolution boundary. The progress note records a changed policy without a rationale; either implement the approved criterion or obtain a formal criterion revision before reverification.

9. **P2: generate the admin pre-paint script from the shared preference protocol.** Files: `src/admin/ui/index.html:12`, `src/utils/theme.ts:25`, admin server/HTML composition, `test/theme.test.ts:101`, `AGENTS.md`. **Done:** only the shared protocol implements preference parsing/output, while its generated classic script still runs before paint even with bundles blocked. Stored values, OS preferences **and blocked storage** produce the same result at both bootstrap stages. Keep the valuable no-flash behavior; delete the handwritten logic rather than weakening the test to accept divergence.

10. **P2: close the outstanding original accessibility contracts.** Files: `MapSlot.tsx:19`, `EventRow.tsx:70`, `MapCanvas.tsx:203`, `MobileSheet.tsx:39`. **Done:** use a labelled map region or justify/test application mode with an interaction/help contract; row time/price/venue are available as a description without duplicating its title; marker tab order is intentional and covered; sheet detent state is communicated and focusing content below peek expands/reveals it. Validate with actual keyboard traversal and an accessibility tree, then a screen reader. This item is included for unresolved original review recommendations even though not every detail was repeated as an S criterion.

11. **P3: complete typography, tokens and dark/link presentation.** Files: `site/styles.ts:36`, `site/Detail.tsx:24`, `map/styles.ts:19`, `:60`, `EventImage.tsx:29`, `ui/chrome.ts:17`, DESIGN Typography/brand rules. **Done:** listing time text is tabular; music/film Category on detail pages has the specified light face in dark; semantic links compute to primary despite the page anchor reset; venue-group headings use the intended heading token; image attributes derive from the same geometry contract as their CSS; the 700-weight brand exception and three-weight rule agree. Current image dimensions look right, but the original token-drift finding is still valid.

Items 1..5 are behavioral bugs independently reproduced in the current tree. Items 6..11 cover the literal verification gate, unexplained partials and remaining original-review obligations. S3.3's native-link substitution is an **explained partial**; its recorded reason holds and I do not recommend restoring Toggle Group just to match a library name.

## What could not be verified

- No deployed production server, compression proxy, real event database, live merchant/provider ingestion or real-device performance was tested. This is fixture-based verification of this exact branch. All builds and primary browser tests were run locally.
- Chromium/software WebGL was exercised; Safari/iOS safe-area and virtual-keyboard behavior, Android hardware/GPU/network performance and screen-reader announcements were not verified. TouchCancel and drag were real Chromium/CDP touch events, not evidence for every browser.
- The complete live screenshot run does not collect console logs for each of its 86 cases. Clean-console evidence is the existing assertions plus independent valid-route/preview probes with stub styles and four representative real-basemap idle probes. Forced failures have expected resource diagnostics.
- Historical registry hash prefixes could not be independently reconstructed from archived JSON that was not provided. Installed versions, copy headers, structural adaptations and current runtime use were checked.
- The full-detent empty-list behavior follows one written viewport requirement but conflicts with the sheet's intended reading purpose. I have reported that conflict and reproduced it; I have not silently redesigned it or edited DESIGN.md.
- Existing screenshot previews intentionally shortcut loading/error behavior. Real failure probes, not the previews, establish the lifecycle failures reported above.

The repository remains unchanged outside this permitted report/screenshot directory. Verification stops here.

