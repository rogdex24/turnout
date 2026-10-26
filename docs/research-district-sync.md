# Research: District (district.in) Hyderabad sync

Updated: 2026-09-08 IST

## Decision
Use **District** as the next Tier A adapter after Communitie. A public JSON
API is not documented, but the web app exposes enough structured public HTML
for a reliable Bun fetch + JSON-LD parse.

AllEvents was also started overnight (HTML + JSON-LD city listing) and remains
wired beside District. Luma has a clear `api2.luma.com` discover API, but
Hyderabad is **not** in the featured `discover_place_api_id` city list; geo
search around 17.385,78.487 works and is a later adapter.

## What works
1. **City listing pages** return `ItemList` JSON-LD of `Event` objects with
   `name`, `url`, `startDate`, `endDate`, `location` (incl. geo), and `offers`:
   - `https://www.district.in/events/upcoming-events-in-hyderabad`
   - `https://www.district.in/events/events-this-weekend-in-hyderabad`
2. **Event detail pages** expose full `schema.org/Event` JSON-LD (prices as
   AggregateOffer / Offer, description, performers).
3. **Public sitemap** `https://cdn.district.in/sitemap/event-detail-pages.xml`
   lists every event URL. Filtering locs containing `hyderabad` yields ~180
   Hyderabad-tagged detail URLs (snapshot 2026-09-08).

## What does not work cleanly
- `https://www.district.in/events?city=hyderabad` still geo-defaults the shell
  UI toward NCR for anonymous crawls; do not rely on it.
- No stable undocumented JSON gateway was reachable without browser session
  cookies (`api.district.in` / legacy `api.insider.in` did not resolve usefully).
- City listing ItemList sometimes includes touring leftovers whose venue city
  is not Hyderabad (e.g. FIFA friendlies). Adapter requires `hyderabad` in the
  URL, venue, or address before storage.

## Adapter shape
- `src/sources/district.ts` + `districtAdapter.ts`
- Primary ids: event slug from `/events/{slug}` as `source_event_id`
- `source_slot_id`: `startsAt` date (`YYYY-MM-DD`)
- Prices stored as District reports them (INR rupees), matching current
  Communitie/AllEvents practice in this repo
- Rate limit ≥ 1.1s between requests
- Failures on individual detail URLs are logged and skipped

## Samples saved
- `.agent-runs/district-upcoming-events-in-hyderabad.html`
- `.agent-runs/district-event-detail-sample.html`
- `.agent-runs/district-event-detail-pages.xml`
- `test/fixtures/district-*.html` / `district-event-detail-pages-snippet.xml`

## Cross-source dedupe
Still future. Primary uniqueness remains `(source, source_event_id, source_slot_id)`.
