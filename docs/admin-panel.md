# Admin panel brief

An internal console for running and debugging the pipeline: start a sync for a source,
watch it, see what it produced, browse every event in the database with the reason it is
or is not public, and manage mute rules. It is a thin UI over functions that already
exist. It adds no new pipeline behaviour.

Read `AGENTS.md`, `src/cli.ts`, `src/ingestion/sync.ts`, `src/ingestion/sources/registry.ts`,
`src/curation/mute.ts`, `src/web/schema.ts` and `src/web/index.ts` first. Run `bun install`
and `bun run check` for the baseline.

## Boundaries

- New module `src/admin/`. Add a dependency-cruiser rule: nothing outside `cli.ts` imports
  `src/admin/`. Admin may import `catalog`, `curation`, `ingestion` (the registry's source
  list and nothing that writes) and `utils`. It must not import `web` code; it may query
  the `listable_event` view in SQL.
- New command `bun run admin` (`cli.ts admin [--db path] [--port 3001]`), separate from
  `serve`. It binds to `127.0.0.1` only. If `ADMIN_HOST` is set to anything other than a
  loopback address, refuse to start unless `ADMIN_TOKEN` is also set, and then require
  `Authorization: Bearer <token>` on every request. Test both cases.
- The public `serve` command and `src/web/` stay exactly as they are.
- The admin's DB connection writes only `mute_rule`. Syncs run in a child process.

## Stack

Real shadcn/ui: React, Tailwind CSS v4, shadcn components, served by Bun's HTML imports in
`Bun.serve({ routes })`, with `bun-plugin-tailwind` registered in `bunfig.toml`. No Vite,
no Next.js, no separate dev server. Get current setup steps from the docs before writing
config:

```
npx ctx7@latest library Bun "fullstack dev server HTML imports React Tailwind bun-plugin-tailwind"
npx ctx7@latest library shadcn/ui "manual installation with Tailwind v4 and a custom bundler"
```

Then `npx ctx7@latest docs <id> "<same question>"` for each. Pin exact versions. Keep the
frontend under `src/admin/ui/` with its own `components/ui/` for the shadcn components
you actually use (add them with the shadcn CLI, do not hand-copy). Use the default neutral
theme with dark mode following the OS. The `@/` path alias, if shadcn needs it, must not
change how the rest of `src/` resolves.

Typecheck must cover the TSX. Keep `bun run check` as the single gate.

## JSON API (`src/admin/api.ts`)

Plain functions over the DB, each with a test against `memoryDb()`. Validate every query
parameter and request body at the boundary and return 400 with a message on bad input.

| Route | Returns |
|---|---|
| `GET /api/sources` | every registry adapter: `name`, `optIn`, and its last 7 `sync_run_source` rows (status, occurrences, missing_venue, error) |
| `GET /api/runs?limit=` | recent `sync_run` rows, newest first, with per-source rows |
| `GET /api/runs/:id` | one run, its per-source rows, and for each agent source the parsed `data/agent-runs/<runId>-<harness>/report.json` if it exists (shape in `docs/agent-harness.md`; tolerate it being absent) |
| `POST /api/runs` `{ sources: string[] }` | starts a sync; 202 with the run id; 409 if a `sync_run` is `running`; 400 for an unknown source name |
| `GET /api/events?…` | paged events. Filters: `source`, `status` (active, delisted), `visibility` (listed, hidden), `category`, `area`, `from`, `to`, `q` (title or venue substring), `page`, `pageSize` (max 200). Each row carries `listed: boolean` and `hiddenReasons: string[]` |
| `GET /api/events/:id` | the row, its `hiddenReasons`, the other members of its dedupe group, and the newest `raw_payload` body for its `source_event_id` |
| `GET /api/mutes`, `POST /api/mutes`, `DELETE /api/mutes/:id` | mute rules with the count each one hides; add takes `{ field, value, note? }` |

`hiddenReasons` is the main debugging feature. Derive it from the same conditions as
`listable_event`: `delisted`, `duplicate of <canonical id>`, `muted by <field>=<value>`,
`no venue` / `placeholder venue`. Do not write a second copy of the rule. Either put the
reason logic in SQL next to the view in one owner, or compute `listed` from the view and
explain the reasons with one function that has a test proving it agrees with the view for
every reason. The test must fail if someone changes the view without updating the reasons.

Fix while here: `countMuted` in `src/curation/mute.ts` matches muted events with its own
column list instead of `NOT_MUTED`. Make it derive from the same SQL so the two cannot
drift, with a test.

### Starting a run

`POST /api/runs` spawns `bun run src/cli.ts sync --db <same db> --sources a,b` as a
detached child (`Bun.spawn`), with stdout and stderr written to
`data/admin-runs/<timestamp>.log`. The run's own `sync_run` row is the source of truth for
status; the UI polls `GET /api/runs/:id`. To return the run id in the 202, either add a
`--run-id <uuid>` option to the sync command that `runSync` uses for its row, or return the
log path and let the UI find the newest run. Prefer `--run-id`; it is a small change to
`cli.ts` and `SyncOptions` with a test.

The 409 check reads `sync_run.status = 'running'`. Note that `runSync` marks runs stuck in
`running` over 6 hours as abandoned, so a crashed child cannot block the panel for ever.

## Pages

A left sidebar with Runs, Sources, Events, Mutes. All tables are shadcn data tables.

1. **Runs.** A "New run" control: pick one or more sources from `/api/sources`, opt-in
   ones grouped under "Agents". The table shows status badges (running, success, failed,
   abandoned), duration, fetched / created / updated / delisted. Running rows poll every
   2 seconds until they finish.
2. **Run detail.** Per-source table: status, items, occurrences, missing venue, health
   reason or error. For agent sources, tabs for Accepted, Quarantined, Rejected from
   `report.json`, each with its reason.
3. **Sources.** One row per source: last status, a small inline bar of occurrences over the
   last 7 runs, missing-venue share, and a "Run now" button.
4. **Events.** Filter bar for every filter above, with state kept in the URL query so a
   view can be shared. Columns: title, start (IST), venue, area, category, source,
   price, and a Listed / Hidden badge. Clicking a row opens a side sheet with the hidden
   reasons, dedupe group (links), source link, and the raw payload as formatted JSON.
5. **Mutes.** List with hidden counts, an add form, delete with an inline confirm (no
   browser `confirm()`).

Show times in Asia/Kolkata using `utils/time.ts` conventions. Empty states say what will
appear and how (for example "No runs yet. Start one with New run.").

## Tests

API functions and the run spawner get `bun:test` tests (the spawner with an injected
spawn function, so tests never start a real sync). The `hiddenReasons` agreement test and
the mute count test are required. No browser test framework; instead, after building,
start `bun run admin` against a DB built with `sync --sources communitie`, request every
API route with curl and check the status codes, and load each page once to confirm it
renders without console errors. Report what you checked.

## Out of scope

Editing events, deleting rows, triggering anything other than sync, auth beyond the
token, deployment, the agent harness itself (another worker is building it in
`src/ingestion/agent/`; do not touch that folder). If agent sources are not registered
yet, the Agents group in the run picker is simply empty.

## Commits and report

Commit in reviewable steps (API with tests, run spawner and `--run-id`, UI shell and
build, each page, the cruiser rule). Match the repo's commit style. No em dashes in
commits or docs. Update `AGENTS.md` with the module and the `bun run admin` command.

Final report: the routes and pages built, `bun run check` output summary, the curl and
page checks you ran, versions pinned, and anything left undone.
