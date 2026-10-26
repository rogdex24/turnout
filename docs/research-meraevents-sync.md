# Research: MeraEvents Hyderabad sync

Updated: 2026-09-08 IST

## Decision
Use **MeraEvents** as the next Tier A adapter after Townscript. Public
unauthenticated JSON listing works for Hyderabad; BookMyShow events vertical
was deferred (explore HTML blocked / no clean public JSON found in the same
pass; movies must stay out of Phase 1 per `docs/data-model.md` §6).

## What works
1. **Listing** (preferred):
   `GET https://api.meraevents.com/events?location=hyderabad&page=1&limit=50`
   - No API key or cookies required.
   - Live snapshot 2026-09-08: **28** events, `totalPages=1` at limit 50
     (or 2 pages at default ~20).
2. Response envelope:
   `{ events, totalCount, totalPages, currentPage, hasNextPage, hasPrevPage }`.
3. Event URL: `https://meraevents.com/events/{url}` (`url` field is the slug;
   `/event/{slug}` 308-redirects to `/events/{slug}`).
4. Times are already UTC ISO (`startDateTime` / `endDateTime` with `Z`).
5. Pricing: `minPrice` / `maxPrice` / `minPaidPrice` in INR rupees.
6. Venue: `venueName`, `venueAddress1`, `venueAddress2`, `latitude`, `longitude`.
   `cityName` is often null even on the Hyderabad feed — trust the location
   query plus venue/title heuristics.
7. `eventMode` is `offline` | `online`. Online-only with no venue is held
   (junk filter).

## What does not work cleanly
- HTML city page (`/location/hyderabad`) is a Next.js shell; prefer the API.
- Guessed `/api/v1/events` returns 404.
- BookMyShow explore page fetch was Auto-review / network hostile in this
  environment; revisit separately for events-only.

## Adapter shape
- `src/sources/meraEvents.ts` + `meraEventsAdapter.ts`
- `source_event_id`: `String(id)`
- `source_slot_id`: `startsAt` date (`YYYY-MM-DD`)
- Hyderabad filter on city / venue / address / title / slug; offline+venue
  accepted when `cityName` is null
- Rate limit ≥ 1.1s between pages
- Failure isolation via existing multi-source sync

## Samples saved
- `.agent-runs/mera-api3.json`, `mera-page1b.json`, `mera-page2.json`
- `test/fixtures/meraevents-page.json`, `meraevents-event-sample.json`

## Cross-source dedupe
Primary uniqueness remains `(source, source_event_id, source_slot_id)`.
Fuzzy pass groups across sources (and same-source resubmits with different
`source_event_id`) within 90 minutes; skips same-source multi-slot pairs.
