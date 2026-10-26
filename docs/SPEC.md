# Hyderabad events aggregator: master specification

Status: draft v1, ready to implement Phase 0 and Phase 1.
Owner: single remote operator, part-time.
Last updated: 2026-09-08.

This document is the contract. `phases.md`, `data-model.md`, `go-to-market.md` and
`open-questions.md` expand sections of it and never contradict it. If they do,
this file wins.

---

## 1. Problem

Hyderabad has no complete, filterable, machine-readable list of what is happening
in the city.

What exists today and why each one fails:

| Source | Covers | Fails because |
|---|---|---|
| BookMyShow, District | Ticketed events they sell | Only lists inventory they monetise. No free events, no open mics, no run clubs. |
| Instagram venue and city pages | Whatever the account felt like posting | Not searchable, not filterable, not sorted by date, gone in 24 hours if it was a story. |
| Allevents, Townscript, MeraEvents | Long tail of paid events | Thin coverage, heavy spam listings, poor UX, no local curation. |
| WhatsApp community groups | Genuine local knowledge | Unsearchable, invite-only, high noise. |

Result: a person in Gachibowli on a Friday afternoon cannot answer "what is on
near me tonight, under 500 rupees" without checking five apps and three
Instagram accounts.

## 2. Ideal customer profile

**Primary (build for this person).** 23 to 32, moved to Hyderabad for a job in
the IT corridor (Gachibowli, Madhapur, HITEC City, Kondapur, Financial
District). Disposable income, weak local social network, decides plans same-day
or one day ahead, will not cross the city on a weeknight. Reads WhatsApp and
Instagram, not email newsletters. English-first, comfortable in Hindi, possibly
not in Telugu.

**Secondary (serve, do not design for).** Long-time Hyderabad residents looking
for weekend plans with family. Students at Hyderabad Central University, IIIT
Hyderabad, BITS Pilani Hyderabad, Osmania. Visitors staying under a week.

**Supply side (a real user class, not an afterthought).** Small organisers: cafe
owners running open mics, comedy producers, flea market operators, run club
admins, indie gig promoters. They have followers and no marketing capability.
Phase 3 turns them into a distribution channel.

## 3. Geographic scope

Hyderabad and Secunderabad only, plus Shamshabad and Sangareddy where a venue is
plainly a Hyderabad venue. No Warangal, no Vijayawada, no "Telangana". No second
city until the model is proven with revenue in Hyderabad.

Area is a first-class field, not free text. The canonical area list is in
`data-model.md` section 4. Distance and area are the highest-value filters in
this city because travel time makes cross-city trips on a weeknight a
non-starter.

## 4. Product thesis

The operator cannot be physically in Hyderabad. That rules out being a
tastemaker with first-hand opinions on every venue, and it rules out running
events. It does not rule out being **complete**.

Completeness is verifiable by anyone, does not require presence, and is a
machine problem. Machine problems do not care where the operator lives. That is
the reason this shape of business is the right one here.

Three consequences that drive every decision below:

1. **Coverage is machine work, taste is human work.** The site lists everything
   found by the pipeline. The weekly digest is seven items picked by hand with
   one honest sentence each. Never automate the digest. An automated digest reads
   like a spreadsheet and nobody subscribes to a spreadsheet.
2. **Structured data pays out three times.** Filters for humans,
   `schema.org/Event` markup for Google's events results, and clean JSON, ICS and
   MCP feeds for AI assistants answering "what is on in Hyderabad this weekend".
   The same normalisation work funds all three.
3. **The audience is the asset.** Aggregation is thin-margin and copyable. The
   list of people who read every Thursday is what makes Phase 4 (tag-along) and
   Phase 5 (hosted events) launch to a warm audience instead of an empty room.

Tag-along, the "upload your ticket and go with someone" product, has the highest
revenue potential in the plan and is **deliberately deferred to Phase 4**. It is
a dating-adjacent product with safety and gender-ratio failure modes that kill it
if launched cold. Its constraints are specified in section 9.4 so nothing built
earlier makes it harder, but no part of it ships before the Phase 3 gate passes.

## 5. Naming

Two candidates:

- `hydsocial` (current folder name). Reads like a directory. Weak as a consumer
  brand, fine as an internal codename.
- `Kya Scene`. From the question Hyderabad already asks, *kya scene hai?*. Local,
  memorable, and it is literally what the product answers.

**Decision rule: the name is locked before the first Instagram post goes out in
Phase 0, and it blocks no engineering work.** Until then:

- Repository, package names, database names and internal identifiers use
  `hydsocial`. Do not rename these later; they are invisible to users.
- Every user-visible string goes through a single constant, `SITE_NAME`, exported
  from one config module. No hardcoded brand text in components, templates,
  digest copy or metadata.
- Domain purchase and social handle registration are gated on the decision, not
  on code.

Tracked in `open-questions.md` Q1.

## 6. Non-goals and out of scope

Explicitly not built, in any phase, unless this spec is amended:

- **Ticketing or payments for third-party events.** We link out. We are not a
  ticketing platform and will not hold anyone's money for someone else's event.
- **A mobile app.** The site is mobile-web first. No React Native, no install
  prompts, no app store presence.
- **User-generated reviews or ratings of events or venues.** Moderation cost with
  no revenue attached.
- **Full-text search, in Phase 1 or 2.** With a few hundred live events, filters
  beat search. Search arrives only when the archive justifies it.
- **User accounts, before Phase 4.** No login, no saved events, no "my list", no
  email capture beyond the WhatsApp Channel.
- **Personalisation or a recommendation model.** Ever, at this scale.
- **Display advertising.** At this traffic it pays in rupees and costs the clean
  fast browsing that is the product.
- **A second city.** See section 3.
- **Republishing source content wholesale.** Poster images are thumbnailed and
  attributed, descriptions are summarised not copied, and every listing links out
  to the source. See section 9.3.
- **Any social graph feature before Phase 4**, including comments, follows,
  profiles, or direct messages.

## 7. Core user journeys

### J1. Weekend planner (primary, Phase 1)
Opens the site on Friday at 6pm on a phone. Sees events happening tonight and
this weekend, sorted soonest first. Filters to their own area and to free events.
Taps an event, reads what it is, taps through to the source to book. Total time
under 90 seconds.

Acceptance: no login, no modal, no interstitial, no cookie banner beyond what law
requires, and the first screen shows real events without scrolling.

### J2. Digest reader (primary, Phase 0)
Thursday 7pm, a WhatsApp Channel post arrives with seven picks and one line of
opinion on each. Reads it standing in a lift. Taps one link. Decides.

Acceptance: the post is legible without expanding "read more" for at least the
first three picks, and every link resolves to a bookable or informative page.

### J3. Near me tonight (Phase 2)
Grants location or picks an area. Gets events sorted by distance from where they
are, tonight only. No competitor serves this journey, and it is worth more in
Hyderabad than in most cities because of travel time.

Acceptance: distance sort works from a picked area even when location permission
is denied.

### J4. Organiser claims a listing (Phase 3)
A cafe owner finds their open mic already listed, correctly. There is a page for
their venue with all their upcoming events. They submit a correction or a new
event through a form without creating an account. They share their venue page to
their own followers.

Acceptance: submission takes under two minutes on a phone and requires no login.

### J5. Machine query (Phase 2)
An AI assistant, or a developer, asks for events in Hyderabad this weekend under
500 rupees in Jubilee Hills and receives structured JSON with stable field names
and source links.

Acceptance: documented at `/llms.txt` and answerable through both the JSON
endpoint and the MCP server without an API key.

### J6. Tag-along (Phase 4, deferred)
Has a ticket to a comedy show. Uploads it, verifies identity once, requests a
companion for that specific show. Gets matched with one verified person going to
the same show. They meet at the venue. Afterwards each can silently like or
report. See section 9.4 for the constraints that make this survivable.

## 8. Feature requirements by phase

Full gates, metrics and stop criteria are in `phases.md`. This section states
what must exist. Nothing in a later phase may start before the previous phase's
gate has passed.

### Phase 0: manual digest, zero code

Required:
- A WhatsApp Channel and an Instagram account, both live.
- A weekly digest published every Thursday at 19:00 IST: seven events for the
  coming Friday to Sunday, each with title, date and time, venue, area, price, a
  source link, and one sentence of the operator's own opinion.
- The same seven as an Instagram carousel the same evening.
- A plain text or spreadsheet record of every issue, using the field names in
  `data-model.md` section 2, so Phase 1 can import the archive.

Forbidden in Phase 0: writing any application code, buying any hosting, designing
a logo, or building a scraper. The only question Phase 0 answers is whether the
operator will still be publishing in week 40.

### Phase 1: the database and the site

Required:
- Fetchers for the Tier A sources listed in `data-model.md` section 6.
- Normalisation into the canonical `event` schema.
- Deduplication across sources, per the algorithm in `data-model.md` section 8.
- A public site with: a listing page defaulting to the next 7 days, an event
  detail page, and exactly four filters: date range, area, category, free/paid.
- Link-out to the source on every event. No booking flow of our own.
- The digest stays hand-picked and manual. The site does not generate it.
- No admin review queue. Tier A sources are structured enough to publish
  directly. The queue becomes mandatory in Phase 3.

Explicitly not in Phase 1: map UI, geocoding, search, accounts, images beyond a
thumbnail, Instagram ingestion, submission form, MCP server.

### Phase 2: place and discoverability

Required:
- A `venue` table with one-time geocoding, roughly 300 venues covering the large
  majority of Hyderabad events.
- Distance sort ("near me") shipped **before** any pin map UI.
- `schema.org/Event` JSON-LD on every event page, valid against Google's Rich
  Results test.
- Programmatic pages, routes listed in `data-model.md` section 11.
- A refreshed sitemap on every pipeline run.
- Public JSON endpoint, ICS feeds, `llms.txt`, and the MCP server.

### Phase 3: long tail and supply

Required:
- Instagram ingestion across roughly 40 accounts. Caption parsing first, vision
  model extraction only when the caption is insufficient.
- A human review queue. Model-extracted events are never auto-published.
- A "submit your event" form with no login, plus a public page per organiser.
- Outreach to 100 organisers.

### Phase 4: tag-along (deferred, do not start early)

Required, and all of them together, see section 9.4: identity verification,
ticket verification, event-scoped matching, no browsing, no pre-match messaging,
hard gender balancing, women-only opt-in, one-report bans, published grievance
officer contact.

### Phase 5: hosted events

Out of scope for engineering until Phase 4 revenue exists. A hired local host
runs prepaid small-group dinners sold to the existing audience.

## 9. Constraints

### 9.1 Operator constraints
- One person, remote, roughly four to six hours a week. Any design needing daily
  manual intervention beyond ten minutes is wrong.
- Running cost ceiling of 2,000 rupees a month through Phase 3. Free tiers for
  hosting, database and geocoding; model calls in the tens of rupees.
- The operator cannot verify a venue in person. Venue data quality comes from
  cross-referencing sources and from organiser corrections, never from claimed
  first-hand knowledge.

### 9.2 Editorial constraints
- Never claim first-hand experience of a venue or event. Curate, do not review.
  Opinion is allowed in the form of "this will sell out" or "small room, get
  there early", derived from public information. Not "the coffee is great".
- Never publish an AI-generated image of a real venue, crowd or event. AI is
  allowed for typography, layout, backgrounds and copy variants only. This is the
  one failure that ends the brand's credibility permanently.

### 9.3 Source and legal constraints
- Every event links out to its source. We send traffic to the platforms we read.
- Identify the crawler honestly in the user agent, with a contact URL.
- Rate limit conservatively: no more than one request per second per source, and
  do not run fetches more often than the schedule in `data-model.md` section 6.
- Store thumbnails at a maximum of 800px on the long edge, never full-size
  reproductions, always with source attribution and a link.
- Honour a removal request from any source or organiser within 72 hours, without
  argument. Publish a contact address for this from Phase 1.
- Instagram ingestion runs from a dedicated account, expects to be blocked, and
  fails gracefully without taking the pipeline down.
- Register as a sole proprietorship before taking any revenue. Watch the 20 lakh
  rupee GST registration threshold. Move to an LLP or Pvt Ltd before Phase 4
  takes money from users.

### 9.4 Safety constraints for any social graph feature
Binding on Phase 4 and on any earlier feature that would let one user see or
contact another. Not negotiable, not deferrable to "v2".

- **No browsing.** There is no scrollable directory of people. A user requests a
  specific event; candidate matches surface only within that event.
- **No messaging before both parties accept**, and no messaging outside the
  event's time window plus 24 hours.
- **Verification before any match**: government ID plus a liveness selfie, plus a
  valid ticket for the specific event.
- **Hard gender balancing.** Men are waitlisted when the ratio for an event
  passes the configured threshold. Slower growth is the price of the product
  existing at all. Default threshold: no more than 60% of matched participants of
  one gender per event.
- **Women-only opt-in from day one**, not as a later feature.
- **Public venues only.** The ticket requirement enforces this; do not weaken it.
- **One report ends an account.** No appeals process in year one.
- **Published grievance officer name, address and contact**, with documented
  takedown timelines, before the first user account is created.
- Paying for verification is itself a safety filter. Do not offer a free tier
  that can match.

## 10. Architecture sketch, Phase 1 and later

One repository. One deployable. No services, no queue, no orchestrator.

```
  scheduled job (GitHub Actions cron, 4x daily)
        |
    [ fetch ]       per-source adapters, rate limited, isolated failures
        |
    [ parse ]       source payload -> RawEvent
        |
   [ normalise ]    RawEvent -> Event (dates to IST, price to paise,
        |                             category mapped, area inferred)
        |
 [ resolve venue ]  venue name -> venue_id (Phase 2 adds geocode)
        |
    [ dedupe ]      assign dedupe_group_id, pick canonical record
        |
    [ review ]      Phase 3 only: model-extracted events wait here
        |
    [ store ]       SQLite (Turso / libSQL) via a typed query layer
        |
   [ publish ]      Next.js App Router, ISR revalidated on pipeline finish,
                    plus JSON endpoint, ICS, sitemap, JSON-LD, MCP server
```

Choices and the reason for each:

- **Next.js App Router on Vercel.** One framework covers the site, the JSON
  endpoints, ICS generation and the cron trigger. Free tier is enough.
- **SQLite via Turso.** A few hundred events a week is three orders of magnitude
  below anything needing Postgres. Free tier, and plain local SQLite for
  development with no container.
- **GitHub Actions for the schedule**, not a hosted worker. Free, logged,
  restartable, and failure notification is an email that already works.
- **ISR, not client-side fetching.** Pages are static between pipeline runs, so
  the site is fast and Google gets clean HTML with JSON-LD already in it.
- **Vision model calls only in Phase 3**, batched, cheap, behind a review queue.

Explicitly rejected: message queues, Airflow or any orchestrator, microservices,
a vector database (dedupe embeddings are computed inline and stored as blobs in
SQLite), Redis, Docker in production, GraphQL, runtime-generated migrations.

Failure posture: any single source failing must not fail the run. Each adapter is
wrapped, its failure recorded on the `source` row, and the pipeline continues.
Three consecutive failures disable a source and notify the operator.

## 11. Definition of done

### Phase 0 is done when all of these are true
- [ ] Four consecutive Thursdays have a digest published before 19:30 IST.
- [ ] Each issue contains exactly seven events, each with title, start time,
      venue, area, price or "free", a working source link, and one sentence of
      original opinion.
- [ ] The WhatsApp Channel and the Instagram account both exist and have carried
      all four issues.
- [ ] The archive of all four issues is recorded in the field shape defined in
      `data-model.md` section 2, importable by Phase 1.
- [ ] The name decision (section 5) is locked.
- [ ] Zero lines of application code have been written.

Gate to Phase 1: no missed Thursday. Two missed Thursdays stops the project. See
`phases.md`.

### Phase 1 is done when all of these are true
- [ ] At least six Tier A sources have working adapters, each with an integration
      test running against a recorded fixture.
- [ ] A pipeline run completes end to end in under 10 minutes, scheduled four
      times daily.
- [ ] At least 150 distinct, published, future events are live in any given week.
- [ ] Measured duplicate rate is under 5%, verified by manual audit of a random
      sample of 100 published events.
- [ ] The listing page loads in under 2 seconds on a mid-range Android phone on
      4G, measured on a real device or a throttled Lighthouse run, and scores 90
      or above on Lighthouse performance and accessibility.
- [ ] All four filters work, combine, and keep their state in the URL so a
      filtered view is shareable.
- [ ] Every event detail page links out to its source and renders correctly when
      optional fields (image, price, end time, description) are missing.
- [ ] Zero events display a placeholder date or "TBD" venue on the listing page.
      Events that cannot be normalised are held unpublished, never shown broken.
- [ ] A source failing produces a logged, non-fatal error and the run still
      publishes.
- [ ] A takedown contact address is published on the site.
- [ ] `SITE_NAME` is the only place the brand name appears.

Gate to Phase 2: the site lists more real, correct, future Hyderabad events than
any single source it reads from, verified by a manual count against District and
BookMyShow for one weekend.
