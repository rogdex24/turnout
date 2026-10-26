# Research: Luma (lu.ma / luma.com) Hyderabad sync

Updated: 2026-09-08 IST

## Decision
Use **Luma** as the next Tier A adapter after Communitie + District (+ AllEvents).
Public unauthenticated JSON discover works for Hyderabad via **geo lat/lon**.
Hyderabad is **not** in Luma's featured `discover_place` city list (bootstrap
`places[]` has Bengaluru, Mumbai, New Delhi, … — no Hyd slug).

Townscript remains a later Tier A candidate if Luma volume stays thin.

## What works
1. **Geo discover** (preferred):
   `GET https://api.luma.com/discover/get-paginated-events?latitude=17.385&longitude=78.4867&pagination_limit=20`
   - No API key, cookies, or `x-luma-*` headers required.
   - Live snapshot 2026-09-08: **12** entries, all `city=Hyderabad`, `has_more=false`.
2. **Category + geo** also works, e.g. `slug=tech&latitude=…&longitude=…` (3 Hyd tech events in the same snapshot). Adapter uses plain geo so we get meetups beyond the tech category.
3. Hosts that respond equivalently today: `api.luma.com`, `api2.luma.com`, `api.lu.ma`. Adapter defaults to `api.luma.com`.
4. Pagination: `has_more` + `next_cursor` → pass as `pagination_cursor`.
5. Event URL is a bare slug on `event.url` → canonical `https://luma.com/{slug}`.
6. `start_at` / `end_at` are UTC ISO; `timezone` is display (usually `Asia/Kolkata`).
7. `ticket_info.is_free` / `price` available on list entries (no detail crawl required).

## What does not work cleanly
- No featured place slug / `discover_place_api_id` for Hyderabad.
- Anonymous free-text search (`/search/get-results`) requires auth (401).
- Address may be hidden until RSVP (`geo_address_info.full_address` null) while `city` remains.
- `pagination_limit` above ~20–50 is undocumented; we use 20 and paginate.

## Adapter shape
- `src/sources/luma.ts` + `lumaAdapter.ts`
- `source_event_id`: `event.api_id` (`evt-…`)
- `source_slot_id`: `startsAt` date (`YYYY-MM-DD`)
- Hyderabad filter on city / venue / address / title keywords
- Rate limit ≥ 1.1s between pages
- Failure isolation via existing multi-source sync

## Samples saved
- `.agent-runs/luma-bootstrap.json` — discover landing places (no Hyd)
- `.agent-runs/luma-geo.json` / `luma-geo-live.json` — geo discover pages
- `.agent-runs/luma-tech-hyd.json` — tech category + Hyd coords
- `.agent-runs/luma-geo-summary.json` — trimmed field summary
- `test/fixtures/luma-geo-page.json`, `luma-entry-sample.json`

## Cross-source dedupe
Still future. Primary uniqueness remains `(source, source_event_id, source_slot_id)`.
