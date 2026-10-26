# Events map brief

A `/map` page showing this week's listed Hyderabad events on a quiet, clean map. The
design reference is nextdoor.company: a muted light basemap, square tile markers with a
label instead of teardrop pins, floating rounded pill controls, and a detail card that
keeps the map visible.

Read `AGENTS.md`, `docs/data-model.md` (venue section and section 8),
`src/catalog/venue.ts`, `src/catalog/area.ts`, `src/web/index.ts`, `src/web/queries.ts`,
`src/web/pages.ts` and `src/web/schema.ts` first. Run `bun install` and `bun run check`
for the baseline.

Two other workers are active. One is building `src/admin/`, the other
`src/ingestion/agent/`. Do not touch either folder, and keep changes to
`src/ingestion/sync.ts` and `src/cli.ts` small, because both workers edit those files
too.

## What we measured (full sync of all 8 sources, 2026-10-10)

- Sources sent coordinates for 994 of 1,011 listed events. `resolveVenueId` in
  `catalog/venue.ts` already copies them onto the venue, so 314 of 320 venues have a point.
- 11 venues have a point outside Hyderabad: bad source data.
- 8 venues sit exactly on 17.3850, 78.4867, the generic "Hyderabad" point sources fall
  back to. That is a placeholder, not a location.
- 6 venues are pending, with no point at all.
- 163 listed events have `area = 'other'`.

So the coordinate work is a quality pass over about 25 venues, not a geocoding project.
Re-measure these numbers yourself on a fresh sync into a scratch DB (never `data/hydsocial.sqlite`).

## Step 1: coordinate quality

The venue is the only owner of where something is. The map reads `venue.lat/lng`.
`event.latitude/longitude` stay as raw source data.

Schema (additive, the existing `hasColumn` pattern in `catalog/schema.ts`):
- `venue.geocode_source TEXT`: `source | nominatim | google | area | manual`
- `venue.geocoded_at TEXT`
- `geocode_state` values: `pending | resolved | approximate | failed | manual`. Enforce
  them. SQLite cannot add a CHECK to an existing column, so either add a trigger that
  rejects other values, or validate in the one function that writes the column and test
  it. Say which you chose and why.

Rules, each in one function in `catalog/venue.ts` with tests:
- `inHyderabad(lat, lng)`: inside a bounding box around greater Hyderabad (start with
  17.2 to 17.7 N and 78.2 to 78.7 E, and check the 11 out-of-box venues against it).
- A point counts as missing when it is outside the box or equals the city-centre
  placeholder (17.3850, 78.4867, within about 50 m). `resolveVenueId` must not copy such
  a point onto a venue. Existing venues that hold one go back to `pending` in a
  backfill.
- Automation never overwrites a `manual` venue.

Area centres: add one lat/lng per slug in `AREAS`, kept next to the list in
`catalog/area.ts`. Use them for two things:
- a venue whose area is known but whose point is missing becomes `approximate` at its
  area centre, with `geocode_source = 'area'`
- a venue with a real point and `area = 'other'` gets the nearest area centre within
  a sensible radius (pick it and justify it), which should shrink the 163

Geocoding job: `bun run src/cli.ts geocode [--db] [--limit] [--dry-run]`, in
`src/ingestion/geocode/`:
- `geocoder.ts`: `interface Geocoder { name: string; geocode(query: string): Promise<{ lat: number; lng: number; placeId?: string } | null> }`
- `nominatim.ts`: the public Nominatim search API, scoped to Hyderabad
  (`viewbox` + `bounded=1`, `countrycodes=in`), our `USER_AGENT`, at most 1 request per
  second, results cached in memory for the run. Read the current Nominatim usage policy
  before writing it and follow it. The query is venue name plus address plus
  "Hyderabad".
- `runGeocode.ts`: takes the ordered geocoder list, processes `pending` and
  `approximate` venues, applies `inHyderabad`, records `geocode_source` and
  `geocoded_at`, and leaves `failed` when nothing works. `--dry-run` prints what it
  would change.
- No Google provider in this task. The interface must make adding one a single file.

Run the job once against your scratch DB and report the before/after counts for
exact, approximate, failed and missing, as a share of listed events.

## Step 2: map data

`GET /api/map?from=&to=` in `src/web/map/api.ts`. The default window is the next 7
days in IST, the same as the listing. It returns a GeoJSON FeatureCollection with one
feature per venue that has at least one row in `listable_event` in the window:

```json
{ "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [78.4392, 17.4165] },
  "properties": {
    "venueId": "...", "name": "...", "area": "banjara-hills",
    "precision": "exact",
    "events": [ { "id": "...", "publicId": "...", "title": "...", "startsAt": "...",
                  "category": "comedy", "priceMin": 499, "isFree": false } ] } }
```

- Read events only through `listable_event`. Venues with no usable point are left out,
  and the response says how many listed events were left out for that reason
  (`excludedNoLocation`).
- `precision` is `exact` for resolved/manual and `approximate` for approximate.
- Collapse multi-date runs the way the listing already does (`collapseRuns`).
- Keep it small: no descriptions. Report the response size for a full week.
- Tests against `memoryDb()`: muted, duplicate and delisted events never appear;
  approximate venues are flagged; venues outside the window are absent.

## Step 3: the map page

Route `/map` in the web route table. The server renders a usable page without
JavaScript: the filter pills as links and the event list grouped by venue. The map is
progressive enhancement on top.

Stack:
- MapLibre GL JS from npm, pinned exactly, bundled with `Bun.build` into a static asset
  that only `/map` loads. The listing pages must not load any of it. Report the bundle size.
- Tiles: OpenFreeMap (no key), starting from its Positron style. Override colours,
  labels and POI density for a quiet single-hue look. The style URL lives in one
  constant, so swapping providers is a one-line change.
- MapLibre's built-in GeoJSON clustering. No other map libraries.
- Plain TypeScript, no React on the public site. Pure logic (filtering, counts,
  distance sort, URL state) goes in `src/web/map/client/filters.ts` with `bun:test`
  tests. DOM and MapLibre glue go in `client/map.ts`.
- Visible OpenStreetMap and OpenFreeMap attribution. It is a licence requirement.

Design:
- Desktop: the map fills a rounded frame. Pills float at the top (search, Tonight, This
  weekend, Next 7 days, Free, Filters). A count pill ("143 events · 61 venues") sits at
  the bottom left. Selecting a venue opens a card on the right with its events, each
  linking to `/e/<publicId>`.
- Phone (under about 720 px): the map is full screen, with a bottom sheet listing the
  events in view at peek, half and full heights. Tapping a marker opens the sheet and
  never navigates away.
- Markers: one per venue, a rounded-square tile with a category glyph and a count
  badge when it has more than one event. Selected state is an accent ring. Approximate
  venues are a soft dashed circle labelled with the area ("~ Gachibowli"), never a
  precise pin. Clusters are a count bubble that zooms in on tap.
- Colour: a narrow palette. Category is shown by a glyph or label as well as by colour.
  Light and dark both work, with the basemap style switching with the theme.
- The list and the map stay in sync both ways through the venue id. The list shows what
  is in view and updates when panning stops.
- "Near me" asks for location only when tapped and sorts the list by distance. If
  permission is denied, the area filter does the same job (SPEC.md journey J3).
- Filter state and the selected venue live in the URL query, for example
  `/map?when=weekend&category=comedy&venue=<id>`.
- Respect `prefers-reduced-motion` (no fly-to animation).
- Add `/map` to the sitemap and link to it from the listing page header.

Not in scope: heatmaps, 3D buildings, satellite, a time-scrubber, Google Maps, an admin
venues page (that waits for the admin panel to merge), any change to listing pages
beyond the header link.

## Verification

- `bun run check` passes, with the new tests.
- Start `bun run serve` on the scratch DB. Open `/map` in a real browser at desktop
  and phone widths, in light and dark, and screenshot each. Confirm there are no console
  errors, clusters split on zoom, selecting a marker opens the card or sheet, filters
  update the map and list, and the URL round-trips on reload. Confirm `/` loads none of
  the map bundle. Report what you checked and attach the screenshot paths.
- `/map` with JavaScript disabled still lists the events.

## Commits and report

Commit in reviewable steps: coordinate rules and schema, the geocode job, the map API,
the page shell, the client. Match the repo's commit style, with no em dashes in commits
or docs. Update `AGENTS.md` (the module map, the `geocode` command, and the invariant
"the venue owns coordinates; nothing outside the Hyderabad box or on the city-centre
placeholder is ever shown as exact").

Final report: the coverage numbers before and after, the bundle and GeoJSON sizes,
pinned versions, the screenshots, `bun run check` summary, and anything left undone.
