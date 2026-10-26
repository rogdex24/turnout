# Independent S8 verification, round 2, 2026-10-11

**FAIL: 3 failed rows and 0 partial rows (44 pass) across 47 decision, acceptance and mandatory-brief checks.**

Counts include overlapping requirements, not unique bugs. All 42 D/S IDs and five QC rows are assessed below. Original-review cross-references and R1–R4 are not counted again. There are three remaining fix items. The round-one architecture, startup, theme-replacement, history and keyboard-focus defects are resolved under the revised plan.

Reviewed HEAD `2da47f67c44618226e6bfbbffc1dce0ecbdabb2d` in `/Users/example/orca/workspaces/hydsocial/map-react`. The initial working tree was clean. I read the brief's inputs, original findings, current progress, AGENTS.md and DESIGN.md, inspected the implementation changes and formal rulings, and independently reran commands, browser probes and screenshots. The new evidence is against this checkout; progress-note claims and round-one results are not substituted for verification. This report supersedes round one's verdict for the revised plan.

## Fresh command results

| Command | Result |
|---|---|
| `bun install` | Exit 0; Bun 1.3.14; checked 551 installs across 556 packages, **no changes**, 211 ms. |
| `bun run check` | Exit 0; four TypeScript projects passed; design lint **0 errors, 0 warnings, 1 info**; **328 pass, 0 fail, 2,276 assertions, 38 test files**, 4.94 seconds; dependency-cruiser **0 violations, 192 modules, 613 dependencies**. |
| `bun run e2e --output=/tmp/hydsocial-verifier-r2-playwright --reporter=line` | Exit 0; **75 passed, 86 skipped**, 1.4 minutes. The 86 skipped cases are opt-in screenshots, rerun separately below. No `test.fixme` or `test.failing` found in `e2e/` or `test/`. |
| `bun run test test/mapBundle.test.ts` | Exit 0; Bun **1.4.3**; **4 pass, 0 fail, 9 assertions**, 1,084 ms. |
| `SHOTS=docs/review/verification-2026-10-11/round-2 SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts --output=/tmp/hydsocial-verifier-r2-shots --reporter=line` | Exit 0; **86 passed**, 3.5 minutes; real OpenFreeMap styles/tiles. All 86 fresh matrix images were visually inspected, through in-memory contact sheets and individual screenshots. |
| Independent inline Playwright probes | Reran stalled chunk, late chunk completion/retry, replacement-theme source 404, fatal context loss/fallback/retry, popover Back/Forward/Clear all/pan, full-detent controls and results, real phone denial, keyboard focus and effective targets. Also repeated no-JS navigation, touch cancellation, normal-page consoles and four real-basemap size/theme console checks. Findings below. |
| `git diff --check` and write scope | Exit 0, no tracked diff. Final `git status --short` lists only this report and `round-2/`; HEAD remains the reviewed commit. Only this report and 101 new PNGs are authored repository files. No source, test, config, design, ingestion or data file was edited; no commit. Fixture databases and Playwright runtime output used temporary directories; the verifier's server was stopped and its temporary Playwright output removed. Round-one artifacts remain intact. |

`bun run` resolves the repository Bun 1.4.3, as AGENTS.md requires. Measurements and the independent fixture server used that binary. The bare install binary is 1.3.14.

### Independently measured bundle

Built with `buildMapAssets()` in memory under Bun 1.4.3, then compressed each asset with `node:zlib.gzipSync`. No bundle files were written. The current progress-note numbers reproduce exactly.

| Part | Raw bytes | Gzip bytes | Limit |
|---|---:|---:|---:|
| Entry `map.w5zzk0kq.js` | 313,754 | 103,386 | 400,000 |
| MapCanvas/MapLibre `chunk.kez4mspx.js` | 1,058,148 | 294,369 | Included below |
| CSS `map.q05602ts.css` | 17,717 | 3,874 | Included below |
| Worker | 508,314 | 146,240 | Included below |
| Desktop first load | | **547,869** | 580,000 |
| Phone additional chunks | | 31,492 | Included below |
| Phone first load | | **579,361** | 580,000 |
| Remaining on-demand chunks | | **41,422** | 70,000 |
| All assets | | 620,783 | No all-assets limit |

Phone headroom is **639 bytes**. These are separately gzipped build assets, not measured compressed HTTP transfers. Fonts, boot HTML/JSON and basemap resources are outside this JS/CSS/worker budget. `src/web/map/assets.ts:110` does not itself set Content-Encoding. This distinction does not change the approved build-budget result.

## Decisions and acceptance criteria

PASS requires current source or runtime evidence. FAIL means the required behavior is contradicted. The orchestrator's formal R1–R4 rulings are applied to the criteria they revise; accepted substitutions are not retained as obsolete literal partials.

| ID | Status | Evidence |
|---|---|---|
| D1 | PASS | React/react-dom 19.3.0 installed; `src/web/map/server.tsx:41` server rendering, `client.tsx:8` hydration, `MapRoot.tsx:10` matching adapter/search. Fresh “the page hydrates without console errors or warnings…” E2E passed. No application framework/router added. |
| D2 | PASS | shadcn 4.21.4; public `src/web/ui/components.json:3` base-nova; root config radix-nova. Public copied Accordion, Drawer, Popover, Combobox and Slider use Base UI and record registry provenance; fresh interactions passed. |
| D3 | PASS | `src/web/ui/map.tsx:1` records mapcn URL, MIT, commit/date/hash and adaptations; MapCanvas uses its Map/MapMarker/MarkerContent. Real OpenFreeMap screenshots and runtime probes passed. Custom cluster rendering is explained below. |
| D4 | PASS | Single descriptor/loader/serializer in `model/url.ts:14`; React adapter `MapRoot.tsx:10`; URL owner in `MapApp.tsx:48`, `:95`. Fresh history/draft E2E and independent Back/Forward passed. Legacy codec absent. |
| D5 | PASS | Location discriminated union/session reducer in `model/state.ts:7`; owner `MapApp.tsx:52`. Radius only belongs to location-on. Fresh location, section, radius and detent tests passed; no external store added. |
| D6 | PASS | `model/selection.ts:35` owns external-pair normalization; MapFilters no longer has venue/event; downstream components take Selection, navigation takes MapState (`MapApp.tsx:75`, `:95`). Initial session uses the same policy to choose its starting detent (`:52`), rather than introducing another downstream selection representation. Structural selection tests passed. |
| D7 | PASS | Token mapping and public Tailwind semantic roles remain shared; admin boot now generated from `utils/theme.ts` through `admin/themeBoot.ts:12`, served at `admin/start.ts:64`. Theme parity tests include blocked storage and passed; no handwritten preference reader remains. |
| D8 | PASS | Inter 5.3.0, local Latin/rupee subsets, swap and immutable cache (`src/web/fonts.ts:12`, `:29`, `:37`). Map numeric checks passed; listing metadata now tabular (`site/styles.ts:35`) and detail values too (`:44`). Fresh typography E2E passed. |
| D9 | PASS | Exact Playwright 1.64.0; fixture server/free-port seeded SQLite harness `e2e/run.ts:7`, `server.ts:43`; fresh 75 interaction tests and separate 86 screenshots completed. |
| D10 | PASS | Base UI non-modal downward Drawer (`ui/components/drawer.tsx:13`), controlled three snap points (`MobileSheet.tsx:26`, `:34`). Fresh phone drag/pan/disabled-end tests and independent touchCancel passed. Remaining hit/touch-policy gaps are S4.2/S6.4. |
| D11 | PASS | Boot snapshot embedded by map server, read by client hydration. Fresh “the client does not refetch /api/map on load…” E2E passed. |
| S1.1 | PASS | `queries.ts:98` applies publicSourceUrl before map serialization; EventRow source action consumes accepted URL. Fresh “the map page and /api/map refuse unsafe source URLs too” test passed. |
| S1.2 | PASS | `site/Listing.tsx:31`, `:58` uses nextSevenDaysIst; fresh listing Next 7 days/IST rollover regression passed. |
| S1.3 | PASS | R1 applies. `model/selection.ts:35` and fresh “a venue with an unknown event keeps the venue open (R1…)” test preserve known venue; unknown IDs and mismatched real-event host tests also passed. |
| S1.4 | PASS | `model/group.ts:29` appends to the group's existing array; fresh grouping/order tests passed. No copied accumulation array per event. |
| S1.5 | PASS | Fresh slider, hover, collapsed-section-after-pan, Back, retained group and server-list tests (`e2e/map.spec.ts:15`, `:38`, `:46`, `:68`, `:126`, `:138`) passed. D11 appropriately replaces initial API-fetch failure with no-refetch verification. No deferred spec remains. |
| S2.1 | PASS | DESIGN contains the specified typography, layout, 36px visuals/44px hits, shadows/radii, UI motion, empty states and revised measured budgets. Fresh design lint: 0 errors/0 warnings/1 info. The explicit brand weight and camera-duration exceptions are now consistent. |
| S2.2 | PASS | Semantic tokens in `map/tokens.ts`, consumed through public `ui/styles.css` @theme mapping; fresh literal-color/token tests passed across map, public UI and site. |
| S2.3 | PASS | `fonts.ts:37` local hashed font route/cache; fresh font/cache unit tests and self-origin Inter E2E passed, with no font CDN request. |
| S2.4 | PASS | Shared theme protocol/brand colors; generated admin classic boot replaces duplicate logic. Fresh blocked-bundle pre-paint E2E and stored-value/OS/blocked-storage parity tests passed. |
| S3.1 | PASS | SSR tree and boot in `server.tsx:40`; fresh no-JS tests and independent JS-disabled browser: 12 row links, invisible Near me/theme, Jazz GET retains group=day, event link opens its expanded region. |
| S3.2 | PASS | `client.tsx:9` hydrateRoot; fresh hydration E2E without mismatches. No interactive string-to-DOM paths; R3 static blocks assessed in QC1. |
| S3.3 | PASS | Accordion collapse keys and persistent image/poster state remain component-owned; fresh collapse-after-pan/image tests passed. R2 approves Group by native links, with aria-current and no-JS semantics; their new 44px pseudo hit areas and focus rings passed independent inspection. |
| S3.4 | PASS | Row region/focus linkage `EventRow.tsx:74` and open region; fresh close/All events focus-return E2E passed. New metadata-description/accessibility test also passed. |
| S3.5 | PASS | All-match count versus ranked viewport count `MapApp.tsx:80`, `:81`; settled announcement `:189`; fresh hydration/empty/unplaced tests passed. Actual context loss now resets viewport and exposes all 12 matches, rather than retaining 10. R4 preserves half's results at full. |
| S4.1 | PASS | Single nuqs descriptor; free aliases/serialization tests passed. No parseFilters, toQuery or withEventVenue under src/web. |
| S4.2 | **FAIL** | Draft search, popover dismiss/focus, restored drafts, 36px fields and label-expanded targets pass; R2 links accepted. However phone horizontally scrolling pills clip their 44px hit expansion (`css/phone.ts:14`, `:15`): at center+21px, Tonight and Filters hit CANVAS. The slider's same promised lower target hits the full-sheet handle. Fix 1. |
| S4.3 | PASS | Pending/pressed Near me union; 1–25km/default 4 Slider, RAF updates/camera on commit (`FilterBar.tsx:79`). Fresh slider/location/ring tests passed. The separate target-interception defect is S4.2. |
| S4.4 | PASS | MapApp go/nuqs owner (`:95`); state-derived camera/sheet effects. Fresh full history E2E and independent popover Music → Comedy → Back/Forward/Clear all passed; unrelated pan preserves an unsubmitted draft. |
| S5.1 | PASS | Latest-theme guards and replacement-style rollback in `ui/map.tsx:144`, `:148`, `:156`; fresh theme tests passed. Independent valid dark style with source 404 retained light basemap, six tiles, ready map and 10-event viewport list; no startup notice. |
| S5.2 | PASS | Venue-ID/cluster-revision keys and accessible title/category/count. Fresh unchanged-pin label update, cluster and marker-name E2E passed. |
| S5.3 | PASS | `MapCanvas.tsx` declutter batches geometry reads, decisions then data-hidden writes; settled invalidation remains. Fresh overlap/hover tests passed; no inline visibility or !important. No device frame-rate claim. |
| S5.4 | PASS | RadiusRing and LocationDot derive from location-on; fresh immediate radius/live-dot/off-clearing E2E passed. |
| S5.5 | PASS | Non-modal Drawer, three detents, cancellation, safe-area and settled padding remain. Fresh gestures/pan/selection tests and independent CDP cancellation passed. Full uses half's viewport padding (`MapApp.tsx:200`) per R4. Hit-edge overlap is separately failed. |
| S5.6 | PASS | `MapSlot.tsx:21` bounds import and startup; cleanup retires old attempt. Independent 25-second chunk stall shows recoverable notice/all 12 rows; released late chunk cannot remount; retry restores map. Context loss also yields all 12 rows and successful retry. Fresh failure/approximate-click/reload tests passed. |
| S6.1 | **FAIL** | Own idle/selected/plain-page screenshots show corrected chrome and full sheet starts at y=104, below the visible pills. Actual denial popup is now contained. But required denied preview bypasses the anchor fix (`MapApp.tsx:122`): at 390px its right edge is 432px, clipping 42px in both themes. Effective filter reach also fails at hit edges. Fixes 1, 3. |
| S6.2 | PASS | Existing map-v2 screenshots/difference table remain present; fresh independent run produced and visually inspected all 86 matrix images plus 15 probe PNGs in the authorized review folder. Image generation is not a claim that every image is defect-free. |
| S6.3 | PASS | Fresh four bundle tests and independent byte measurements: desktop 547,869, phone 579,361, lazy 41,422, all within revised limits. Fresh plain-page checks load no map JS. |
| S6.4 | **FAIL** | No transition-all; reduced motion, tabular numbers and 11 independently keyboard-focused control rings pass (2px primary/2px offset). Remaining mobile targets are venue disclosure 36px and All events/Back to listing 20px, without expanded hit areas. Expand/Collapse and popover fields/trigger compute touch-action:auto, contrary to specified manipulation. Fix 2; filter clipping also Fix 1. |
| S7.1 | PASS | React server Document/Listing/Detail/Header use shared tokens/chrome/Inter. Fresh category/area/venue/detail and listing E2E pass, no map bundle; only generated theme scripts plus JSON-LD. R3 trusted static shell blocks apply. |
| S7.2 | PASS | Fresh site behavior tests (feeds, JSON-LD, filters, source safety, sitemap) passed. `pages.tsx` composes JSX; old page/card/form string templates absent; deletion regression passed. |
| S7.3 | PASS | `viewLinks.ts:20` shared category/area/free transfer; fresh unit and cross-view E2E passed. List link follows committed map filters. |
| QC1: deleted code | PASS | Full-src/web scan and fresh six mapSource tests: no innerHTML/insertAdjacentHTML/!important; only RawBlock owns dangerouslySetInnerHTML (`ui/rawBlock.tsx:9`) for trusted server scripts/style/escaped JSON-LD per R3. Old map render.ts/page.ts/client/map.ts/icons.ts/URL codec/styles.ts gone, CSS now purpose-owned `map/css/`. Shared theme preference and Lucide icon markup remove duplicates. |
| QC2: library choices | PASS | Exact manifest pins match installed package JSON; table below. Copy-source headers present; no Vaul/react-map-gl added. |
| QC3: dependency rule | PASS | Fresh dependency-cruiser: 192 modules/613 edges, 0 violations. No ingestion changes in migration/fix diff. Admin edits are shared theme bootstrap files allowed by S2.4. web/ui remains a leaf. |
| QC4: AGENTS accuracy | PASS | `AGENTS.md:31` onward describes React site/map layout, leaf UI, CSS ownership, URL normalization to Selection and shared theme protocol. Current files and contracts match; commands and Bun version note verified by fresh runs. |
| QC5: console errors | PASS | Independent 14 valid listing/category/area/venue/event/map/preview route probes: HTTP 200, no console errors/page errors. Four additional real-basemap desktop/phone light/dark probes rendered six tiles each, no errors. Fresh hydration assertions also pass. Injected 404/context failures are intentionally excluded from normal-page clean-console claims; software-GPU warnings are not application errors. |

### Formal rulings applied

| Ruling | Independent assessment |
|---|---|
| R1 | Implemented and directly tested. Retaining a known venue for an ended/unknown event is now the approved policy, not a deviation to repair. Mismatched real events still choose their real host. |
| R2 | Accepted links preserve no-JS, modified-click and history semantics and aria-current. Group by focus/hit expansion is fixed. Scrolling filter links still fail the ruling's 44px effective-target obligation (Fix 1). |
| R3 | Implemented within its revised exception: one RawBlock helper, whole-src/web enforcement and trusted static callers. No interactive DOM reconstruction. Static theme toggle script uses the same helper; icons are server-rendered Lucide markup toggled by hidden. |
| R4 | Half-to-full preserved the same seven event IDs and heading in both themes; full sheet top is 104px and all visible filter centers are clear. Its reach requirement remains incomplete at the extended hit edges: the slider's lower target activates the handle (Fix 1). |

## Independent probes and visual inspection

1. **Chunk stall and retirement:** held the actual large MapCanvas chunk, advanced browser time 25 seconds. Recoverable notice, heading “12 events”, 12 rows, no map, no js-map class. Released chunk remained retired. Try again rendered six basemap tiles. [probe-chunk-timeout.png](round-2/probe-chunk-timeout.png). This reruns the round-one failure at the import boundary, not merely a style-fetch timeout.
2. **Theme source 404 and fatal fallback:** switched to a valid replacement style whose source URL returned 404. One failed source request occurred; old light basemap remained, map stayed ready with six tiles, heading “10 events in view”, no startup notice. [probe-theme-source-failure.png](round-2/probe-theme-source-failure.png). Separately losing the WebGL context removed js-map and reset bounds: heading “12 events”, all 12 rows. After restoring healthy resources, retry succeeded. [probe-context-loss.png](round-2/probe-context-loss.png). MapLibre's documented style lifecycle supports the distinction between initial startup and replacement-style work; the actual behavior was tested rather than inferred from loaded(). [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/).
3. **Popover history:** apply Music, then Comedy, Back: URL and field both Music, four matching rows; Forward: both Comedy; Clear all: empty field; unsubmitted Music edit survives a pan. No console/page errors. `FiltersPopover.tsx:29` rebases only on committed category/area changes. [probe-popover-history.png](round-2/probe-popover-history.png).
4. **Full detent, visible controls and retained results:** light/dark half and full both show “7 events in view”, IDs e1/e6/e5/e3/e2/e7/e4. Full top 104; pill visual bounds y=56..92. Tonight/Filters centers and lower visible faces receive their own press. [Light](round-2/probe-full-filters-light.png), [dark](round-2/probe-full-filters-dark.png). This resolves the round-one visible overlap and empty-list defect.
5. **Full detent, effective hit-edge failure:** at y=95 (center y=74 plus 21, inside the promised 44px target), Tonight and Filters hit CANVAS. The horizontal overflow clips their expanded pseudo-elements. With Near me on, slider thumb center is (227.875,74); (227.875,95) hits “Resize the list”, whose expanded area reaches above the sheet. An actual pointer click there changes **full → peek** while radius stays **4km**. [probe-full-slider-hit.png](round-2/probe-full-slider-hit.png), [light slider](round-2/probe-full-slider-light.png), [dark slider](round-2/probe-full-slider-dark.png). The new full-detent E2E checks centers and the lower visible thumb, not this promised hit edge, so its green result does not disprove the defect.
6. **Real phone denial:** no prior manual filter scrolling; actual geolocation denial callback scrolls the anchor into view, opens popup at x=122/y=100, width=256/height=288, right=378 within 390, focuses Area. Escape returns focus to Filters. Both themes pass, no console errors. [Light](round-2/probe-location-denied-light.png), [dark](round-2/probe-location-denied-dark.png). `MapApp.tsx:135` is the new fix. In contrast `/map?state=denied` opens directly at `:122`: left=176/right=432, clipped 42px; [probe-denied-preview.png](round-2/probe-denied-preview.png) and both fresh phone denied matrix images confirm the residual preview defect.
7. **Focus and targets:** all 11 tested controls (sheet handle/Expand/Collapse, Group by Type/Day/Venue, Type input/trigger, Area, Apply/Clear all) acquire keyboard-visible **2px solid primary outline with 2px offset**. [Sheet focus](round-2/probe-sheet-keyboard-focus.png), [popover focus](round-2/probe-popover-keyboard-focus.png). Type/Area visuals are 36px; their enclosing 66px labels focus the correct field from top and bottom, so those effective targets pass. Group by visuals are 26px with 44px expansions; detent buttons are 44px. Remaining target omissions: venue Accordion disclosure 36px; All events 20px; plain event-page Back to listing 20px, all without expanded targets. Detents, Type input/trigger and Area compute touch-action:auto. Handle/slider touch-action:none is appropriate for their gestures, not included in that failure.
8. **Revealed keyboard row:** focusing a row below peek moves sheet to half, retains e1 focus and reveals the 72px row at y=599.4..671.4, inside the 844px viewport. [probe-sheet-row-revealed.png](round-2/probe-sheet-row-revealed.png). Fresh accessibility E2E verifies the labelled map region, metadata descriptions, intentional marker reading order and detent descriptions.
9. **Other round-one boundaries repeated:** JS-disabled Jazz submit preserved group=day, event link expanded e1, Near me/theme hidden. CDP touchStart/move/cancel left zero data-swiping elements, then Expand reached half. Clean-console route/live checks are reported in QC5. These are Chromium behavioral checks, not a claim of physical-phone or screen-reader validation.

Focus, numeric typography and reduced-motion checks follow the [Vercel design guidelines](https://vercel.com/design/guidelines); the project's explicit 44px effective-target and manipulation requirements come from DESIGN/S4.2/S6.4. The checks use actual hit testing and keyboard focus, since CSS dimensions alone can miss clipping and interception.

### Screenshot matrix actually taken

**86 matrix PNGs plus 15 independent probe PNGs: 101 total**, all newly generated under `round-2/`. Fixture events, two fixture SVG covers and fixture organiser; real basemap for the full matrix. Desktop 1280x800 and phone 390x844; listing/detail fullPage screenshots may be taller.

- Both sizes/themes: idle, cluster, venue, approximate, event-cover, event-poster, event-organiser, event-plain, group-day, group-venue, loading, empty, error, denied, filters-open, near-me, listing, listing-filtered, event-page.
- Desktop both themes: hover, focus. Phone both themes: sheet-peek, sheet-half, sheet-full.
- Probes: chunk-timeout, theme-source-failure, context-loss, popover-history; full-filters and full-slider in both themes; real location-denied in both themes; sheet-keyboard-focus, popover-keyboard-focus, sheet-row-revealed, full-slider-hit, denied-preview.

Representative images: [idle desktop light](round-2/idle-desktop-light.png), [idle desktop dark](round-2/idle-desktop-dark.png), [idle phone light](round-2/idle-phone-light.png), [idle phone dark](round-2/idle-phone-dark.png), [filters phone dark](round-2/filters-open-phone-dark.png), [near me desktop light](round-2/near-me-desktop-light.png), [full phone dark](round-2/sheet-full-phone-dark.png), [listing](round-2/listing-desktop-light.png), [event page dark](round-2/event-page-phone-dark.png).

Visual improvements confirmed: full-sheet results remain useful, no visible filter occlusion, focus rings appear, popover chevron is integrated, venue heading uses the title size, semantic links use primary and music emoji has the specified dark-mode light face. Remaining visible defect is the denied phone preview; hit-area clipping is established by interaction, not apparent from a static image. Desktop denial toast can expire before the ready-plus-3.5-second screenshot, so its absence there does not establish missing feedback. Loading/error previews do not replace injected lifecycle probes.

## Library pins and provenance

| Choice | Manifest and installed version | Evidence |
|---|---|---|
| React / react-dom | 19.3.0 / 19.3.0 | package.json and installed package JSON; fresh SSR/hydration passed |
| shadcn | 4.21.4 | Exact pin; public base-nova/admin radix-nova configs and copied source headers |
| Base UI | @base-ui/react 1.9.0 | Exact installed pin, public imports, fresh Drawer/Popover/Combobox/Slider/Accordion interactions |
| nuqs | 2.10.2 | Exact installed pin, shared parser/serializer, plain React adapter and fresh history tests |
| MapLibre | 6.13.0 | Exact installed pin and fresh real-basemap runtime |
| mapcn | Owned copied source | ui/map.tsx header: registry URL, MIT, d160bd7 (2026-09-06), fetched 2026-10-11, hash prefix 1817e5f387d4, retained pieces/adaptations |
| Inter | @fontsource-variable/inter 5.3.0 | Exact installed pin; local subsets and cache/font E2E |
| Playwright | @playwright/test 1.64.0 | Exact installed pin; fresh suites executed |
| Tailwind | 4.3.3 | Exact installed pin; semantic-role mapping |

Copied shadcn headers record URLs/date/hash prefixes. Historical registry JSON archives were not supplied, so I verified recorded provenance, current source/use and installed versions, not a claim of reconstructing every historical copy hash. Fresh official library documentation was consulted for the relevant map lifecycle; observed probes establish the result.

## Deviations from the approved plan and research

| Deviation | Reason and independent assessment | Research intent |
|---|---|---|
| Custom cluster DOM markers rather than mapcn ClusterLayer | Recorded mapcn circles cannot express stacked tiles/captions. Uses mapcn marker lifetime with revision keys; fresh cluster screenshots/identity tests agree. Reason holds. | Met. |
| Native links for presets, Free, Group by | R2 formally accepts no-JS semantics and avoiding unnecessary eager Toggle Group cost. Current budget and history/native navigation support the reason. | Met structurally; remaining effective phone filter targets need Fix 1. No request to restore Toggle Group. |
| Revised 400KB entry / 580KB first load / 70KB remaining lazy budget | React/Base UI cost and demand splitting documented; fresh measurement reproduces current figures including worker and phone extras. | Met under revised budget; phone margin only 639 bytes. No device-performance or HTTP-compression claim. |
| Phone filters under header, Near me in controls, hidden duplicate count | Recorded responsive chrome rationale holds; own screenshots and fresh counts agree. R4 solves full-sheet reading with half's viewport and lower sheet top. | Visible layout/results fixed; effective hit-edge reach remains incomplete. |
| SSR renderToString/renderToStaticMarkup rather than suggested streaming | D1 requires react-dom/server, not streaming. Fresh native and hydration behavior pass. | Met; within decision scope. |
| Work pulled forward into S3 | Eliminating the interactive renderer together avoids parallel lifetimes. Deleted paths and current component ownership verified. | Met. |
| Native Area select; word-only Type input, emoji options | Recorded and consistent with S4.2 labels; fresh options/focus/field geometry pass. | Met; remaining touch-action policy is Fix 2. |
| Known venue survives unknown event | R1 now formally explains ended shared links landing at their venue; direct selection regression passes. | Met under revised policy. |
| Admin pre-paint classic script | Needed before module bundles for no flash. Now generated from the shared preference protocol, parity includes blocked storage. | Met; former duplication removed. |
| Trusted static raw blocks | R3 explicitly permits centralized generated scripts/CSS/escaped JSON-LD. Full-src/web enforcement and actual callers checked. | Met; no interactive string rendering. |
| Two UI motion durations plus camera 400ms | DESIGN distinguishes camera motion; reduced-motion CSS/camera paths tested. | Met. |
| Separate admin palette | Explicit DESIGN exception; theme preference/brand source shared. | Met. |
| Only category/area/free cross views | S7.3 defines this contract; current viewLinks/tests pass. | Approved scope met; original suggestion to explain unsupported date/source/price transfers remains outside that scope. |

No unexplained plan deviation remains. The three failures are implementation gaps against the revised rules, not requests for additional architectural exceptions.

## Original Codex review: numbered findings

References below point to the current tree; removed review-era paths are not treated as current implementation.

### Section 1 findings

| Finding | Resolution | Evidence |
|---|---|---|
| 1: four URL transition paths | Resolved | MapApp go/nuqs and state-derived effects; fresh history tests and independent popover history pass. |
| 2: count/geography meanings | Resolved | Normal all-match versus in-view distinction; fatal fallback now all 12; half/full same seven per R4. |
| 3: DOM as second state store | Resolved | React/session/draft ownership, committed-draft reconciliation, no interactive string-to-DOM; fresh pan/history tests. |
| 4: forms drop grouping | Resolved | Fresh JS and independent no-JS Jazz submit retain group=day. |
| 5: stale marker/cache identity | Resolved | Stable venue ID/current props/cluster revision; fresh label update regression passed. |
| 6: invalid selection combinations | Resolved under R1 | MapFilters removes nullable pair; downstream Selection/MapState/RowContext; fresh structural/policy tests. |
| 7: approximate camera drift | Resolved | Exact-only camera; fresh approximate click/reload and exact non-vacuity tests. |
| 8: cross-view context and seven-day meaning | Resolved for approved scope | Shared category/area/free and seven-day rollover pass. Broader unsupported-filter notice was not added and is outside S7.3. |
| 9: source URL policy | Resolved | Shared publicSourceUrl plus fresh unsafe-source map/API/detail tests. |
| 10: visual/theme ownership | Resolved | Shared public tokens/chrome/Inter, generated admin preference boot, Lucide server icon markup, owned CSS; formal admin palette exception. |

### Section 6 numbered performance findings

| Finding | Resolution | Evidence |
|---|---|---|
| 1: panel reconstruction/repeated filtering | Resolved structurally | Memoized matches/radius and keyed React rows; MapApp.tsx:50/:73/:80. Two small inBounds traversals remain at :80/:81, not full DOM reconstruction. No hardware-performance claim. |
| 2: unbounded slider input work | Resolved | RAF coalescing/camera commit; fresh drag tests. |
| 3: marker churn despite cache | Resolved | Stable mapcn marker lifetime/keys and updated content; fresh marker continuity test. |
| 4: interleaved/cubic declutter | Resolved structurally | Read/decision/write phases, no repeated owner scan; fresh overlap tests. Pairwise collision work remains; no profiling claim. |
| 5: copied group arrays | Resolved | In-place push and fresh ordering/group tests. |
| 6: worker omitted from budget | Resolved | Fresh graph measurement includes worker/CSS/phone chunks. Transfer compression unverified. |
| 7: duplicate initial fetch | Resolved | Boot snapshot and fresh no-/api/map startup assertion. |
| 8: permanent startup/failure | Resolved | Actual stalled import terminates; late completion retired; 404 theme rollback and complete context-loss fallback/retry pass. |

### Top-10 change recommendations

| Rank | Resolution | Evidence |
|---|---|---|
| 1: normalized selection/transition owner | Resolved | Selection/MapState, single URL owner, fresh structural/history/policy tests. |
| 2: shared SSR rows/images, persistent filters | Resolved | SSR/native/hydration, component identity and corrected history draft probe. |
| 3: usable list/bounded startup | Resolved | Actual chunk stall and context loss expose all matches; retry works. |
| 4: stable marker identity | Resolved | Fresh label/cluster identity tests. |
| 5: complete non-modal sheet/popup | Mostly resolved | Real denial, cancellation, detents, focus/reveal and full results fixed; extended hit-edge overlap and denied preview remain (Fixes 1, 3). |
| 6: coherent geography/count/empty states | Resolved | Correct normal counts, exact-only camera, complete fallback and R4 retained results. |
| 7: typography/header/targets | Mostly resolved | Numeric/site/title/image/brand fixes and rings verified; remaining targets/touch policy (Fixes 1, 2). |
| 8: native forms/shared public contracts | Resolved for scope | Group persists JS/no-JS; view links, URL safety, IST seven-day tests pass. |
| 9: derived rendering/declutter/group append | Resolved structurally | Source and fresh regressions; physical-device performance still unverified. |
| 10: browser regressions/whole bundle | Substantially resolved | Fresh 75 interactions/86 screenshots and worker-inclusive measurement; current checks miss hit-edge clipping, a few controls and denied preview. |

### Other original accessibility, styling and component-contract observations

| Original observation | Current resolution/evidence |
|---|---|
| A1: marker ordering/native identity | Resolved: stable native buttons, intentional on-screen reading order and fresh ordering E2E. |
| A2: category absent from marker name | Resolved: fresh marker-name E2E. |
| A3: unexplained application role | Resolved: MapSlot labelled region; fresh accessibility E2E. |
| A4: metadata/region relation | Resolved: EventRow.tsx:74 descriptions and region relation; fresh accessibility and close-focus tests. |
| A5: detent meaning/focus below peek | Resolved: detent-state description, end disabling, keyboard rings; independent hidden-row focus reveals/retains it. |
| A6: pointer cancellation | Resolved: independent CDP touch cancellation and subsequent detent action. |
| A7: venue link nested inside disclosure | Resolved: separate native link and disclosure; disclosure's 36px target still needs Fix 2. |
| A8: popup dismissal/drafts/focus | Real behavior resolved: fresh history/denial/Escape/outside probes. Denied preview remains clipped (Fix 3). |
| A9: range target/value/pending Near me | Semantics/pending/radius pass; full-sheet extended slider hit area still intercepted (Fix 1). |
| A10: settled viewport announcement | Resolved: one debounced live region; fresh count tests. |
| A11: inert no-JS Near me | Resolved: independent no-JS invisibility and native navigation. |
| Type/day/venue heading tokens | Resolved: panel.ts:14 venue title token; fresh title-size E2E and screenshots. |
| Brand geometry/weight exception | Resolved: correct mark/header geometry; DESIGN now explicitly allows the brand's 700 weight. |
| Thumbnail/cover hardcoded geometry | Resolved: EventImage derives attributes from LAYOUT.image; fresh token/layout tests. |
| Search clear layout/focus | Resolved: persistent control, current target/ring/draft tests. |
| !important/inline visibility/skeleton hacks | Resolved: whole-src/web prohibition tests, declarative skeleton/data-hidden. |
| Semantic links overridden by reset | Color resolved: lower-specificity resets, fresh primary-link test. Some native text-link hit areas remain small (Fix 2). |
| Header wrap/safe-area/full sheet | Visible layout resolved; hit-edge reach remains Fix 1. |
| Async theme order/failure | Resolved: fresh ordering tests and actual replacement-source 404 probe. |
| Row context optional flag combinations | Resolved: EventRow.tsx:16 type/day/venue discriminated union. |
| Shared theme icons | Resolved: server-rendered Lucide icons, hidden toggling, no hand-coded icon strings/innerHTML. |
| Detail music/film emoji and numeric text | Resolved: dark light-face token on data-black emoji; listing/detail tabular rules and fresh E2E/screenshots. |

## Seven bugs from the merged review

| Bug | Resolution | Evidence |
|---|---|---|
| 1: stale next-event pin label | Resolved | Fresh in-place label-update E2E. |
| 2: submit loses grouping | Resolved | Fresh JS and actual no-JS submit retain day. |
| 3: failed load loses list | Resolved | Import deadline, retired attempt, complete 12-row fatal fallback and working retries independently verified. |
| 4: map skips source URL validation | Resolved | Fresh unsafe-source map/API regression. |
| 5: approximate reload moves camera | Resolved | Fresh approximate click/reload and exact control tests. |
| 6: seven days ends at weekend | Resolved | Fresh IST today-through-today+6 regression. |
| 7: hidden pill display override | Resolved | Actual no-JS Near me/theme hidden, fresh hidden-rule tests. |

## Fix list, ordered by severity

1. **P2: preserve the complete phone filter targets and prevent the full-sheet handle from intercepting the slider.** Files: `src/web/map/css/phone.ts:14`, `:15`, `:28`; `src/web/ui/chrome.ts:45`; `src/web/map/layout.ts:17`; slider target at `src/web/ui/components/slider.tsx:14`. Horizontal overflow clips the pills' expanded 44px area outside the 36px row. At full, the handle's pseudo-target reaches upward into the slider's lower target: an intended slider press at (227.875,95) collapses full to peek. **Done:** at 390x844, both themes and every detent, the complete 44px vertical target for each scrolled pill/slider receives its own action; no clipping or overlapping handle interception. Verify actual edge-point hits/clicks, not only visual centers, pseudo-element sizes or the 16px thumb's visible face. Preserve R4's half-to-full results. Covers S4.2, S6.1, S6.4 and the remaining R2/R4 reach gap.

2. **P2: finish effective mobile targets and the required touch policy on omitted controls.** Files: `src/web/map/css/panel.ts:18` (venue disclosure lowered to 36px), `:12` (All events/back link); `src/web/ui/chrome.ts:29` (text links); `src/web/site/styles.ts:41` and `site/Detail.tsx:20` (Back to listing); `src/web/map/css/phone.ts:30` (detent all:unset); popover input/trigger/select styles and `FiltersPopover.tsx:59`. Independent targets: disclosure 36px; All events and Back to listing 20px, no hit expansion. Expand/Collapse, Type input/trigger and Area still compute touch-action:auto. **Done:** each named control has at least 44px effective, unoccluded mobile target and the specified touch-action:manipulation; retain 36px field visuals, working label expansion and new focus rings. Gesture handle/slider may retain none. Verify measured effective reach and computed policy across map and plain detail pages. Covers S6.4.

3. **P2: use the corrected visible-anchor denial behavior for the required preview too.** File: `src/web/map/components/MapApp.tsx:122`, compare shared behavior at `:135`. Real geolocation denial uses the new scrolling helper and passes. The `state=denied` preview still opens directly while Filters is horizontally off-screen, producing x=176..432 in a 390px viewport. **Done:** light/dark denied preview opens the complete popup inside the viewport with Area focus and predictable Escape focus return, matching actual denial. Re-run the preview screenshots and a contained-bounds assertion without manually scrolling the anchor first. Covers S6.1.

All three items are independently reproduced in this current tree. The full suite's green result does not cover these specific gaps. No source or test fix was attempted by this verifier.

## What could not be verified

- No deployed production server, compression proxy, real catalogue/provider ingestion or hardware/network performance was tested. This is fixture-based verification of this exact local branch. The near-limit phone budget is a build-byte observation, not an Android/4G performance result.
- Chromium/software WebGL was used. Safari/iOS safe-area and virtual keyboard, Android GPU/touch behavior and actual screen-reader announcements remain unverified. Keyboard traversal, accessible attributes, real Chromium touch cancellation and hit testing were exercised; they do not establish all-device accessibility.
- The 86-image live matrix does not collect console output for every screenshot case. Clean-console evidence is suite assertions plus independent 14 valid route/preview probes and four representative live-basemap idle probes. Forced failure resources have expected diagnostics.
- Historical registry source hashes cannot be fully reconstructed without archived registry responses. Recorded provenance, installed pins, current source and actual use were checked.
- Loading/error previews are controlled demonstration paths; actual failure injection established lifecycle recovery. The denied preview's separate path is specifically reported, despite the now-correct actual callback.

Verification stops after this report and its screenshots. No implementation, test, config or design files were changed.
