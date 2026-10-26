# hydsocial

Bun + TypeScript + bun:sqlite aggregator of Hyderabad events. Sources are
fetched into SQLite by `sync`, then `serve` publishes the listing, JSON API and
calendar feeds from that file.

UI work on `/map` follows `DESIGN.md` (tokens in its front matter, rules in its
sections). Change `DESIGN.md` first, then the code.

## Commands

- `bun install`
- `bun run check`: typecheck (four projects), `bun run lint` (Biome lint and format), the DESIGN.md lint, unit tests and the dependency rule. The pre-commit hook runs it.
- `bun run lint`: `biome check .`. `bunx biome check --write .` applies formatting and safe fixes.
- Git hooks (lefthook, installed by `bun install`): pre-commit formats the staged files and runs `bun run check`; pre-push runs `bun run e2e`. Never bypass them with `--no-verify` or `LEFTHOOK=0` to get a commit through; fix the failure.
- Toolchain note: `bun run` puts `node_modules/.bin` first, which holds Bun 1.4.3 (installed as a peer of `bun-plugin-tailwind`), while a bare `bun` may be older. The two bundle the map differently (chunk splitting), so bundle sizes and the budget tests are measured under `bun run`; use `bun run check`, not `bun test`.
- `bun run e2e [specs]`: Playwright (headless Chromium) against a fixture server on a free port with a seeded SQLite file; the basemap is stubbed, so no network. Needs `bunx playwright install chromium` once. Specs live in `e2e/` (the same run also starts the admin on a second port). `SHOTS=<dir> SHOTS_LIVE=1 bun run e2e e2e/shots.spec.ts` takes the screenshot matrix with the real basemap; a spec that waits on a later migration slice is `test.fixme` with the slice ID.
- `bun run sync [--sources communitie,luma] [--db <path>]`
- `bun run serve [--port 3000] [--db <path>]`
- `bun run src/cli.ts geocode [--db <path>] [--limit n] [--dry-run]`: upgrade pending and approximate venues to a real point via Nominatim (1 request per 1.1 s).
- `bun run admin [--port 3001] [--db <path>]`: internal console (see `src/admin/`). Listens on 127.0.0.1. A non-loopback `ADMIN_HOST` is refused unless `ADMIN_TOKEN` is set, and then every request needs `Authorization: Bearer <token>`.

## Writing code here

These hold for every change. The checks below enforce most of them; the rest are review rules.

- **Read first.** This file, the module's code and its tests, and `DESIGN.md` for any UI work. For a library API, look it up with the `ctx7` CLI before writing the call; do not code from memory.
- **Dependencies.** Prefer what the platform, the stack or an installed package already does. A new package needs a reason; pin it to an exact version at least two weeks old (`bun add --exact`).
- **UI.** Change `DESIGN.md` first, then code; no colour, size, radius, shadow or duration outside it (tokens via `map/tokens.ts`). Components are React and render on the server; shadcn components live in `src/web/ui` (Base UI variant, copied from the registry with the source in the header). No DOM from strings: the only raw markup is `src/web/ui/rawBlock.tsx` for fixed server blocks.
- **State.** Shareable state (filters, grouping, selection) lives in the URL through the nuqs descriptor `src/web/map/model/url.ts`; session state in the reducer `src/web/map/model/state.ts`; component-local state stays in the component. Never in the DOM, never by writing history directly.
- **Pure first.** Logic that does not need the DOM or the database goes in a pure module with unit tests (`web/map/model`, `catalog`).
- **Types.** `strict` plus `noUncheckedIndexedAccess`. Narrow with a real check where a value can be missing; use `!` only where an invariant guarantees it, with a short comment naming the invariant when it is not obvious.
- **React effects.** Declare every dependency (Biome enforces it). A callback read inside an effect goes through `useEffectEvent`. A `biome-ignore` needs the reason on the same comment.
- **Bugs.** Reproduce first: a failing unit test, or an e2e spec for anything interactive, then the fix. Do not weaken or delete a test to make it pass.
- **Budget.** `/map` first load and on-demand chunks have byte limits in `DESIGN.md`, checked by `test/mapBundle.test.ts`. Measure before adding a dependency to the public bundle.
- **Done means.** `bun run check` and `bun run e2e` pass, and for UI work you have looked at the result in a browser at 1280×800 and 390×844, light and dark.
- **Writing.** Comments, commits and docs: plain sentences, no em dashes. Commit messages say what changed and why.

## Module map

- `src/cli.ts`: composition root. Opens the DB, calls `migrate`, dispatches sync, serve, mute, geocode, admin.
- `src/migrate.ts`: WAL pragma, then each module's `migrate` in order.
- `src/utils/`: FetchLike, USER_AGENT, sleep, IST time helpers, sqlite helpers, and the cross-surface design helpers: `theme.ts` (the one theme preference protocol, used by `web` and by `admin/ui`; the admin's pre-paint script is `bootScript("class")` injected into its shell by `admin/themeBoot.ts`, not a copy), `design.ts` (reads DESIGN.md's front matter), `brandMark.ts` (the logo mark, colors from DESIGN.md).
- `src/catalog/`: what an event and a venue are. Types, area (with area centres), category, venue (coordinate rules), dedupe, and the venue and event tables.
- `src/ingestion/`: sync run, source health, run tables, `sources/` (one file per source plus registry), and `geocode/` (the `Geocoder` interface, one file per provider, `runGeocode.ts`).
- `src/ingestion/agent/`: the `agent:grok` source. Opt-in, never delist on absence. A coding-agent CLI writes `events.jsonl` in `agent-runs/<syncRunId>-<harness>/` next to the `--db` file (the admin reads the same place); `verify.ts` re-fetches each record's page; `report.json` lists what was quarantined or rejected.
- `src/curation/`: mute rules and their table.
- `src/admin/`: internal console for running and debugging the pipeline. `api.ts` and `reasons.ts` are plain functions over the DB, `runs.ts` spawns syncs as child processes, `server.ts` routes and guards, `start.ts` serves the React and shadcn/ui frontend in `ui/` through Bun HTML imports. Only `cli.ts` imports it.
- `src/web/ui/`: `map.tsx` (mapcn's Map and markers, adapted, header names the source) and shadcn/ui Base UI components (`components.json`, `style: base-nova`; the admin keeps `radix-nova` in the root `components.json`), the public Tailwind entry `styles.css` (it maps the shadcn variables from `map/tokens.ts` and holds no values), and `lib/utils.ts`. `fonts.ts` in `web/` serves Inter.
- `src/web/site/`: the listing, category, area, venue and event pages as React components rendered to a string on the server (`Document.tsx` is the page shell, `Listing.tsx`, `Detail.tsx`, `Header.tsx`). They read the same DESIGN.md tokens as the map, the chrome in `web/ui/chrome.ts` and Inter. The only script is the theme toggle's (`web/theme.ts`); there is no client bundle. `web/pages.tsx` keeps the route handlers, the programmatic-route matcher and the JSON-LD; `web/viewLinks.ts` writes the List and Map links that carry category, area and free across.
- `src/web/map/model/`: pure map state shared by server and browser. `selection.ts` resolves the URL's raw `venue` and `event` once, in `MapApp` against what is shown (`none | venue | event`, a known venue with an unknown event keeps the venue), and defines `MapState`, the filters plus that Selection. `MapFilters` has no venue or event: components carry the Selection, links are built from a `MapState`, and `url.ts` writes it back as the URL's pair. `EventRow` takes a `RowContext` (`type | day | venue`).
- `src/web/`: everything the public sees. Routes, queries, HTML pages, JSON API, feeds, and the `listable_event` view. `web/map/` holds `/map` and `/api/map`: `model/` is pure logic shared by server and browser (`filters.ts`, `url.ts` the nuqs descriptor for the URL, `group.ts`, `selection.ts`, `state.ts` the session reducer, `format.ts`), `components/` is the React tree (`MapSlot` loads `MapCanvas` on demand; `MobileSheet` is the phone Drawer, its own chunk; `MapApp` reads the URL through nuqs, owns the session and issues camera commands derived from filter changes; `MapHeader` is the top row (brand, search, List / Map switch, theme) and `MapControls` the zoom, locate and compass column; the Filters popover and the distance slider are lazy chunks; `MapCanvas` holds MapLibre and renders markers as portals), `css/` is the map stylesheet, one file per surface (base, filters, panel, layout, markers, phone, sheet) written only with the generated DESIGN.md tokens, and `src/web/ui/rawBlock.tsx` is the only place a string becomes markup (fixed script and style blocks); `server.tsx` renders it to HTML for GET /map with the boot snapshot as JSON, `client.tsx` hydrates it, `basemap.ts` is the OpenFreeMap style, bundled on server start by `assets.ts` (production React) and loaded by `/map` only. There is no `innerHTML` in `web/map`; `test/mapSource.test.ts` fails if one appears.

## Dependency rule

Enforced by dependency-cruiser (`.dependency-cruiser.json`, `bun run deps`).

- `utils` imports nothing from the other modules.
- `catalog` imports `utils` only.
- `curation` imports `utils` and `catalog`.
- `ingestion` imports `catalog` and `utils`, never `web` or `curation`.
- `web` imports `catalog`, `curation` and `utils`, never `ingestion`.
- A file in `ingestion/sources/` imports `shared.ts` and `types.ts`, never another source.
- No cycles. Only `cli.ts` and `migrate.ts` may import across modules freely, and nothing imports them.
- `admin` imports `catalog`, `curation`, `utils` and, from `ingestion`, only `sources/registry.ts` and `schema.ts`. Never `web`. Nothing but `cli.ts` imports it. `admin/ui` imports `utils` and the types in `admin/api.ts` only.
- `web/ui` imports `utils` and itself only, so it stays a leaf any page can use.
- `test/`, `e2e/` and `bench/` are exempt.

Lint rules that guard architecture: `lint/no-html-strings.grit` (no string-built DOM in `src/web`), `lint/no-history-writes.grit` (nuqs owns the URL in `src/web/map`), and `noDangerouslySetInnerHtml` everywhere but `rawBlock.tsx`. Biome plugin `includes` need a `**/` prefix (they match absolute paths).

## Invariants

- An unhealthy or failed source never delists its rows (`ingestion/sync.ts`, `ingestion/health.ts`).
- Category and area are decided once at ingest and never re-parsed when serving (`ingestion/sync.ts`, `catalog/category.ts`, `catalog/area.ts`).
- Every public surface reads `listable_event`, never `event` directly (`web/schema.ts`).
- Agent output is published only after `ingestion/agent/verify.ts` finds every evidence quote on a page we fetched.
- The venue owns coordinates; nothing outside the Hyderabad box or on the city-centre placeholder is ever shown as exact (`catalog/venue.ts` `isUsablePoint`, `placeVenue`; the map reads `venue.lat/lng`, never `event.latitude/longitude`). Automation never overwrites a `manual` venue.
- The admin's only write handle touches `mute_rule`. Syncs it starts run in a child process (`admin/runs.ts`).
- `admin/reasons.ts` explains why an event is not in `listable_event`; `test/adminReasons.test.ts` fails if the view and the reasons disagree.
- `NOT_MUTED`, `countMuted` and the admin's mute reasons all use `RULE_MATCHES_EVENT` (`curation/mute.ts`).
- A new source is one file in `ingestion/sources/` plus one line in `registry.ts` plus a fixture test.
