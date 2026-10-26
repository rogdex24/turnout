# Independent S8 verification, round 3, 2026-10-11

**PASS: 0 failed rows and 0 partial rows (47 pass) across 47 decision, acceptance and mandatory-brief checks.**

All 42 D/S IDs and five QC rows are assessed below. Original-review cross-references and R1–R4 are not counted again. The three round-two fixes are independently verified; the round-one failure, history, selection, theme, accessibility and polish checks also pass against the revised plan.

Reviewed HEAD `73a9ba4167fa4b5fb418992ac301fcf8c81b5a02` in `/Users/abu/orca/workspaces/hydsocial/map-react`. The initial working tree was clean. I reread the verification brief, its research/review/plan/progress inputs, AGENTS.md and DESIGN.md, inspected the new commit and current ownership boundaries, and reran the full suites, every earlier probe, bundle measurement and my own screenshot matrix. Unchanged criteria below have fresh suite/source evidence; neither an implementer claim nor an earlier test result substitutes for this run. This report supersedes round two's verdict for this HEAD and R1–R4.

## Fresh command results

| Command | Result |
|---|---|
| `bun install` | Exit 0; Bun 1.3.14; checked 551 installs across 556 packages, **no changes**, 163 ms. |
| `bun run check` | Exit 0; four TypeScript projects passed; design lint **0 errors, 0 warnings, 1 info**; **328 pass, 0 fail, 2,274 assertions, 38 files**, 7.74 seconds; dependency-cruiser **0 violations, 192 modules, 613 dependencies**. Expected failing-source diagnostics in ingestion tests did not cause test failures. |
| `bun run e2e --output=/tmp/hydsocial-verifier-r3-playwright --reporter=line` | Exit 0; **84 passed, 86 skipped**, 1.9 minutes. All nine new round-two regression cases passed. The 86 skips are opt-in screenshots rerun separately; no test.fixme/test.failing found in e2e or test. |
| `bun run test test/mapBundle.test.ts` | Exit 0; Bun **1.4.3**; **4 pass, 0 fail, 9 assertions**, 1.87 seconds. |
| `SHOTS=docs/review/verification-2026-10-11/round-3 SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts --output=/tmp/hydsocial-verifier-r3-shots --reporter=line` | Exit 0; **86 passed**, 3.6 minutes, using real OpenFreeMap. All fresh matrix images visually inspected; 19 additional probe screenshots also inspected. |
| Independent inline Playwright probes | All round-one/two probes rerun: chunk stall/retirement/retry, replacement source 404, fatal context loss/all-match fallback/retry, popover history/drafts, full-detent results/visual controls/hit edges, real phone denial and denied preview, focus/targets/touch settings, below-peek focus, no-JS navigation, touch cancellation, 14 page/preview consoles and four real-basemap size/theme console checks. Results below. |
| `git diff --check` and write scope | Exit 0; no tracked diff. Final status lists only this report and round-3/. Only the report and 105 PNG screenshots were authored in the repository; no source/test/config/design/data edits, no commit. The verifier's fixture server was stopped and its temporary Playwright output removed. Earlier reports/screenshots remain intact. |

The scripts and independent fixture server resolve repository Bun 1.4.3, as AGENTS.md specifies; bare install uses 1.3.14.

### Independently measured bundle

Built in memory with `buildMapAssets()` under Bun 1.4.3; each asset compressed with `node:zlib.gzipSync`. No output bundles written. The progress-note figures reproduce exactly.

| Part | Raw bytes | Gzip bytes | Limit |
|---|---:|---:|---:|
| Entry `map.jjs2fxwa.js` | 313,842 | 103,405 | 400,000 |
| MapCanvas/MapLibre `chunk.b30pw8dt.js` | 1,058,148 | 294,367 | Included below |
| CSS `map.q05602ts.css` | 17,717 | 3,874 | Included below |
| Worker | 508,314 | 146,240 | Included below |
| Desktop first load | | **547,886** | 580,000 |
| Phone additional chunks | | 31,500 | Included below |
| Phone first load | | **579,386** | 580,000 |
| Remaining on-demand chunks | | **41,421** | 70,000 |
| All assets | | 620,807 | No all-assets limit |

Phone headroom is **614 bytes**. This is separately gzipped build output, not observed compressed HTTP transfer. Fonts, boot HTML/JSON and basemap resources are outside this JS/CSS/worker budget. `src/web/map/assets.ts:110` does not itself set Content-Encoding. No production compression/device-performance claim is made.

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
| D9 | PASS | Exact Playwright 1.64.0; fixture server/free-port seeded SQLite harness `e2e/run.ts:7`, `server.ts:43`; fresh 84 interaction tests and separate 86 screenshots completed. |
| D10 | PASS | Base UI non-modal downward Drawer (`ui/components/drawer.tsx:13`), controlled three snap points (`MobileSheet.tsx:26`, `:34`). Fresh phone drag/pan/disabled-end tests and independent touchCancel passed. Fresh effective-target/touch-policy checks also pass under S4.2/S6.4. |
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
| S3.5 | PASS | All-match count versus ranked viewport count `MapApp.tsx:80`, `:81`; settled announcement `:195`; fresh hydration/empty/unplaced tests passed. Actual context loss now resets viewport and exposes all 12 matches, rather than retaining 10. R4 preserves half's results at full. |
| S4.1 | PASS | Single nuqs descriptor; free aliases/serialization tests passed. No parseFilters, toQuery or withEventVenue under src/web. |
| S4.2 | PASS | Fresh search/popover/draft/emoji/dismissal tests pass, with R2 native links. Independent 120 pill edge/corner hit tests across both themes and all detents pass; Free bottom-edge click commits free=1, Filters top-edge click opens its dialog. `css/phone.ts:16` padding contains the complete target; `:31` keeps the sheet handle below it. Fields retain 36px visuals/66px label targets. |
| S4.3 | PASS | Pending/pressed Near me union; 1–25km/default 4 Slider, RAF updates/camera on commit (`FilterBar.tsx:79`). Fresh slider/location/ring tests passed. Independent slider edge clicks also pass without changing the detent. |
| S4.4 | PASS | MapApp go/nuqs owner (`:95`); state-derived camera/sheet effects. Fresh full history E2E and independent popover Music → Comedy → Back/Forward/Clear all passed; unrelated pan preserves an unsubmitted draft. |
| S5.1 | PASS | Latest-theme guards and replacement-style rollback in `ui/map.tsx:144`, `:148`, `:156`; fresh theme tests passed. Independent valid dark style with source 404 retained light basemap, six tiles, ready map and 10-event viewport list; no startup notice. |
| S5.2 | PASS | Venue-ID/cluster-revision keys and accessible title/category/count. Fresh unchanged-pin label update, cluster and marker-name E2E passed. |
| S5.3 | PASS | `MapCanvas.tsx` declutter batches geometry reads, decisions then data-hidden writes; settled invalidation remains. Fresh overlap/hover tests passed; no inline visibility or !important. No device frame-rate claim. |
| S5.4 | PASS | RadiusRing and LocationDot derive from location-on; fresh immediate radius/live-dot/off-clearing E2E passed. |
| S5.5 | PASS | Non-modal Drawer, three detents, cancellation, safe-area and settled padding remain. Fresh gestures/pan/selection tests and independent CDP cancellation passed. Full uses half's viewport padding (`MapApp.tsx:206`) per R4. Independent hit-edge checks confirm the filters and slider remain reachable above full. |
| S5.6 | PASS | `MapSlot.tsx:21` bounds import and startup; cleanup retires old attempt. Independent 25-second chunk stall shows recoverable notice/all 12 rows; released late chunk cannot remount; retry restores map. Context loss also yields all 12 rows and successful retry. Fresh failure/approximate-click/reload tests passed. |
| S6.1 | PASS | Fresh four-size/theme chrome E2E and own full matrix confirm corrected layout. Full starts at y=104; half/full retain the same seven IDs. Denied preview now opens at x=122..378 in both themes, focuses Area and returns focus on Escape (`MapApp.tsx:123`, `:141`; `ui/components/drawer.tsx:21` disables initial focus grab). Filter and slider hit edges also pass. |
| S6.2 | PASS | Existing map-v2 screenshots/difference table remain present; fresh independent run produced and visually inspected all 86 matrix images plus 19 probe PNGs in the authorized review folder. Image generation is not a claim that every image is defect-free. |
| S6.3 | PASS | Fresh four bundle tests and independent byte measurements: desktop 547,886, phone 579,386, lazy 41,421, all within revised limits. Fresh plain-page checks load no map JS. |
| S6.4 | PASS | Fresh reduced-motion/tabular/source-ban checks pass. Independent 11 keyboard-visible rings are 2px primary/2px offset. Venue disclosure, All events and Back to listing now measure 44px; `.link` minimum in chrome.ts:29 and panel.ts:12/:17. Detents and Type input/trigger/Area compute manipulation (`css/phone.ts:33`, `css/sheet.ts:25`). Whole filter/slider reach passes; none is retained on gesture controls. |
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
| R2 | Implemented: native links retain no-JS/history/modified-click semantics and aria-current. Group by and scrolling phone presets/Free have working expanded targets and visible keyboard focus. Fresh edge-hit/click probes pass. |
| R3 | Implemented within its revised exception: one RawBlock helper, whole-src/web enforcement and trusted static callers. No interactive DOM reconstruction. Static theme toggle script uses the same helper; icons are server-rendered Lucide markup toggled by hidden. |
| R4 | Implemented: half-to-full preserves seven event IDs and heading in both themes; full sheet top is 104px. Filter targets at y=53/95 and slider control y=52..96 receive their own presses; the handle starts at the sheet edge, with no interception. |

## Independent probes and visual inspection

1. **Chunk stall and retirement:** held the real large MapCanvas chunk and advanced browser time 25 seconds. Notice offers Try again; heading “12 events”, 12 rows, no map/no js-map. Released late completion stays retired; retry restores six tiles, no errors. [probe-chunk-timeout.png](round-3/probe-chunk-timeout.png). The deadline covers the import boundary, not only style fetch.
2. **Replacement-theme source 404 and fatal fallback:** supplied a valid dark replacement style with a GeoJSON source returning 404; one source request failed. Old light map remains ready with six tiles, heading “10 events in view”, no startup notice. [probe-theme-source-failure.png](round-3/probe-theme-source-failure.png). Actual WebGL context loss then clears bounds and exposes all 12 rows with “12 events”; restoring healthy resources and retry works. [probe-context-loss.png](round-3/probe-context-loss.png). This checks behavior across the style lifecycle documented in the [MapLibre Map API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), rather than assuming loaded() means first startup.
3. **Popover history/drafts:** Music → Comedy → Back restores URL/field Music; Forward restores Comedy; Clear all empties the field; an unsubmitted Music choice survives a pan. Console/page errors empty. [probe-popover-history.png](round-3/probe-popover-history.png). Committed fields rebase the draft at FiltersPopover.tsx:29; unrelated camera changes do not.
4. **Full-detent results and visible controls:** half and full retain heading “7 events in view” and IDs e1/e6/e5/e3/e2/e7/e4 in both themes. Sheet top 104; pills remain y=56..92. Tonight/Filters centers, lower faces and y=95 hit their own controls. [Light](round-3/probe-full-filters-light.png), [dark](round-3/probe-full-filters-dark.png); [slider light](round-3/probe-full-slider-light.png), [dark](round-3/probe-full-slider-dark.png).
5. **Round-two effective hit edges:** independently checked five scrolled pills at four edge/corner points, all three detents, both themes: **120/120 correct owners**, including y=53 and y=95. Slider Control is 44px tall at y=52..96; top/bottom hit the slider. Real bottom-edge track clicks change radius (4 → 21, 21 → 5, 5 → 21 in the three detents), leaving the corresponding detent unchanged. Free bottom-edge click commits free=1; Filters top-edge click opens the popup. [Light](round-3/probe-full-target-edges-light.png), [dark](round-3/probe-full-target-edges-dark.png). Repeated the exact former interception point (227.875,95): now it hits Slider Control and leaves full unchanged, rather than collapsing to peek. [probe-full-slider-hit.png](round-3/probe-full-slider-hit.png). One exploratory probe initially clicked the same rounded slider value twice; corrected the probe to alternate low/high track positions. That was a probe assertion issue, not an application failure.
6. **Real denial and denied preview:** actual denied callback starts with pill scroll=0; light/dark popup is x=122, y=100, width=256, height=288 (right=378 inside 390). Area focused; Escape returns Filters focus. [Real light](round-3/probe-location-denied-light.png), [dark](round-3/probe-location-denied-dark.png). Preview now has the same bounds/focus/return in both themes, with scroll=153 and no manual anchor scrolling. [Preview light](round-3/probe-denied-preview-light.png), [dark](round-3/probe-denied-preview-dark.png), plus repeated original [preview probe](round-3/probe-denied-preview.png). MapApp.tsx:123/:141 shares the corrected path; Drawer initialFocus=false prevents it stealing Area focus while mounting.
7. **Keyboard focus, labels, geometry and touch:** all 11 tested controls—handle, Expand/Collapse, Group by Type/Day/Venue, Type input/trigger, Area, Apply/Clear all—show 2px solid primary keyboard-visible outline and 2px offset. [Sheet](round-3/probe-sheet-keyboard-focus.png), [popover](round-3/probe-popover-keyboard-focus.png). Group links have 44px expansions; detents/trigger/actions are 44px; Type/Area visuals remain 36px with 66px labels, whose top/bottom clicks focus the correct field. Venue disclosure, All events and plain-page Back to listing now all measure **44px**, replacing 36/20/20. Expand/Collapse, fields and trigger compute **manipulation**. Gesture handle/slider remain none intentionally. Fresh new E2E also measures Details and plain-page links/buttons.
8. **Below-peek focus and cancellation:** focusing hidden e1 opens half, retains its focus and reveals its 72px row at y=599.4..671.4 inside 844px. [probe-sheet-row-revealed.png](round-3/probe-sheet-row-revealed.png). Fresh accessibility E2E verifies map region, metadata descriptions, marker order and detent text. Independent CDP touchStart/move/cancel leaves zero swiping nodes; subsequent Expand reaches half.
9. **Native/console boundaries:** JS-disabled map has 12 row links, no visible Near me/theme; Jazz native GET preserves group=day and event link expands e1. Fourteen valid listing/category/area/venue/event/map/preview routes return 200 with no console/page errors. Four desktop/phone light/dark real-basemap contexts render six tiles each with empty error lists. Intentionally failed sources and software-GPU warnings are excluded from normal application-console claims.

The [Vercel guidelines](https://vercel.com/design/guidelines) support keyboard-visible focus, mobile target expansion, reduced motion, numeric typography and manipulation on controls. DESIGN/S4.2/S6.4 are the project's acceptance contracts. Effective reach was checked with hit testing and real edge clicks, not just CSS pseudo-element dimensions.

### Screenshot matrix actually taken

**86 matrix PNGs plus 19 probe PNGs: 105 total**, newly generated under round-3/. Every matrix/probe image inspected through in-memory contact sheets and individual images; no contact-sheet files were authored. Fixture events/two SVG covers/organiser, real OpenFreeMap for the full matrix. Desktop 1280x800 and phone 390x844; fullPage listing/detail files can be taller.

- Both sizes/themes: idle, cluster, venue, approximate, event-cover, event-poster, event-organiser, event-plain, group-day, group-venue, loading, empty, error, denied, filters-open, near-me, listing, listing-filtered, event-page.
- Desktop both themes: hover/focus. Phone both themes: sheet-peek/half/full.
- Earlier probe names retained with fresh captures: chunk-timeout, theme-source-failure, context-loss, popover-history, full-filters/full-slider in both themes, location-denied in both themes, sheet/popover keyboard focus, sheet-row-revealed, full-slider-hit, denied-preview. Added whole-target-edge and focused denied-preview captures in both themes.

Representative starting points: [idle desktop light](round-3/idle-desktop-light.png), [dark](round-3/idle-desktop-dark.png), [idle phone light](round-3/idle-phone-light.png), [dark](round-3/idle-phone-dark.png), [filters phone dark](round-3/filters-open-phone-dark.png), [near me](round-3/near-me-desktop-light.png), [full phone dark](round-3/sheet-full-phone-dark.png), [listing](round-3/listing-desktop-light.png), [event page dark](round-3/event-page-phone-dark.png).

No remaining acceptance-blocking visual defect was found in the inspected matrix. Denied phone previews are now contained and Area's ring visible; full sheet retains useful results; expanded cards, poster containment, title hierarchy, dark emoji face and semantic link colors remain coherent after larger links. Horizontal filter scrolling is intentional; it does not produce page overflow. Desktop denial's transient toast can expire before the ready-plus-3.5-second screenshot, so its absence in that late capture is not evidence of missing feedback. Loading/error previews remain demonstrations; injected failures establish actual recovery.

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
| Native links for presets, Free, Group by | R2 formally accepts no-JS semantics and avoiding unnecessary eager Toggle Group cost. Current budget and history/native navigation support the reason. | Met structurally; effective phone filter targets now pass all edge probes. No request to restore Toggle Group. |
| Revised 400KB entry / 580KB first load / 70KB remaining lazy budget | React/Base UI cost and demand splitting documented; fresh measurement reproduces current figures including worker and phone extras. | Met under revised budget; phone margin only 614 bytes. No device-performance or HTTP-compression claim. |
| Phone filters under header, Near me in controls, hidden duplicate count | Recorded responsive chrome rationale holds; own screenshots and fresh counts agree. R4 solves full-sheet reading with half's viewport and lower sheet top. | Met; visible layout, retained results and complete hit-edge reach verified. |
| SSR renderToString/renderToStaticMarkup rather than suggested streaming | D1 requires react-dom/server, not streaming. Fresh native and hydration behavior pass. | Met; within decision scope. |
| Work pulled forward into S3 | Eliminating the interactive renderer together avoids parallel lifetimes. Deleted paths and current component ownership verified. | Met. |
| Native Area select; word-only Type input, emoji options | Recorded and consistent with S4.2 labels; fresh options/focus/field geometry pass. | Met; touch-action now computes manipulation on the named fields/trigger. |
| Known venue survives unknown event | R1 now formally explains ended shared links landing at their venue; direct selection regression passes. | Met under revised policy. |
| Admin pre-paint classic script | Needed before module bundles for no flash. Now generated from the shared preference protocol, parity includes blocked storage. | Met; former duplication removed. |
| Trusted static raw blocks | R3 explicitly permits centralized generated scripts/CSS/escaped JSON-LD. Full-src/web enforcement and actual callers checked. | Met; no interactive string rendering. |
| Two UI motion durations plus camera 400ms | DESIGN distinguishes camera motion; reduced-motion CSS/camera paths tested. | Met. |
| Separate admin palette | Explicit DESIGN exception; theme preference/brand source shared. | Met. |
| Only category/area/free cross views | S7.3 defines this contract; current viewLinks/tests pass. | Approved scope met; original suggestion to explain unsupported date/source/price transfers remains outside that scope. |

No unexplained plan deviation remains. The formally revised requirements and their remaining round-two implementation obligations now pass.

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
| 5: complete non-modal sheet/popup | Resolved | Real denial and preview contained with Area focus/Escape return; cancellation, detents, focus/reveal, full results and edge targets pass. |
| 6: coherent geography/count/empty states | Resolved | Correct normal counts, exact-only camera, complete fallback and R4 retained results. |
| 7: typography/header/targets | Resolved | Numeric/site/title/image/brand fixes and rings verified; former 36/20px targets now 44px; named touch policies and filter edges pass. |
| 8: native forms/shared public contracts | Resolved for scope | Group persists JS/no-JS; view links, URL safety, IST seven-day tests pass. |
| 9: derived rendering/declutter/group append | Resolved structurally | Source and fresh regressions; physical-device performance still unverified. |
| 10: browser regressions/whole bundle | Resolved for verification scope | Fresh 84 interactions/86 matrix screenshots, 19 probe images, worker-inclusive measurement and independent former failure probes pass; new edge/touch/preview regressions included. Physical-device performance remains unverified. |

### Other original accessibility, styling and component-contract observations

| Original observation | Current resolution/evidence |
|---|---|
| A1: marker ordering/native identity | Resolved: stable native buttons, intentional on-screen reading order and fresh ordering E2E. |
| A2: category absent from marker name | Resolved: fresh marker-name E2E. |
| A3: unexplained application role | Resolved: MapSlot labelled region; fresh accessibility E2E. |
| A4: metadata/region relation | Resolved: EventRow.tsx:74 descriptions and region relation; fresh accessibility and close-focus tests. |
| A5: detent meaning/focus below peek | Resolved: detent-state description, end disabling, keyboard rings; independent hidden-row focus reveals/retains it. |
| A6: pointer cancellation | Resolved: independent CDP touch cancellation and subsequent detent action. |
| A7: venue link nested inside disclosure | Resolved: separate native link and disclosure; disclosure now has a verified 44px target. |
| A8: popup dismissal/drafts/focus | Resolved: fresh history/real denial/preview/Escape/outside probes, contained phone popup and intended focus. |
| A9: range target/value/pending Near me | Resolved: semantics/pending/radius and full-sheet edge presses pass; slider value changes while detent stays full. |
| A10: settled viewport announcement | Resolved: one debounced live region; fresh count tests. |
| A11: inert no-JS Near me | Resolved: independent no-JS invisibility and native navigation. |
| Type/day/venue heading tokens | Resolved: panel.ts:14 venue title token; fresh title-size E2E and screenshots. |
| Brand geometry/weight exception | Resolved: correct mark/header geometry; DESIGN now explicitly allows the brand's 700 weight. |
| Thumbnail/cover hardcoded geometry | Resolved: EventImage derives attributes from LAYOUT.image; fresh token/layout tests. |
| Search clear layout/focus | Resolved: persistent control, current target/ring/draft tests. |
| !important/inline visibility/skeleton hacks | Resolved: whole-src/web prohibition tests, declarative skeleton/data-hidden. |
| Semantic links overridden by reset | Resolved: lower-specificity resets and fresh primary-link tests; named text links now measure 44px and accept their own edge presses. |
| Header wrap/safe-area/full sheet | Resolved: visible layout, full-sheet retained results and complete hit-edge reach pass. |
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

**None.** No failed criterion or unexplained partial remains against the revised plan at this HEAD.

| Round-two item | Independently verified closure |
|---|---|
| 1: clipped filter targets/handle interception | css/phone.ts:16–18 contains the full hit expansions; :31 confines the handle to the sheet. 120 correct pill edge/corner hits; slider top/bottom hits and real edge value changes across six size/theme/detent cases; exact old intercept point leaves full unchanged. |
| 2: missed targets/touch-action | panel.ts:12/:17 and chrome.ts:29 give the missed disclosure/links 44px; phone.ts:33 and sheet.ts:25 yield manipulation on named controls. Fresh independent geometry/policy checks and new E2E pass. |
| 3: denied preview clipping/focus | MapApp.tsx:123/:141 uses the real denial path; drawer.tsx:21 prevents initial focus theft. Both previews and actual denied callbacks have contained bounds, Area focus and Escape return. |

All eleven round-one fix areas were rechecked, including their source/contract gates and real failure/history/focus probes. R1–R4 govern accepted policy/implementation changes. No new implementation or test edit was attempted by the verifier.

## What could not be verified

- No deployed production server, compression proxy, real catalogue/provider ingestion or hardware/network performance was tested. This is fixture-based verification of this exact local branch. The near-limit phone budget is a build-byte observation, not an Android/4G performance result.
- Chromium/software WebGL was used. Safari/iOS safe-area and virtual keyboard, Android GPU/touch behavior and actual screen-reader announcements remain unverified. Keyboard traversal, accessible attributes, real Chromium touch cancellation and hit testing were exercised; they do not establish all-device accessibility.
- The 86-image live matrix does not collect console output for every screenshot case. Clean-console evidence is suite assertions plus independent 14 valid route/preview probes and four representative live-basemap idle probes. Forced failure resources have expected diagnostics.
- Historical registry source hashes cannot be fully reconstructed without archived registry responses. Recorded provenance, installed pins, current source and actual use were checked.
- Loading/error previews are controlled demonstration paths; actual failure injection established lifecycle recovery. Both real denial and the preview now use the corrected visible-anchor behavior and pass.

Verification stops after this report and its screenshots. No implementation, test, config or design files were changed.

