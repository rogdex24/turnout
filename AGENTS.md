# hydsocial

Bun + TypeScript + bun:sqlite aggregator of Hyderabad events. Sources are
fetched into SQLite by `sync`, then `serve` publishes the listing, JSON API and
calendar feeds from that file.

UI work on `/map` follows `DESIGN.md` (tokens in its front matter, rules in its
sections). Change `DESIGN.md` first, then the code.

## Commands

- `bun install` (Bun workspaces, hoisted linker; `minimumReleaseAge` in `bunfig.toml` refuses versions younger than 14 days)
- `bun run check`: `check:server && check:mobile`. `check:server` is the typecheck (the four server projects, `packages/contract` and `apps/mobile`), `bun run lint` (Biome lint and format), the DESIGN.md lint, unit tests and the dependency rules (which cruise `apps/mobile` too). `check:mobile` is `lint:mobile` (ESLint in `apps/mobile`) and `test:mobile` (Jest). The pre-commit hook runs the two halves as the jobs `check-server` and `check-mobile`; the mobile one runs only when a staged file is under `apps/mobile`, `packages` or the root `package.json`.
- `bun run secrets:scan`: gitleaks over the working tree (`gitleaks dir --redact .`). The pre-commit hook also runs `gitleaks git --staged --redact` on what is staged.
- `bun run lint`: `biome check .` (it covers `apps/**` too). `bunx biome check --write .` applies formatting and safe fixes.
- Git hooks (lefthook, installed by `bun install`): pre-commit formats the staged files, runs `bun run check:server` (and `check:mobile` when a mobile file is staged) and scans the staged files with gitleaks; pre-push runs `bun run e2e` (the web e2e; the Maestro flows run in CI only). Never bypass them with `--no-verify` or `LEFTHOOK=0` to get a commit through; fix the failure.
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

## Workspaces

The root is still the server package. `apps/*` and `packages/*` are Bun workspaces (`workspaces` in `package.json`).

- `packages/contract` (`@turnout/contract`): Zod schemas and pure rules shared by the server and the app. Exists.
- `packages/design-tokens` (`@turnout/design-tokens`): data generated from `DESIGN.md`. Coming with the token pipeline.
- `apps/mobile`: the Expo app (SDK 58, Expo Router, Uniwind, React Compiler). Its own TypeScript project, ESLint and Jest; its stack is in `docs/plans/mobile-stack.md`, its accounts and CI in `docs/plans/mobile-accounts.md` and `mobile-ci-budget.md`.

### The mobile app

Run from `apps/mobile`: `bun run start` (needs a development build; there is no Expo Go), `bun run storybook` (the same with Storybook on), `bun run typecheck`, `bun run lint`, `bun run test`, `bun run doctor`, `bun run export` (Metro bundles both platforms; the quickest check that the app builds). `ios/` and `android/` are git-ignored: the native projects are generated by `expo prebuild` (CNG) and never edited by hand. A native change goes through a config plugin in `app.config.ts`.

- **Variants.** One `app.config.ts`, four variants chosen by `APP_VARIANT` (`development`, `e2e`, `preview`, `production`), each with its own bundle id and URL scheme so they install side by side. The rules are pure functions in `config/variants.ts` with tests. `EXPO_PUBLIC_API_URL` is required for `preview` and `production`; `e2e` points at the seeded server (`10.0.2.2` on Android, `localhost` on iOS). The Google Maps key comes from `GOOGLE_MAPS_ANDROID_API_KEY` (an EAS variable or the git-ignored `apps/mobile/.env.local`) and the config throws when it is missing for `preview` or `production`. A key never goes in a tracked file, and gitleaks scans for one.
- **Layout.** `src/app` is routes only (entry points) and each route file starts with `// Board: B<step>.<n>`. `src/ui` is the design system and app components, `src/ui/primitives` the vendored reusables, `src/ui/moments.ts` the haptic moments. `src/model` is pure logic with no React Native import. `src/api` is the client and the query cache, `src/copy` every user-facing string, `src/analytics` the typed events and Sentry, `src/screens/<screen>` the views per screen. Tests sit next to the code, but never under `src/app`, because Expo Router bundles every file there as a route (the router test is `src/router.test.tsx`).
- **Styling.** Uniwind with Tailwind 4: `className` on React Native components, tokens from `src/theme.css` (generated from `DESIGN.md` through `@turnout/design-tokens`). Class names must appear as whole literals so Tailwind can find them (a lookup table, not a template string). Dark mode follows the system; there is no in-app toggle. Jest has no Uniwind runtime, so a component test asserts the `className` prop, not pixels; pixels are the Storybook and visual-diff job.
- **No color literals.** `lint/no-color-literals.grit` fails Biome on a hex, `rgb()`, `hsl()` or `oklch()` string in `apps/mobile/src`. Use a token class (`bg-primary`) or `useColors()` from `src/ui/theme.ts`. A color is added to `DESIGN.md` first.
- **Haptics.** `expo-haptics` is imported only in `src/ui/moments.ts` (`haptics-only-in-moments`).
- **Copy.** Strings live in `src/copy`. `src/copy/copy.test.ts` fails on the banned words ("verified", "ID check", "KYC") and on guilt copy. A string that makes a safety claim is worded as what we do (we check a handle), never as an identity check.
- **Environment.** Read `process.env.EXPO_PUBLIC_*` by its full name only (`expo/no-dynamic-env-var`): Metro inlines it at build time, so `process.env[name]` is empty in a build.
- **React Compiler.** On for the app. ESLint (`apps/mobile/eslint.config.mjs`) runs the compiler rules and `expo/no-dynamic-env-var` only; formatting and everything else is Biome. Do not add `useMemo` or `useCallback` for speed; write plain components.
- **Storybook.** React Native Storybook 10 runs in the `development` and `e2e` variants only: the route `src/app/storybook.tsx` is gated by `EXPO_PUBLIC_STORYBOOK === "1"`, which is inlined, so a release bundle drops it (checked once at F16, 7.7 MB to 4.2 MB). `turnout-e2e://storybook?story=<id>` opens a story; the id is the lower-cased title and name joined by `--` (`screens-home--loaded`). `.rnstorybook/storybook.requires.ts` is generated by Metro and committed; do not edit it.
- **Flows.** `apps/mobile/.maestro` holds the Maestro flows and the visual capture (`.maestro/README.md`); the CI scripts that build and run them are `apps/mobile/ci` and `apps/mobile/.maestro/ci`. Visual baselines are Git LFS files (`docs/plans/mobile-visual-testing.md`); never commit a baseline from a developer machine.
- **EAS.** `apps/mobile/eas.json` has the profiles; `.easignore` is at the repo root (a monorepo's git root). No `eas build` runs from CI on a pull request, and only `eas-update.yml` and `eas-build.yml` use `EXPO_TOKEN`.

### The contract

- Zod only (pinned 4.6.6 in the package). No `bun:` or `node:` import, no import from `src/`, no runtime API. The package compiles with `types: []` and `lib: ["ES2022"]`, so a Bun, Node or DOM global is a type error.
- Files: `category.ts` (the vocabulary and classifier; `src/catalog/category.ts` re-exports it, import from `@turnout/contract/category` so the browser bundle never pulls in zod), `events.ts`, `profile.ts` (gender, group preference and the women-only rule, handle normalization), `ticket.ts` (proof kinds and file rules), `app/*.ts` per API area. Import a subpath, not the index, from code that ships to a browser.
- Every request schema is `.strict()`. Response schemas are not, so the server can add a field.
- Each enum and rule lives here once and both sides use it. The server vocabulary wins over any app name.
- A rule that both sides must apply (women-only, `normalizeHandle`, the ticket file check) goes here with a test in `test/contract.test.ts`.

## Module map

- `src/cli.ts`: composition root. Opens the DB, calls `migrate`, dispatches sync, serve, mute, geocode, admin.
- `src/migrate.ts`: WAL pragma, then each module's `migrate` in order (`social` last: its foreign keys point at `event` and `venue`).
- `src/social/`: the people tables and the DB layer over them (members, sessions, OTP challenges, profile, handle, rate buckets). `schema.ts` owns the tables. `model/` is pure: `tunables.ts` (every number the rules and rate limits use), `eligibility.ts` (`isEligible`), `handle.ts`, `matchable.ts`, `phone.ts`, `schedule.ts` (the T-24h, T-3h, T-90m and T-60m rules). No I/O in `model/`, and time comes in as an argument. Plans, tickets, groups, notices, devices, `operator.ts` (every operator write) and `tick.ts` (the ticker passes) sit beside the DB files.
- `src/app-api/`: the HTTP layer for the app, mounted at `/api/app/` by `cli.ts`. `index.ts` builds the `AppContext` (writable db, clock, env-derived config, senders, stores) and `appResponse`; `routes/` holds one file per area (plans, groups, notices, devices, files and the rest); `ticker.ts` runs the 30 s tick with a lease; `vendors/` holds the WhatsApp and push senders behind interfaces with fakes. Only `cli.ts` imports it.
- `src/utils/`: FetchLike, USER_AGENT, sleep, IST time helpers, sqlite helpers, `openDb.ts` (the one place a SQLite file is opened: WAL, `busy_timeout`, `foreign_keys`), `clock.ts` (`Clock`, `fixedClock`, `adjustableClock`: time is injected, never read inline), and the cross-surface design helpers: `theme.ts` (the one theme preference protocol, used by `web` and by `admin/ui`; the admin's pre-paint script is `bootScript("class")` injected into its shell by `admin/themeBoot.ts`, not a copy), `design.ts` (reads DESIGN.md's front matter), `brandMark.ts` (the logo mark, colors from DESIGN.md).
- `src/catalog/`: what an event and a venue are. Types, area (with area centres), category, venue (coordinate rules), dedupe, and the venue and event tables.
- `src/ingestion/`: sync run, source health, run tables, `sources/` (one file per source plus registry), and `geocode/` (the `Geocoder` interface, one file per provider, `runGeocode.ts`).
- `src/ingestion/agent/`: the `agent:grok` source. Opt-in, never delist on absence. A coding-agent CLI writes `events.jsonl` in `agent-runs/<syncRunId>-<harness>/` next to the `--db` file (the admin reads the same place); `verify.ts` re-fetches each record's page; `report.json` lists what was quarantined or rejected.
- `src/curation/`: mute rules and their table.
- `src/admin/`: internal console for running and debugging the pipeline. `api.ts` and `reasons.ts` are plain functions over the DB, `runs.ts` spawns syncs as child processes, `server.ts` routes and guards, `start.ts` serves the React and shadcn/ui frontend in `ui/` through Bun HTML imports. `files.ts` signs and checks the short-lived links the admin uses for ticket files and handle photos. Only `cli.ts` imports it.
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
- `packages/contract` imports itself and `zod` only (`contract-is-pure`). `packages/design-tokens` imports nothing outside itself (`design-tokens-is-data`). Nothing in `src/` imports `apps/` or `packages/design-tokens` (`src-not-to-apps`).
- `src/social/model` imports no `bun:`, `node:` or core module and nothing from the DB files of `src/social` (`social-model-pure`, `social-model-no-io`, `social-model-no-bun`). `src/social` imports no `web`, `admin`, `app-api`, `ingestion` or `curation` (`social-layer`). `src/app-api` imports no `web` or `admin` (`app-api-layer`) and only `cli.ts` imports `src/app-api` (`only-cli-imports-app-api`). `src/web` imports from `src/social` only `model/eligibility.ts` and `model/tunables.ts` (`web-reads-social-model-rules-only`), so `group_eligible` has one definition. `catalog`, `curation`, `ingestion` and `utils` never import `social` or `app-api`. `test/dependencyRules.test.ts` proves the rules fail on a bad import.
- Mobile rules, matched on `apps/mobile/src`: `app-not-to-server` (nothing in the app imports `src/`), `ui-is-a-leaf` (`src/ui` never imports `src/app`, `src/api` or `src/screens`), `model-is-pure` (`src/model` imports no React Native or Expo module), `routes-are-entry` (nothing imports from `src/app`), `haptics-only-in-moments` and `no-circular`.
- `bun run deps` cruises `src` and `packages`, then `apps/mobile/src` and `apps/mobile/config` with the app's own tsconfig (an absolute `--ts-config` path; a relative one fails with TS18003).
- `test/`, `e2e/` and `bench/` are exempt.

Lint rules that guard architecture: `lint/no-html-strings.grit` (no string-built DOM in `src/web`), `lint/no-history-writes.grit` (nuqs owns the URL in `src/web/map`), `lint/no-color-literals.grit` (no color strings in `apps/mobile/src`), and `noDangerouslySetInnerHtml` everywhere but `rawBlock.tsx`. Biome plugin `includes` need a `**/` prefix (they match absolute paths).

## Invariants

- An unhealthy or failed source never delists its rows (`ingestion/sync.ts`, `ingestion/health.ts`).
- Category and area are decided once at ingest and never re-parsed when serving (`ingestion/sync.ts`, `catalog/category.ts`, `catalog/area.ts`).
- Every public surface reads `listable_event`, never `event` directly (`web/schema.ts`).
- Agent output is published only after `ingestion/agent/verify.ts` finds every evidence quote on a page we fetched.
- The venue owns coordinates; nothing outside the Hyderabad box or on the city-centre placeholder is ever shown as exact (`catalog/venue.ts` `isUsablePoint`, `placeVenue`; the map reads `venue.lat/lng`, never `event.latitude/longitude`). Automation never overwrites a `manual` venue.
- The admin's write handle touches `mute_rule`, and, from M3, the social tables only through `src/social/operator.ts`, which writes an `operator_action` row for every change (amended 2026-10-26). Syncs it starts run in a child process (`admin/runs.ts`).
- `admin/reasons.ts` explains why an event is not in `listable_event`; `test/adminReasons.test.ts` fails if the view and the reasons disagree.
- `NOT_MUTED`, `countMuted` and the admin's mute reasons all use `RULE_MATCHES_EVENT` (`curation/mute.ts`).
- Every SQLite file is opened with `openDb` (`utils/openDb.ts`), so each handle has WAL, `busy_timeout = 5000` and `foreign_keys = ON`. Do not call `new Database` in `src` or `e2e`.
- Product code takes a `Clock` and never calls `new Date()` for "now". The ticker, the rate limits and the staging `__test/clock` route depend on it.
- A new source is one file in `ingestion/sources/` plus one line in `registry.ts` plus a fixture test.
- No co-member data (names, photos, handles, the meet card) leaves the server before T-3h of the show (`social/model/tunables.ts`).
- One 404 `not_found` for a thing that does not exist, is not yours, or is not yet visible. The three cases are never told apart (`app-api/errors.ts` `notFound`).
- A refresh token traded in is reuse and signs the member out everywhere, except for a retry inside `tunables.session.refreshGraceSeconds` (30 s) while its replacement is still unused (`app-api/sessions.ts`). The app must single-flight refresh (A1): one refresh in flight at a time, every caller waiting on it, and the new pair stored before the next call is made.
- No location is stored on the server. The app opens the cafe link on the device.
- No handle appears in any response to another member. Only the operator sees it (`packages/contract`, `test/contract.test.ts`).
- No secrets or personal data in the repo: no real phone, email, name or token in code, tests, docs or fixtures. `scripts/pii-scan.ts` and `test/noRealPhones.test.ts` enforce it; tests build a valid Indian number at run time (`test/appHelpers.ts` `indianMobile`).
- Every app route validates its body and query with a `.strict()` Zod schema from `@turnout/contract`; an unknown key is a 400 (`test/contract.test.ts`).
