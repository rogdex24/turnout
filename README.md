# hydsocial: Communitie → SQLite → public listing

Pipeline and public listing that fetch Hyderabad events from
[Communitie](https://communitie.in)'s public API and sync them into a local
SQLite database. The site is the Phase 1 public-listing slice plus Phase 2 feeds (JSON, ICS, JSON-LD, llms.txt), programmatic routes, thin §10.4 HTTP tools, venue table, and a data-driven sitemap.

## Requirements

- [Bun](https://bun.sh) >= 1.1 (uses built-in `bun:sqlite` and `bun:test`; no
  native addons to compile). Binary typically at `~/.bun/bin/bun`.

## Setup

```bash
bun install
bun run check   # typecheck, tests, module dependency rule
```

## Running a sync

```bash
bun run sync
```

This fetches every live, approved Hyderabad event from Communitie's paginated
search endpoint and upserts it into `data/hydsocial.sqlite` (created on first
run). Re-running is safe: it is the same idempotent upsert, not an append.

Override the database path:

```bash
bun run src/cli.ts sync --db /tmp/scratch.sqlite
```

Override the source city or API host (for pointing at a staging API, or a
future second city):

```bash
COMMUNITIE_CITY_SLUG=bengaluru COMMUNITIE_BASE_URL=https://api.communitie.in/api/v1 bun run sync
```

## Running the site

Run a sync first, then serve the local SQLite database:

```bash
bun run serve
```

Open `http://localhost:3000`. The listing defaults to the next seven days and
keeps its date, area, category and free filters in the URL. Event pages link to
their source and never expose delisted or duplicate rows.

### Public feeds (Phase 2)

```bash
curl 'http://localhost:3000/api/events?limit=50'
curl 'http://localhost:3000/api/events?area=gachibowli&category=comedy&free=true&max_price=500&from=2026-09-08&to=2026-09-14'
curl 'http://localhost:3000/api/events/<slug-or-id>'
curl 'http://localhost:3000/events.ics'     # next 30 days, listing-eligible
curl 'http://localhost:3000/feeds/comedy.ics'
curl 'http://localhost:3000/feeds/gachibowli.ics'
curl 'http://localhost:3000/e/<slug>.ics'   # single-event calendar
curl 'http://localhost:3000/tools/search_events?limit=10'
curl 'http://localhost:3000/tools/get_event?id=<slug>'
curl 'http://localhost:3000/tools/whats_on_this_weekend?area=gachibowli'
curl 'http://localhost:3000/tools/list_venues'
curl 'http://localhost:3000/tools/list_areas'
curl 'http://localhost:3000/this-weekend'
curl 'http://localhost:3000/today'
curl 'http://localhost:3000/tonight'
curl 'http://localhost:3000/hyderabad/gachibowli/this-weekend'
curl 'http://localhost:3000/v/gachibowli-arena'
curl 'http://localhost:3000/api/events?lat=17.44&lng=78.35&radius_km=5'
curl 'http://localhost:3000/sitemap.xml'
curl 'http://localhost:3000/llms.txt'
```

`GET /api/events` returns listing-eligible rows only (canonical, non-empty
venue) in the `docs/data-model.md` §10.1 shape. Filters match the HTML site
(`area`, `category`, `free`, `from`, `to`) plus `max_price`, `limit`
(default 50, max 200), and optional `lat`/`lng`/`radius_km` distance sort.
Detail pages emit `schema.org/Event` JSON-LD (omits `endDate` when end≤start; omits empty `streetAddress`). `robots.txt` and a real
`sitemap.xml` (programmatic + event URLs) are served. `/free`,
`/this-weekend`, `/today`, `/tonight`, `/in/{area}`, `/c/{category}`, and
their combinations are only linked when they have an event in the window that
their route renders, so the sitemap never points at a page that 404s. CORS is
open.

ICS dates are emitted with `TZID=Asia/Kolkata`, escaped and folded for calendar
clients. Category/area ICS: `GET /feeds/{category|area}.ics`. Thin HTTP tools matching
`data-model.md` §10.4 names: `search_events`, `get_event`,
`whats_on_this_weekend`, `list_venues`, `list_areas` (full MCP transport still
deferred). Programmatic HTML: `/this-weekend`, `/today`, `/tonight`, `/free`,
`/in|hyderabad/{area}`, `/c/{category}` (+ weekend / area×category), and
`/v/{venue-slug}`; empty
sets return 404. `/today` = Asia/Kolkata calendar day; `/tonight` = 17:00 IST
through end of day.

Sync + `migrate()` maintain a `venue` table and set `event.venue_id` from
`venue_name` (lat/lng from source coords when present — no paid geocode).
One-shot live backfill: `bun .agent-runs/backfill-venues.mjs`.

## Running tests

```bash
bun test
```

Tests run against fixtures in `test/fixtures/` (no network calls) and cover
normalization, dedupe, pagination, and full sync runs including multi-run
reconciliation, using an in-memory SQLite database (`bun:sqlite` + `bun:test`).

## What a sync run does

1. **Fetch.** Pages through `POST /customers/events/search` with
   `{citySlug, page, size}` until a short page signals the end, sleeping
   ~1.1s between requests. See `src/ingestion/sources/communitie.ts`.
2. **Store raw.** Every event's raw JSON is kept in `raw_payload`, tagged
   with the sync run that fetched it, so a normalization bug can be fixed by
   replaying stored payloads instead of re-fetching. Rows older than 30 days
   are pruned each run.
3. **Normalize.** Each Communitie event can have multiple venues
   (`timeSlots`) and each venue can have multiple dates (`scheduleSlots`);
   these are exploded into one occurrence row per (venue, date, time). Only
   `status: LIVE` and `approvalStatus: APPROVED` events are normalized;
   everything else, and any slot with no parseable date, is held rather than
   published with a placeholder. See `normalizeEvent` in `src/ingestion/sources/communitie.ts`.
4. **Upsert.** Each occurrence is upserted on
   `(source, source_event_id, source_slot_id)`, which is the primary,
   exact-key dedupe: the same Communitie occurrence can never be stored
   twice, no matter how many times the sync runs.
5. **Reconcile.** Any previously-active event not seen in the current run
   gets one strike (`missed_runs += 1`); a second consecutive miss flips it
   to `status = 'delisted'`. Rows are never deleted, matching
   `data-model.md`'s audit-trail requirement. See `reconcileStale` in
   `src/ingestion/sync.ts`.
6. **Dedupe (secondary, fuzzy).** Active events on the same calendar day, at
   the same normalized venue name, with similar-enough titles (Jaccard
   token-set similarity) are grouped into a `dedupe_group_id`, with the
   earliest-seen row marked `is_canonical`. This catches the same event
   re-submitted under a second Communitie listing id. See `src/catalog/dedupe.ts`.

## Data model

Each module owns its tables in a `schema.ts` (`catalog`, `ingestion`, `curation`; `web` owns the `listable_event` view), composed by `src/migrate.ts`. Core tables:

- `event` — one row per occurrence (venue + date + time), with optional
  `venue_id` pointing at `venue`.
- `venue` — resolved from `venue_name` on sync (`name_key` dedupe);
  geocode left `pending` / null unless source coords exist.
- `raw_payload` — raw source JSON per event per run.
- `sync_run` — one row per sync invocation, with fetch/create/update/delist
  counts and an error column if the run failed.

Prices are stored in rupees. Multi-source adapters live under `src/ingestion/sources/`.
See `docs/data-model.md` for the fuller Phase 2+ target shape.

## Research

See `docs/research-communitie-sync.md` for the upsert, reconciliation and
dedupe patterns this implementation follows, and why.
