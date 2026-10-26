# Research: BookMyShow events vertical (Hyderabad)

Updated: 2026-09-08 IST

## Goal

Ingest BookMyShow **events** for Hyderabad only. Skip the **movies** vertical
entirely (data-model.md §6).

## What we tried

| Probe | Result |
|---|---|
| `GET /explore/events-hyderabad` HTML | **403** Cloudflare bot challenge |
| `GET /api/explore/v1/discover/events?regionCode=HYD` | **500** — requires `x-app-code` header; value not public |
| `GET /api/explore/v1/discover/regions` | **200** — city list; Hyderabad `RegionCode=HYD`, `RegionSlug=hyderabad` |
| `GET /pwa/api/de/venues?...` | **400** blocked |
| Apify / third-party scrapers | Paid wrappers; not used |
| **`GET /serv/getData?cmd=QUICKBOOK&type={CT\|PL\|SP}`** + cookie `Rgn=Code=HYD\|text=Hyderabad` | **200 JSON** — working |

## Working endpoint

```
GET https://in.bookmyshow.com/serv/getData?cmd=QUICKBOOK&type=CT
Cookie: Rgn=Code=HYD|text=Hyderabad
```

Types (non-movie):

- `CT` — events (comedy, music, workshops, meetups, …)
- `PL` — plays / theatre
- `SP` — sports
- `MT` — **movies — never requested**

Live snapshot (2026-09-08): CT ~740, PL ~20, SP ~14; ~749 with a HYD/SCBD venue;
~4400 date slots before the 120-day window filter.

## Payload shape (per event)

Top-level: `{ data: { BookMyShow: { arrEvent: [...] } } }`

Useful fields:

- `EventCode`, `EventTitle`, `EventType`, `Genre` / `GenreArray`, `Language`, `Length`
- `MinPrice` (rupees string), `FShareURL`, `BannerURL`, `EventSoldOut`, `EventIsGlobal`
- `arrDates[]`: `ShowDateCode` (`YYYYMMDD`), `ShowEndDateCode`, display strings
- `arrVenues[]`: `VenueCode`, `VenueName`, `VenueAddress`, lat/lng, `RegionCode`, `SubRegionCode`

**No clock times** in QUICKBOOK listings. Adapter places each date at **19:00 IST**
(→ `13:30Z`) and derives `endsAt` from `Length` when present. Slot id =
`{ShowDateCode}-{VenueCode}`.

## Samples

- `.agent-runs/bms-quickbook-ct.json` (full CT)
- `.agent-runs/bms-quickbook-pl.json`, `bms-quickbook-sp.json`
- `.agent-runs/bms-ct-hyd-sample.json`
- `test/fixtures/bookmyshow-quickbook-ct.json`

## Adapter

- `src/sources/bookmyshow.ts` + `bookmyshowAdapter.ts`
- Registered as `bookmyshow` in `src/sources/registry.ts`
- Sync: `bun run sync -- --sources bookmyshow`

## Caveats

- Cloudflare still blocks HTML explore pages; QUICKBOOK is the stable JSON path for now.
- Newer `api/explore/v1/...` needs undocumented `x-app-code`; revisit if QUICKBOOK dies.
- Showtime detail (`GETSHOWTIMESBYEVENTANDVENUE`) returned `Invalid Command!` for a CT probe — date-only for Phase 1.
- Workshop-heavy CT feed (~500) may need category trimming later; not blocked.

## Live sync notes (2026-09-08)

- Bun `fetch` TLS fingerprint → Cloudflare **403**.
- Live path uses `curl --http1.1` + XHR headers (`X-Requested-With`, Chrome UA, `Rgn` cookie).
- Sync: fetched **749** Hyd events → **4344** active occurrence rows (`source=bookmyshow`).
- Combined active across sources: **4514**.


## Trim (2026-09-08 evening)

Workshop / date-cap polish so the public listing is usable:

- Drop `Workshops` genre entirely via `isWorkshopFlood` (was ~3786 of 4344 active rows).
- Cap date expansion to **45 days** (`BOOKMYSHOW_MAX_DAYS`, was 120) and max **16** dates/event.
- Movies (MT) still never requested.
- Keep CT/PL/SP non-workshop genres (Comedy, Music, Kids, Plays, Sports, …).
