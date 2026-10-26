# Plan: `/map` on React, shadcn/ui and nuqs

Status: approved by the owner on 2026-10-11 ("Yes, I want the React move… get them all done").
Inputs: `docs/review/ui-review-2026-10-11.md` (merged verdict and research) and
`docs/review/ui-review-codex-2026-10-11.md` (evidence with file:line).

Every acceptance criterion has an ID (`S1.2`). The verification step (S8) checks each ID
against the code and the running app and writes a pass or fail with evidence. Work is not
done until S8 passes.

## Goal

The public map keeps its behaviour and gains a component model:
- One owner for each piece of state, no `innerHTML` rebuilds, no CSS fighting inline styles.
- The same React components render on the server (no-JavaScript list, SEO, first paint)
  and in the browser (hydrated, then live).
- A premium visual layer from a revised `DESIGN.md`, built on shadcn/ui (Base UI variant)
  and Tailwind 4.
- Browser tests that catch interaction bugs.

## Decisions (from the research; the verifier checks each one)

| ID | Decision | Source |
|---|---|---|
| D1 | React 19.3 for `/map`; `react-dom/server` renders the initial tree in `Bun.serve`; the client calls `hydrateRoot` with the same initial props, then switches to live viewport state. No framework (no Next.js, no router library). | react.dev hydrateRoot; bun.com/guides/ecosystem/ssr-react |
| D2 | shadcn/ui 4.21 **Base UI variant** (`style: "base-nova"`) for public components, in its own `components.json` under `src/web/ui/`. The admin keeps `radix-nova`. | ui.shadcn.com/docs/components/base/drawer; shadcn issue #8455 (Vaul unmaintained) |
| D3 | Map component code copied in from **mapcn** and adapted: OpenFreeMap styles (not CARTO), our basemap repaint, our tile markers. Fall back to `react-map-gl/maplibre` 8.1 only if mapcn blocks a requirement; record why. | mapcn.dev/docs; github.com/AnmolSaini16/mapcn |
| D4 | **nuqs** (`nuqs/adapters/react`) owns URL state through one descriptor; the server parses with `createLoader` from the same parsers. `parseFilters`/`toQuery` are deleted after callers move. Filter, group and selection changes push history; typing does not. | nuqs.dev/docs/adapters, /server-side, /options |
| D5 | Session state in one `useReducer`: location (`off \| requesting \| on{origin,km} \| denied`), sheet detent, collapsed sections. No Redux, Zustand or query cache. | both reviews |
| D6 | Selection is a union: `none \| venue{venueId} \| event{venueId,eventId}`, normalized once against the data. | Codex finding 6 |
| D7 | Tailwind 4 with tokens generated from `DESIGN.md` mapped onto shadcn variables (`--background`, `--foreground`, `--primary`, `--muted-foreground`, `--border`, `--radius`, …). One theme preference protocol (`localStorage.theme`: `auto \| light \| dark`) in `src/utils/theme.ts`, used by the public site and the admin. | review "one token set, one theme" |
| D8 | Inter variable font, self-hosted (`@fontsource-variable/inter`), Latin subset, `font-display: swap`; tabular figures for times, prices, distances. | nextdoor.company reference; Vercel guidelines |
| D9 | Playwright end-to-end tests for `/map` against a fixture database. | review: both session bugs were interaction bugs |
| D10 | Phone sheet is the shadcn Base UI Drawer, **non-modal**, snap points peek / half / full, with Expand and Collapse buttons kept for keyboards. | shadcn base drawer docs; DESIGN.md Sheet |
| D11 | Initial data ships in the page as boot JSON; the client does not refetch `/api/map` on load. | Codex perf 7 |

## Architecture

```
src/web/ui/                 shadcn Base UI components (generated, then owned) + components.json
src/web/map/
  model/                    pure: filters.ts (moved), selection.ts, url.ts (nuqs descriptor), group.ts
  components/               React: MapApp, FilterBar, ResultsPanel, ResultsSection, EventRow,
                            EventImage, VenueDetail, MobileSheet, MapCanvas, VenueMarker,
                            ClusterMarker, LocationDot, RadiusRing, EmptyState, ThemeToggle
  server.tsx                renders MapApp to HTML for GET /map (replaces page.ts + render.ts)
  client.tsx                hydrateRoot entry (replaces client/map.ts)
  queries.ts, api.ts, types.ts, tokens.ts, assets.ts   kept, adapted
src/utils/theme.ts          theme preference protocol shared by web and admin
e2e/                        Playwright specs + fixture server
```

Dependency rules stay as in `AGENTS.md`. `web` still never imports `admin` or
`ingestion`; `src/web/ui` is a web-only module. Update `.dependency-cruiser.json` and
`AGENTS.md` for the new folders.

## Rules for the implementer

- Read `AGENTS.md`, `DESIGN.md`, both review files and this plan before each slice.
- Look up every library API with the `ctx7` CLI (`npx ctx7@latest library …` then `docs …`)
  before using it. Pin exact versions in `package.json`.
- `DESIGN.md` changes first, then code. No value outside `DESIGN.md`.
- One commit per slice (or per sub-step if large), messages say what and why, ending with
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No em dashes anywhere.
- `bun run check` and `bun run e2e` pass at the end of every slice.
- Do not touch `src/ingestion/`. Admin changes are limited to S2.4 (theme protocol and tokens).
- Delete replaced code in the same slice (`render.ts`, `styles.ts`, `client/map.ts`,
  `page.ts`, old theme scripts). No two live renderers for one surface.
- After each slice, write a short note in `docs/plans/map-react-progress.md`: what changed,
  which IDs are done, screenshots taken, anything deferred and why.

## Slices and acceptance criteria

### S1. Correctness fixes in the pure layer and the e2e harness

- **S1.1** Map source links use the same URL check as the detail page (`publicSourceUrl`);
  a row with `javascript:` gets no source button. Test covers `/map` and `/api/map`.
- **S1.2** The listing's "Next 7 days" link covers today through today + 6 (IST). Test.
- **S1.3** Selection normalization (D6) as a pure function with tests: unknown venue or
  event drops to `none`; an event with a mismatched venue resolves to its real venue.
- **S1.4** `groupEvents` appends in place (no array copy per event). Existing tests pass.
- **S1.5** Playwright installed and pinned; `bun run e2e` starts a fixture server on a
  free port with a seeded SQLite file and runs specs headless. Baseline specs, written to
  pass after the migration: slider drag changes the radius label and the count; hovering a
  pin shows the venue line; collapsing a section survives a map pan; Back after selecting a
  venue returns to the list; a filter submit keeps `group`; a failed `/api/map` or tile
  load keeps the server list visible. Specs that need later slices are `test.fixme` with
  the slice ID, and S8 checks none remain.

### S2. DESIGN.md v2, tokens, font and the shared theme

- **S2.1** `DESIGN.md` gains: Inter (D8); a shadow scale (contact + ambient, alphas as
  numbers); a radius scale with the concentric rule (panel 24, card 16, thumb 12, pill full);
  motion tokens (fast 150 ms, base 250 ms, one ease-out curve); control height 36 px with a
  44 px hit area token; chrome layout (search and List/Map top-left, control column
  right edge, filters and count bottom-left, detail panel right with an empty state); the
  bundle budget, revised with a measured reason. Lint passes with 0 warnings.
- **S2.2** `tokens.ts` emits shadcn variables from `DESIGN.md` roles for light and dark,
  consumed through Tailwind 4 `@theme inline`. The no-hex-literal test now covers `src/web/ui`
  and `src/web/map/components`.
- **S2.3** Inter is self-hosted and served with long cache headers; no Google Fonts request.
- **S2.4** `src/utils/theme.ts` is the one theme protocol. Public pages and the admin both
  use it (admin keeps its `.dark` class as an output of the protocol). The favicon and brand
  colors come from one source. Duplicate theme code is deleted.

### S3. React results panel, server-rendered and hydrated

- **S3.1** `MapApp` renders on the server for `GET /map` with the boot snapshot (D11);
  with JavaScript off, the list, pills (as links and GET forms) and event links all work.
  Existing no-JS tests in `test/mapPage.test.ts` pass (moved to the new render if needed).
- **S3.2** The client hydrates without a mismatch warning, then switches the list to the
  viewport. No `innerHTML` assignment remains in `src/web/map`.
- **S3.3** `ResultsPanel` with Type / Day / Venue grouping (shadcn Toggle Group), sections
  as shadcn Accordion (multiple, open by default), collapse state in the reducer (D5),
  surviving map moves. `EventRow` and `EventImage` own their image error and poster state.
- **S3.4** `VenueDetail` and the expanded event keep focus on the activating row, link
  `aria-controls` to the expanded region, and return focus on close.
- **S3.5** Counts: the panel heading counts events in the unobscured viewport; the floating
  count counts all matches; one polite live region announces the settled viewport count
  after a move.

### S4. Filter bar and URL state

- **S4.1** nuqs descriptor (D4) replaces `parseFilters`/`toQuery` on server and client;
  the old functions are deleted. `free=1|true|on` still parse; only `1` is emitted.
- **S4.2** `FilterBar`: search (draft kept until submit), when presets (Toggle Group),
  Free, Filters popover (Type as a Combobox with emoji labels from `categoryLabel`, Area),
  Near me. Every control 36 px with a 44 px hit area (S2.1 token). Popover closes on Escape
  and outside click and returns focus.
- **S4.3** Near me is the D5 location union, with a pending state and `aria-pressed`. The
  distance Slider (shadcn) keeps 1 to 25 km, default 4, updates results on every frame
  (coalesced with `requestAnimationFrame`) and fits the camera on commit.
- **S4.4** One transition function owns URL changes; marker click, row click, form submit
  and Back/Forward all go through it, and camera and sheet effects derive from the
  resulting state (Codex finding 1).

### S5. Map, markers, sheet and lifecycle

- **S5.1** `MapCanvas` from mapcn (D3) with OpenFreeMap styles, the basemap repaint, theme
  switching that keeps only the latest request and keeps the old style on failure.
- **S5.2** `VenueMarker` keyed by venue id, updates in place (no stale label: the
  pin-label bug), cluster markers keyed by cluster id per source revision. Accessible name
  includes the next event's title, its category word and the event count.
- **S5.3** Declutter runs once per settled move: read all boxes, decide, then write a
  `data-hidden` attribute. No `!important`, no inline `visibility`.
- **S5.4** `LocationDot` and `RadiusRing` derive from the location state.
- **S5.5** `MobileSheet` is the non-modal Base UI Drawer (D10) with snap points, pointer
  cancel handled, Expand/Collapse buttons, safe-area padding; camera padding follows the
  settled sheet height.
- **S5.6** Startup has a timeout and a recoverable error state; the server list stays
  until the map is ready; a map `error` event shows the list fallback. Approximate venues
  never move the camera, on click or on reload.

### S6. Polish to DESIGN.md v2

- **S6.1** Chrome layout matches S2.1 at 1280×800 and 390×844, light and dark.
- **S6.2** Screenshot matrix for every state in `docs/map-states.md`, stored under
  `docs/screenshots/map-v2/`, with a difference table in the progress note.
- **S6.3** Bundle measured (main + worker + CSS, gzip) and within the S2.1 budget; `/`
  still loads no map JavaScript.
- **S6.4** Vercel guideline spot checks: no `transition: all`, `touch-action: manipulation`
  on controls, tabular numbers, visible focus everywhere, reduced motion honoured.

### S7. Listing and detail pages on the same components

- **S7.1** `/`, category and area pages and `/e/<id>` render server-side from React
  components using the shared tokens, Inter and the header/brand components. No client
  JavaScript on these pages except the theme toggle.
- **S7.2** Every existing `test/site.test.ts` behaviour still holds (feeds, JSON-LD, filters,
  sitemap). `pages.ts` string templates are deleted.
- **S7.3** "Map view" and "List view" carry the shared filters (category, area, free)
  across.

### S8. Verification gate (separate agent)

An independent reviewer (Codex, not the implementer) checks the finished branch against
this plan and the research:
- For every ID D1 to D11 and S1.1 to S7.3: pass, partial or fail, with evidence (file:line,
  test name, command output or screenshot path).
- Re-runs `bun run check`, `bun run e2e`, the bundle measurement and the screenshot matrix.
- Confirms deleted code is gone (`innerHTML` in `src/web/map`, `parseFilters`, `toQuery`,
  `render.ts`, `styles.ts`, `pages.ts` templates, duplicate theme code, `!important`).
- Confirms each library choice matches its decision and source, and lists any deviation
  with the recorded reason.
- Writes `docs/review/verification-<date>.md`. Any fail or unexplained partial goes back
  to the implementer as a fix list; S8 repeats until clean.

## Revisions after S8 round 1 (2026-10-11, orchestrator)

The verifier asked for formal rulings on three items rather than silent exceptions:

- **R1 (S1.3).** A known venue with an unknown event keeps the venue open. A shared link to
  an event that has ended should still land on its venue, not on an empty map. Unknown
  venue with no known event is still `none`; a real event with a mismatched venue still
  resolves to its host. S1.3 now reads this way.
- **R2 (S3.3, S4.2).** The when presets, Free and Group by are native links with
  `aria-current`, not shadcn Toggle Group. They must work without JavaScript and the
  Toggle Group cost first-load bytes for no behaviour. Accepted deviation; they must still
  meet the 44 px hit target and visible focus rules.
- **R3 (deletion gate, item 7).** `dangerouslySetInnerHTML` is allowed only for trusted
  static blocks rendered on the server: the theme boot script, JSON-LD and the generated
  token CSS. All of them go through one helper (`src/web/ui/rawBlock.tsx` or similar), and
  `test/mapSource.test.ts` fails on any other use under `src/web`. No interactive DOM is
  ever built from strings. `innerHTML`, `insertAdjacentHTML` and `!important` stay banned.
- **R4 (full sheet, item 4).** At the full detent the list keeps the results it had at half;
  it does not recompute "in view" from a map the sheet itself covers. The filter row stays
  above the full sheet (the full detent stops below it).
