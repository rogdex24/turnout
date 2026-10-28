# Data model, pipeline and output shapes

Companion to `SPEC.md`. Section numbers here are referenced from the spec and are
stable; do not renumber.

---

## 1. Conventions

- **Time.** All timestamps stored as UTC ISO 8601 with an explicit `Z`. All
  display and all date filtering happen in `Asia/Kolkata`. Never store a naive
  local time. "This weekend" means Friday 00:00 IST to Sunday 23:59 IST.
- **Money.** Stored as integer paise, not rupees, not floats. `price_min` of
  `50000` is 500 rupees. `is_free` is a separate boolean, not `price == 0`,
  because "free entry, pay for food" and "price unknown" are different states.
- **IDs.** ULIDs, lowercase, as `TEXT` primary keys. Sortable by creation time,
  no coordination needed, safe in URLs.
- **Enums.** Stored as lowercase kebab-case `TEXT` with a `CHECK` constraint.
  Never integers; readable rows are worth more than four bytes.
- **Nullability.** Only `id`, `title`, `starts_at`, `source_id`, `source_url` and
  `status` are non-null on `event`. Everything else is optional, because real
  sources are incomplete and holding an event back for a missing end time is
  worse than publishing without one.
- **Never delete.** Events that vanish from a source are marked
  `status = 'delisted'`, not removed. Deleting loses the audit trail and breaks
  already-shared links.

## 2. Digest issue (Phase 0 archive shape)

Phase 0 writes no code, but it must record issues in this shape so Phase 1 can
import them. A Google Sheet with these columns is sufficient. One row per pick,
seven rows per issue.

| Column | Type | Notes |
|---|---|---|
| `issue_week` | date | Monday of the digest week, `YYYY-MM-DD` |
| `pick_rank` | int | 1 to 7, the order in the post |
| `title` | text | As the operator wrote it, not as the source wrote it |
| `starts_at_local` | text | `YYYY-MM-DD HH:mm` in IST |
| `venue_name` | text | Free text in Phase 0, resolved to a venue in Phase 1 |
| `area` | enum | From section 4 |
| `category` | enum | From section 4 |
| `price_text` | text | `Free`, `₹500`, `₹500-1500` |
| `source_url` | url | Where the reader books or reads more |
| `editor_note` | text | The one sentence of opinion. Mandatory. |
| `published_at` | timestamp | When the Channel post actually went out |

`editor_note` is the whole point of the digest and the only column a machine can
never fill. If a pick has no note, it is not a pick.

## 3. `event`

The canonical entity. One row per real-world event occurrence.

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | text | no | ULID |
| `slug` | text | no | `{kebab-title}-{yyyy-mm-dd}-{id-suffix6}`, unique |
| `title` | text | no | Normalised, see section 8.1 |
| `description` | text | yes | Summarised to max 400 chars. Never a verbatim copy of the source. |
| `starts_at` | text | no | UTC ISO 8601 |
| `ends_at` | text | yes | |
| `is_all_day` | int | no | 0/1, default 0 |
| `recurrence_rule` | text | yes | RFC 5545 RRULE for weekly run clubs, open mics |
| `category` | text | no | Enum, section 4.2 |
| `tags` | text | yes | JSON array of free-form strings |
| `venue_id` | text | yes | FK `venue.id`. Null until resolved. |
| `venue_name_raw` | text | yes | Exactly as the source wrote it. Never overwritten. |
| `area` | text | yes | Enum, section 4.1. From venue when resolved, else inferred. |
| `is_free` | int | no | 0/1, default 0 |
| `price_min` | int | yes | Paise |
| `price_max` | int | yes | Paise |
| `currency` | text | no | `INR`, constant, present for feed correctness |
| `ticket_url` | text | yes | Where to book. Often equals `source_url`. |
| `source_id` | text | no | FK `source.id` |
| `source_event_id` | text | yes | The source's own ID. Unique with `source_id`. |
| `source_url` | text | no | Canonical link out. Always rendered. |
| `image_url` | text | yes | Our thumbnail, max 800px long edge |
| `image_attribution` | text | yes | Source name, rendered next to the image |
| `organizer_id` | text | yes | FK `organizer.id` |
| `languages` | text | yes | JSON array from `en`, `hi`, `te`, `ur` |
| `age_restriction` | int | yes | Minimum age, e.g. `18`, `21` |
| `status` | text | no | `published`, `held`, `delisted`, `cancelled`, `rejected` |
| `review_state` | text | no | `not-required`, `pending`, `approved`, `rejected` |
| `extraction_method` | text | no | `api`, `html`, `caption`, `vision`, `manual`, `submitted` |
| `confidence` | real | yes | 0 to 1. Null for `api` and `manual`. |
| `dedupe_group_id` | text | yes | Shared by duplicates, section 8 |
| `is_canonical` | int | no | 0/1. Exactly one per dedupe group. |
| `first_seen_at` | text | no | |
| `last_seen_at` | text | no | Updated every run the source still lists it |
| `updated_at` | text | no | |

**Status semantics.** `held` means we have the event but cannot show it (missing
or nonsense `starts_at`, unresolvable venue, failed review). `held` events never
appear on the site, in feeds, or in the sitemap. The Phase 1 definition of done
depends on this: broken data is held, never displayed with a placeholder.

**Indexes.** `(status, starts_at)` for the listing query, `(area, starts_at)`,
`(category, starts_at)`, `(dedupe_group_id)`, unique on
`(source_id, source_event_id)`, unique on `slug`.

## 4. Enums

### 4.1 `area`

Ordered roughly west to east, which also happens to be IT corridor first.

```
gachibowli, madhapur, hitec-city, kondapur, financial-district, nanakramguda,
kokapet, manikonda, tolichowki, jubilee-hills, banjara-hills, film-nagar,
somajiguda, begumpet, ameerpet, punjagutta, khairatabad, kukatpally, miyapur,
nizampet, bachupally, secunderabad, marredpally, kompally, alwal, uppal,
nacharam, lb-nagar, dilsukhnagar, old-city, charminar, mehdipatnam,
attapur, shamshabad, sangareddy, other
```

`other` is legal but is a smell. If more than 8% of published events are `other`,
the list needs extending. Track this as a pipeline metric.

### 4.2 `category`

```
music, comedy, theatre, art, film, food, market, sports, running, cycling,
tech, workshop, literature, kids, nightlife, community, festival, wellness,
heritage, other
```

`running` and `cycling` are separate from `sports` on purpose: run clubs are one
of the strongest recurring free-event categories in Hyderabad and deserve their
own filter and their own page. `heritage` covers Old City walks and Golconda
tours, which serve the migrant primary ICP specifically.

### 4.3 `extraction_method` and trust

| Method | Auto-publish | Review required |
|---|---|---|
| `api` | yes | no |
| `html` | yes | no |
| `submitted` | no | yes, always |
| `caption` | no | yes until measured accuracy exceeds 95% |
| `vision` | no | yes, always |
| `manual` | yes | no |

## 5. Supporting entities

### `venue`
| Field | Type | Notes |
|---|---|---|
| `id` | text | ULID |
| `name` | text | Canonical display name |
| `aliases` | text | JSON array. `Prism`, `Prism Club`, `Prism Club Hyderabad`. |
| `area` | text | Enum |
| `address` | text | Free text |
| `lat`, `lng` | real | Populated in Phase 2 |
| `google_place_id` | text | Stable key for re-geocoding |
| `geocode_state` | text | `pending`, `resolved`, `manual`, `failed` |
| `venue_type` | text | `cafe`, `club`, `auditorium`, `stadium`, `park`, `gallery`, `bookstore`, `co-working`, `outdoor`, `other` |
| `instagram_handle` | text | |
| `is_verified` | int | Operator or organiser confirmed the location |

Geocode **venues, not events**. Roughly 300 venues cover the large majority of
Hyderabad events, so the geocoding bill is paid once and the map is free
afterwards. Never geocode per event.

### `organizer`
`id`, `name`, `slug`, `instagram_handle`, `website`, `contact_email`,
`is_claimed`, `claimed_at`. Exists mainly so Phase 3 can hand an organiser a
public page worth sharing.

### `source`
`id`, `name`, `tier` (`a`, `b`, `c`), `type`, `base_url`, `fetch_method`,
`schedule`, `priority` (int, lower wins as canonical in dedupe), `enabled`,
`last_run_at`, `last_success_at`, `consecutive_failures`, `notes`.

Three consecutive failures set `enabled = 0` and notify the operator. A disabled
source does not fail the run.

### `raw_payload`
`id`, `source_id`, `fetched_at`, `url`, `body` (compressed), `content_hash`.
Keep 30 days. When a parser is wrong, the fix is replaying stored payloads, not
re-crawling and hoping the source still has the page.

### `digest_issue` and `digest_pick`
Mirror of section 2, populated by hand through a minimal admin form from Phase 2
onward. `digest_pick` carries `event_id`, `rank`, `editor_note`.

## 6. Source registry

Fetch schedule is deliberately modest. Events do not change minute to minute and
polite crawling is what keeps sources from blocking.

### Tier A: structured ticketing platforms
Cheap, reliable, and where coverage comes from on day one. Nobody chooses the
product for these, because they are already discoverable.

| Source | Method | Frequency | Notes |
|---|---|---|---|
| District (Zomato) | JSON endpoints behind the web app | 4x daily | Insider.in folded into District; do not build a separate Insider adapter without checking it still serves distinct inventory. |
| BookMyShow | JSON endpoints behind the web app, events vertical only | 4x daily | Skip the movies vertical entirely in Phase 1. Cinema listings are enormous, low value for the ICP, and would drown everything else. |
| AllEvents.in | HTML, Hyderabad city page | 2x daily | High spam rate. Needs an aggressive junk filter, see 6.1. |
| Townscript | HTML plus JSON, Hyderabad filter | 2x daily | Strong for workshops and marathons. |
| MeraEvents | HTML | daily | Locally strong, dated markup. |
| Luma (lu.ma) | Public discover pages | 2x daily | Best single source for tech and startup meetups. |
| Meetup | Official API | daily | Low volume in India, but the API is free and stable. |

Minimum for the Phase 1 gate: six of these seven working.

### Tier B: venue and institution sites
Medium effort, medium value. Phase 2 onwards.

Ravindra Bharathi, Shilpakala Vedika, Lamakaan, Phoenix Arena, Prism, Hard Rock
Cafe Hyderabad, Heart Cup, Krishnakriti and similar festival sites, Goethe-Zentrum,
Alliance Française Hyderabad, State Gallery of Art, Salar Jung Museum, university
fest microsites (BITS, IIIT, HCU, Osmania).

### Tier C: Instagram long tail
Highest effort, and the only tier that makes the product hard to copy. Phase 3.

Roughly 40 accounts across: cafes running open mics, comedy producers, flea
market and pop-up organisers, run and cycling clubs, indie music promoters,
board game and chess collectives, book clubs, art spaces, and the established
Hyderabad city pages. The account list lives in `config/instagram-accounts.json`
with a `tier`, `expected_post_rate` and `last_success_at` per account, so a
silently dead account is visible rather than invisible.

### 6.1 Junk filter (applies to Tier A HTML sources)
Reject before storage when any of these hold:
- Title matches known spam patterns: astrology, "make money", "admission open",
  "distance MBA", webinar-with-certificate listings, or the same title posted at
  more than 12 distinct venues.
- The event is online-only with no Hyderabad venue.
- `starts_at` is more than 400 days in the future or in the past.
- The organiser has more than 50 listings in a single week.

## 7. Pipeline

Stages, in order. Each stage is a pure function over the previous stage's output
so any stage can be replayed from `raw_payload`.

1. **fetch.** Per-source adapter, rate limited to 1 request per second, honest
   user agent with a contact URL, stores `raw_payload`. Skips on unchanged
   `content_hash`.
2. **parse.** Source payload to `RawEvent`. No normalisation, no judgement.
   Parser errors are recorded per record, not thrown for the run.
3. **normalise.** Dates to UTC from IST, prices to paise, category mapped through
   a per-source lookup, `is_free` derived, title cleaned per 8.1, description
   summarised to 400 chars.
4. **resolve venue.** Match `venue_name_raw` against `venue.name` and
   `venue.aliases` (case-folded, punctuation-stripped, then trigram similarity
   above 0.88). No match creates a `venue` row with `geocode_state = 'pending'`.
5. **dedupe.** Section 8.
6. **review.** Phase 3 only. Rows with `review_state = 'pending'` stop here.
7. **store.** Upsert on `(source_id, source_event_id)`. Bump `last_seen_at`. Any
   event not seen for two consecutive runs on a source that succeeded gets
   `status = 'delisted'`.
8. **publish.** Recompute the ISR pages, sitemap, JSON feed and ICS feeds.

Run budget: under 10 minutes end to end. If it exceeds that, the fix is fetching
fewer pages, not adding concurrency.

## 8. Deduplication

The single most important correctness problem in the product. One comedy show
appears on District, BookMyShow, AllEvents, the venue's Instagram and the
comedian's Instagram. Rendering it five times makes the site look broken and the
visitor does not come back.

### 8.1 Title normalisation
Before any comparison, lowercase, strip punctuation and emoji, collapse
whitespace, and remove these noise patterns:
- Promoter framing: `presents`, `present`, `in association with`, `powered by`,
  `feat.`, `ft.`, `live in concert`, `live in hyderabad`, `hyderabad edition`
- Date and time fragments embedded in the title
- Venue name if it appears in the title and matches the venue field
- Trailing `| Hyderabad`, `- Hyderabad`, `@ <venue>`

### 8.2 Matching, in order
1. **Exact source match.** Same `(source_id, source_event_id)` is an update, not
   a duplicate. Handled at upsert.
2. **Strong match.** Same resolved `venue_id`, `starts_at` within 90 minutes, and
   normalised title similarity (Jaro-Winkler) at or above 0.82. Same group.
3. **Venue-name fallback.** When `venue_id` is unresolved on either side, require
   venue name similarity at or above 0.85 plus the same conditions as 2.
4. **Embedding fallback.** For titles that differ in wording but not meaning
   (`Kenny Sebastian Live` vs `Non Biological Kenny Sebastian`), embed
   `"{title} | {venue} | {date}"` and group at cosine similarity at or above
   0.90, constrained to the same calendar day and the same venue. Embeddings are
   computed once per event and stored as a blob on the row. No vector database.
5. Everything else is distinct.

### 8.3 Canonical selection
Within a dedupe group, the canonical record is the one from the source with the
lowest `source.priority`, tie-broken by field completeness (count of non-null
optional fields), then by earliest `first_seen_at`.

Non-canonical rows stay in the database. Their `ticket_url` values are collected
onto the canonical event as `alternate_ticket_urls`, so an event booked on three
platforms shows three ways to book without showing three events.

### 8.4 Acceptance
Manual audit of 100 random published events in a week finds fewer than 5 visible
duplicates. Run this audit before declaring Phase 1 done, and monthly after.

## 9. Instagram and vision extraction (Phase 3)

**Do not use OCR.** Tesseract fails on event posters: stylised type, text over
photography, low contrast, mixed scripts. Send the image to a vision model and
ask for structured output directly. One call, better accuracy, less code.

Order of attempts per post, stopping at the first success:
1. **Caption parse.** Most organisers put the date, time and venue in the
   caption. Cheapest path, no image cost, `extraction_method = 'caption'`.
2. **Vision extraction.** Send the image with a strict JSON schema.
   `extraction_method = 'vision'`.
3. **Discard.** Not every post is an event. Most are not.

Extraction output schema:

```json
{
  "is_event": true,
  "title": "string",
  "starts_at_local": "YYYY-MM-DD HH:mm or null",
  "ends_at_local": "YYYY-MM-DD HH:mm or null",
  "venue_name": "string or null",
  "area_hint": "string or null",
  "price_text": "string or null",
  "is_free": true,
  "category": "one of the section 4.2 enum values",
  "ticket_url": "string or null",
  "languages": ["en"],
  "field_confidence": { "starts_at_local": 0.0, "venue_name": 0.0 },
  "overall_confidence": 0.0
}
```

Rules:
- The model must return `null` rather than guess. Say so explicitly in the
  prompt and reject responses that invent a year not present in the image.
- An event with no resolvable `starts_at_local` is discarded, not held. A poster
  without a date is not usable.
- Anything with `overall_confidence` below 0.75 is discarded before it reaches
  the review queue, to keep the queue under ten minutes a day.
- Everything surviving goes to `review_state = 'pending'`. Model output is never
  auto-published. This is not a temporary caution; it is the design.
- Volume estimate: 40 accounts, roughly 5 posts a week each, so about 200 images
  a week. At current small-model vision pricing this is a few tens of rupees a
  month. Do not architect around this cost.

## 10. Output shapes

### 10.1 JSON endpoint
`GET /api/events` with query parameters, all optional and combinable:
`from`, `to` (ISO dates, IST), `area`, `category`, `free` (bool),
`max_price` (rupees), `lat`, `lng`, `radius_km`, `group_eligible` (`1` keeps only
shows a group can be made for), `limit` (default 50, max 200), `cursor`.

```json
{
  "generated_at": "2026-09-08T12:00:00Z",
  "timezone": "Asia/Kolkata",
  "city": "Hyderabad",
  "count": 50,
  "next_cursor": "01J8...",
  "events": [{
    "id": "01j8x...",
    "url": "https://example.com/e/open-mic-lamakaan-2026-09-12-x7f9k2",
    "title": "Open Mic at Lamakaan",
    "starts_at": "2026-09-12T13:30:00Z",
    "starts_at_local": "2026-09-12T19:00:00+05:30",
    "ends_at": null,
    "category": "comedy",
    "venue": {
      "name": "Lamakaan",
      "area": "banjara-hills",
      "lat": 17.4165, "lng": 78.4392
    },
    "is_free": true,
    "price_min": null, "price_max": null, "currency": "INR",
    "source": { "name": "Instagram", "url": "https://..." },
    "ticket_url": null,
    "image_url": "https://.../thumb.jpg",
    "group_eligible": true
  }]
}
```

No API key, no rate limit beyond basic abuse protection, CORS open. The point is
to be quoted, including by AI assistants. `next_cursor` is null on the last page.

`group_eligible` is true when a group can be made for the show now: comedy, music or
theatre, not free, from ₹499, a real start time, a placed venue, and more than 24 hours
away (exactly 24 hours is already closed). The rule is `src/social/model/eligibility.ts`.

`GET /api/events/{id}` returns one event with `alternate_ticket_urls` and the
full description.

### 10.2 ICS
- `/events.ics` all published events in the next 30 days
- `/feeds/{category}.ics`
- `/feeds/{area}.ics`
- `/e/{slug}.ics` one event, for the "add to calendar" button

Each `VEVENT` carries `UID` (our event id plus domain), `DTSTART`/`DTEND` with
`TZID=Asia/Kolkata`, `SUMMARY`, `LOCATION` (venue name and address),
`GEO` when known, `URL` pointing at our event page, and `DESCRIPTION` ending with
the source link. Text is RFC-escaped and folded; missing or invalid end times
use a two-hour calendar duration. Recurring events use `RRULE` from
`recurrence_rule` rather than a materialised row per occurrence.

### 10.3 `schema.org/Event` JSON-LD
On every event page. Required fields, because Google's events results reject
partial markup: `name`, `startDate` (with offset), `endDate` when known,
`eventStatus`, `eventAttendanceMode` (`OfflineEventAttendanceMode`), `location`
as a `Place` with a nested `PostalAddress` including `addressLocality:
"Hyderabad"`, `addressRegion: "TS"`, `addressCountry: "IN"`, `image`,
`description`, `offers` with `price`, `priceCurrency: "INR"`, `availability` and
`url`, plus `organizer` and `performer` when known.

Validate against the Rich Results test before declaring Phase 2 done. Do not emit
JSON-LD for `held` or `delisted` events.

### 10.4 HTTP tools

Transport: HTTP, no auth. These are thin `GET /tools/{name}` endpoints while a
full MCP SDK transport remains deferred; their names and response contracts are
the MCP-tool surface:

| Tool | Arguments | Returns |
|---|---|---|
| `search_events` | `from`, `to`, `area`, `category`, `free`, `max_price`, `near` (lat/lng/radius), `limit` | Same event shape as 10.1 |
| `get_event` | `id` or `slug` | One full event |
| `whats_on_this_weekend` | `area` optional | Next Friday to Sunday, ranked by our own ordering |
| `list_venues` | `area` optional | Venues with coordinates and upcoming event counts |
| `list_areas` | none | The area enum with human labels and event counts |

Every returned event includes `source.url`. If an assistant repeats our data, we
want the attribution to travel with it.

### 10.5 `llms.txt`
At the root. Names the city and the timezone, states that data is aggregated and
links to sources, documents the JSON endpoint and the MCP URL with one worked
example each, and states the attribution request in one line. Keep it under 60
lines; it is a pointer, not a manual.

### 10.6 WhatsApp Channel digest
Plain text. No markdown, no formatting that WhatsApp will render as literal
asterisks in the wrong place. Constraints: the first three picks must be readable
before WhatsApp truncates with "read more", which in practice means the header
plus first three picks stay under roughly 500 characters.

```
Kya Scene · 12–14 Sep

1. Open Mic at Lamakaan
Fri 7pm · Banjara Hills · Free
Small room, gets full by 7.15. Turn up early.
<link>

2. ...

Full list, filter by your area: <site link>
```

Rules: seven picks, one editor note each, area and price always visible, the
site link once at the end and never in the middle. Never automate the note.

### 10.7 Instagram carousel
Slide 1 is the week's dates and a count. Slides 2 to 8 are one pick each: title,
day and time, area, price. Slide 9 is the call to action. Caption repeats all
seven as text, because Instagram search reads captions and images are invisible
to it. Poster images are used only with attribution, at thumbnail size, and never
regenerated or altered by a model.

## 11. Programmatic page routes (Phase 2)

Event details carry JSON-LD. Listing routes are server-rendered from the
database and enter the sitemap only when their own query has at least one
listing-eligible event; otherwise they return 404. Their marginal cost is close
to zero without creating crawlable empty pages.

```
/                                  next 7 days, all areas
/this-weekend                      Fri–Sun
/today  /tonight
/free                              is_free = 1
/c/{category}                      e.g. /c/comedy
/c/{category}/this-weekend
/in/{area}                         e.g. /in/gachibowli
/in/{area}/this-weekend
/in/{area}/c/{category}            the highest-intent combination
/v/{venue-slug}                    all upcoming at one resolved venue
/o/{organizer-slug}                shareable, the Phase 3 outreach asset
/e/{event-slug}                    event detail
/map                               Phase 2, after distance sort ships
/archive/{yyyy}/week-{ww}          past digest issues, for the long tail
```

Titles follow the pattern real searches use: "Comedy shows in Gachibowli this
weekend", "Free events in Hyderabad today". Do not generate a page that would
have zero events; return 404 or redirect to the parent, because empty pages
attract a thin-content penalty and waste crawl budget. Venue slugs derive from
the normalized venue name and are only added to the sitemap when that venue has
an eligible future event.

## 12. Migrations and testing

- Plain numbered SQL migration files, applied in order, forward only. No
  down-migrations; on a project this size a mistake is fixed with a new forward
  migration.
- Every source adapter ships with a recorded fixture of a real payload and a
  test asserting the parsed `RawEvent` output. Fixtures are refreshed when a
  parser breaks, and the broken fixture is kept as a regression case.
- Dedupe has a fixture set of known-duplicate clusters drawn from real data,
  including at least one cluster spanning three sources and one near-miss pair
  that must **not** group (same venue and night, two different shows).
- Normalisation has property tests for the date parsing, since Indian event
  listings use `12th Sep`, `12/09`, `Sep 12, 7 PM onwards` and `Friday 7pm` in
  roughly equal measure.

## 13. Social (Turnout, from M2; plans and groups from M3)

The people tables live in `src/social/schema.ts`, migrated last by `src/migrate.ts`. They follow section 1
(ISO UTC `Z` times, lowercase ULID ids, `CHECK` enums) with one difference: `rate_bucket.window_start` is epoch
seconds. Foreign keys are enforced (`openDb` turns `foreign_keys` on), so erasing a member is: delete the child
rows, then reduce `member` to a tombstone (`status = 'deleted'`, `phone_e164` null). `consent_record` has no
cascade: it outlives the member under the tombstone id for a year.

`docs/data-map.md` lists every column with its purpose, who sees it and how long it is kept. A test fails when a
column is added to a table here and not there.

| Table | Holds | Kept |
| --- | --- | --- |
| `member` | ULID id, `phone_e164` unique, `status` (`active`, `suspended`, `stopped`, `banned`, `deleted`), reason, times | Until deletion, then a tombstone |
| `auth_session` | Refresh token hash (never the token), expiry, `revoked_at`, `replaced_by`, `replaced_at` | Until expiry or sign-out; revoked or rotated rows 7 days |
| `otp_challenge` | `phone_hash`, purpose (`sign_in`, `delete_account`), `code_hmac`, attempts, expiry, `wamid`, `delivery_status` | 1 day; no code and no raw phone |
| `profile` | `first_name`, `gender`, `group_pref`, `photo_key` | Until deletion |
| `social_handle` | `kind`, normalised handle, `status` (`pending`, `approved`, `rejected`), `reject_reason`, review fields, `submissions_today` and `submissions_day` | Until deletion or ban |
| `consent_record` | Notice version, purpose, given and withdrawn times | 1 year after the account ends, under the tombstone id |
| `rate_bucket` | Keyed-hash key, window, count | One window (the `otp:sends` counter: 62 days, for the monthly spend alert) |
| `start_override` | `event_id` (one row per show), the operator's confirmed `starts_at`, who and when | While the show exists |
| `show_group` | Event, `starts_at` snapshot, `group_type`, `state` (`confirmed`, `locked`, `live`, `done`, `called_off`, `dissolved`), the cafe, `meet_at`, state times. No personal data | `done`, `called_off` and `dissolved` rows are kept for counts |
| `plan` | Member, event, `dedupe_key`, `group_type`, `state` (the plan state machine), `reason`, a snapshot of the show (title, start, venue name and point), `group_id` | Until deletion; an ended plan keeps no ticket file |
| `ticket_proof` | `plan_id`, `object_key` (never returned by an app route), `mime`, `bytes`, `sha256`, `status`, `reject_reason`, review fields, `file_deleted_at` | The file: until review ends or 24 h after the show starts. The row: until the plan is deleted |
| `group_member` | Group, member, plan, the opaque `member_ref`, `joined_at`, `left_at`, `checked_in_at` | Until deletion |
| `device` | Member, the session that registered it, `expo_token` (unique), `platform`, `disabled_at` | Until sign-out, a failed receipt or deletion |
| `notice` | ULID id, member, `kind`, plan, group, a unique `dedupe_key`, `read_at`, `stale_after`, `push_state` | 30 days |
| `push_delivery` | Notice, device, the Expo ticket id, `status`, `error_code`, receipt time | 30 days |
| `operator_action` | Action name, subject type and id, short detail, time | 1 year |
| `scheduler_lease` | Lease name, holder, expiry, last tick | One row per lease |
| `alert_sent` | Alert key, time | 30 days |

Rules the schema encodes:

- A member without a phone must be a tombstone (`CHECK`).
- A handle has no row until it is submitted ("missing" is the absence of a row). `reject_reason` is only set on a
  rejected row.
- A challenge's `delivery_status` only moves up (`pending`, `sent`, `delivered`, `read`); `failed` and
  `undeliverable` can follow any of them. The API reports `pending` as `sent` and `reviewer` as `delivered`.
- Keys in `rate_bucket` are HMACs (scope plus subject, keyed with `OTP_PEPPER`), so the table holds no phone and no IP.
- `phone_hash` is `HMAC-SHA256(OTP_PEPPER, "phone:" + e164)`.
- A plan has a `reason` exactly when it is `no_group` or `withdrawn` (`CHECK`). A member has one live plan per
  `dedupe_key` (a partial unique index), where the key is the event's dedupe group or its own id. Every state move is
  `UPDATE plan SET state = ? WHERE id = ? AND state = ?`, so two writers cannot both win.
- A ticket proof carries a `reject_reason` exactly when rejected. A deleted file nulls `object_key` and `sha256` together.
- A member is current in a group while `group_member.left_at` is null, at most once (a partial unique index). `member_ref`
  is unique inside the group and is the only name another member's app sees.
- A notice is inserted in the same transaction as the change it reports, and `dedupe_key` makes a second insert for the
  same milestone fail instead of repeating.
- `eligible_show` is a view over `listable_event`, `venue` and `start_override`. It is dropped and recreated on every
  migrate. It holds the group rules that SQL can express (category, price, free, a known start, a placed venue inside
  Hyderabad) and exposes `effective_starts_at`: the override when there is one, else the source's start. It has no
  clock and does not know the city-centre placeholder point, so a caller re-runs `isEligible` before acting.
