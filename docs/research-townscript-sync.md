# Research: Townscript Hyderabad sync

Updated: 2026-09-08 IST

## Decision
Use **Townscript** as the next Tier A adapter after Communitie + District +
AllEvents + Luma. Public unauthenticated JSON listing works for Hyderabad via
the Angular SPA's radar endpoint (HTML city pages are a JS shell only).

BookMyShow events vertical remains a later candidate; skip movies entirely
(`docs/data-model.md` §6).

## What works
1. **Radar listing** (preferred):
   `POST https://www.townscript.com/listings/event/radar?lat=17.385&lng=78.4867&radarDistance=50&page=0&size=24`
   - Body: `{}` (optional filters: `topicCode`, `catCode`, `keyword`, free/paid).
   - No API key or cookies required.
   - Live snapshot 2026-09-08: **55** events, `totalPages=2` at size 24
     (workshops, marathons, virtual runs, expos).
2. Response envelope: `{ status, data: { pageNumber, totalPages, totalCount, data: Event[] } }`.
3. Event URL: `https://www.townscript.com/e/{shortName}`.
4. Times are ISO-ish with `+0000` offset (`startTime` / `endTime`); adapter
   normalises to UTC `Z`.
5. Pricing: `minimumTicketPrice` (INR rupees, float) + `paid` boolean.
6. City pages (`/in/hyderabad`, `/in/hyderabad/free`) are Angular SPA shells —
   no SSR event HTML. Official partner APIs need auth tokens and are
   event-code scoped, not city discovery.

## What does not work cleanly
- Partner docs (`/api/eventdata/get`, `/api/bookingflow/eventPageData`) need
  Authorization and a known `eventCode` — useless for discovery.
- Guessed `/api/search/events` returns 401.
- Many "events" are long registration windows / virtual challenges whose
  `startTime` is months ago; adapter applies the shared Tier A junk window
  (`starts_at` within -1..400 days).
- `venueLocation` often null; `locality` + `city` still usable.

## Adapter shape
- `src/sources/townscript.ts` + `townscriptAdapter.ts`
- `source_event_id`: `String(eventId)`
- `source_slot_id`: `startsAt` date (`YYYY-MM-DD`)
- Hyderabad filter on city / locality / venue / address / title / shortName
- Rate limit ≥ 1.1s between pages
- Failure isolation via existing multi-source sync

## Samples saved
- `.agent-runs/townscript-radar-page0.json`, `townscript-radar-page1.json`
- `test/fixtures/townscript-radar-page.json`, `townscript-event-sample.json`

## Cross-source dedupe
Still future. Primary uniqueness remains `(source, source_event_id, source_slot_id)`.
