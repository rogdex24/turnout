# Map screen and state inventory

Written before any design-pass UI code. Every state the components in `DESIGN.md` list,
for the desktop card (720 px and up) and the phone sheet (under 720 px), what it shows
and how to reach it. `?state=` values preview the four states that data cannot trigger
on demand. Everything else is reachable by a URL or a pointer action.

URL parameters used by `/map`: `when`, `category`, `area`, `free`, `q`, `venue`
(a venue id), `event` (a public event id
that opens expanded; implies its venue), `state` (preview only).

| # | State | Desktop card | Phone sheet | How to reach it |
|---|---|---|---|---|
| 1 | Idle | Top row (brand, search, List / Map, theme), control column beside the card, filter row above the "N events · M venues" count bottom left, markers, card lists venues in view | Full-bleed map, top row (mark, search, List / Map, theme), scrolling filter row under it, control column at the right edge, sheet at peek (120 px): handle, "N events in view", one row | `/map` |
| 2 | Hover | Pill, tile and row lift or tint (tile up 2 px, pill `ink` 4% mix, row background) | Not applicable (touch); pressed state on rows and pills instead | Pointer over a control; in screenshots, Playwright `hover` |
| 3 | Focus | 2 px `primary` ring, 2 px offset on pill, tile, row, buttons | Same ring; keyboard detent buttons reachable | Tab through the page, or `:focus-visible` after a key press |
| 4 | Selected venue | Tile grows to 48 px with a 3 px `primary` ring and an always-on label chip; card shows back link, venue name, area and count, event rows | Same tile; sheet opens at half with the venue's rows | `?venue=<id>`, or tap a tile |
| 5 | Cluster | Up to 3 stacked tiles, "+N" badge, caption "N events"; tap zooms in | Same, 44 px hit area | `/map` at default zoom; zoom out |
| 6 | Approximate venue | No marker on the map; listed in the panel with "~ Gachibowli, exact spot not confirmed" | Same | `?venue=<venue id>` of an approximate venue, or its row in the list |
| 7 | Expanded event | One row open: 16:9 cover, title, meta, organiser block, "View on <source>", "Add to calendar", "Details" | Same inside the sheet at half or full | `?event=<publicId>`, or tap a row |
| 8 | With image | Thumbnail (56 px) in the row, cover in the expanded view; vertical posters contained over a blurred copy | Same | An event whose `image_url` is set (BookMyShow, Communitie, District, MeraEvents) |
| 9 | Without image | Neutral tint from the event id hash with the category glyph at 40% | Same | An event from AllEvents, Luma, Townscript or Growezy; or an image that fails to load |
| 10 | With organiser | Avatar (initials on a tint), name, trust line "N events this month · on M sources" | Same | An expanded event with `organiser_name` (Communitie `hostName`) |
| 11 | Without organiser | The block shows the venue instead, with the trust line for the venue | Same | Any expanded event without `organiser_name` |
| 12 | Loading | Skeleton tiles at 40 px on the map, skeleton rows in the card, at most 1.5 s | Skeleton rows in the peek sheet | `?state=loading`, or a slow `/api/map` |
| 13 | Empty | Map stays, card reads "No events match. Clear filters" with the action | Same in the sheet | `?state=empty`, or `?q=zzzz` |
| 14 | Error | Server-rendered list stays, one line says the map could not load | Same | `?state=error`, or `/api/map` failing, or WebGL unavailable |
| 15 | Location denied | Toast "Location is off. Pick an area instead", area filter opens | Same toast above the sheet | `?state=denied`, or tap "Near me" with permission refused |
| 16 | Rating (built, hidden) | Renders nothing | Renders nothing | No source sends a rating, so it never shows; a unit test proves it |
| 17 | Theme | Light and dark, basemap switches with the system theme | Same | `prefers-color-scheme`, or `[data-theme="dark"]` |
| 18 | No JavaScript | Server-rendered pills as links and the venue list; no map | Same | JavaScript disabled |

Screenshot matrix for verification: states 1, 4, 5, 6, 7 (with and without image, with and
without organiser), 12, 13, 14, 15, each at 1280 x 800 and 390 x 844, light and dark.
States 2 and 3 are shot on one control each.
