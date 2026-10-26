# Phased rollout, gates and kill criteria

Companion to `SPEC.md`. This file governs sequencing. A phase may not start
until the previous phase's gate has passed, and the gates are written now
because in month seven the operator will be too invested to judge fairly.

The single largest risk in this project is not technical. It is that the operator
stops publishing in month four. Every gate below is designed to surface that
early and cheaply.

---

## Phase 0: prove you will show up

**Weeks 1 to 4. Cost: 0 rupees. Effort: about 4 hours a week.**

### Goal
Answer one question: will this person still be publishing in week 40? No scraper
answers that. Four Thursdays do.

### Build
Nothing. No repository, no hosting, no logo, no domain beyond registering the
name once it is chosen.

### Do
- Create the WhatsApp Channel and the Instagram account.
- Every Wednesday: two hours scrolling District, AllEvents, Luma and about 30
  venue Instagram accounts. Pick seven things worth doing Friday to Sunday.
- Every Thursday 19:00 IST: publish the seven to the Channel and as an Instagram
  carousel, in the shapes given in `data-model.md` sections 10.6 and 10.7.
- Record every issue in the sheet defined in `data-model.md` section 2.
- Lock the name (`SPEC.md` section 5, `open-questions.md` Q1).

### Success metrics
| Metric | Target |
|---|---|
| Thursdays hit | 4 of 4 |
| Picks per issue | exactly 7, each with an editor note |
| WhatsApp Channel members | 150 to 300 |
| Time per issue | under 4 hours |

### Do NOT build yet
A website. A scraper. A database. A logo or brand system. An email newsletter.
A Telegram mirror. Anything with a login.

### Gate to Phase 1
No missed Thursday, and the archive sheet is complete.

### Kill criterion
Two missed Thursdays in the first four weeks. Stop. The rest of this plan is
fifty more Thursdays, and the evidence says they will not happen.

---

## Phase 1: the database and the site

**Month 2 to 3. Cost: 0 rupees, free tiers throughout.**

### Goal
Be the most complete list of Hyderabad events that exists. Not the prettiest, not
the most opinionated. The most complete.

### Build
- Tier A source adapters, six of seven working (`data-model.md` section 6).
- Parse, normalise, resolve venue, dedupe, store, publish
  (`data-model.md` section 7).
- Deduplication to the algorithm in `data-model.md` section 8. Budget real time
  here; it is the hard part, not the scraping.
- Public site: listing page defaulting to the next 7 days, event detail page,
  four filters (date, area, category, free/paid), filter state in the URL.
- Link out to the source on every event.
- Published takedown contact address.
- `SITE_NAME` as the only place the brand name appears.

### Do
Keep publishing the digest by hand, every Thursday, without exception. The site
does not generate the digest and must not be allowed to. Start using the site's
own listing as the sourcing tool for the digest, which is the first real payoff
of building it.

### Success metrics
| Metric | Target |
|---|---|
| Distinct published future events, weekly | 150+ |
| Visible duplicate rate (audit of 100) | under 5% |
| Pipeline run time | under 10 minutes |
| Listing page load, mid-range Android on 4G | under 2 seconds |
| Lighthouse performance and accessibility | 90+ |
| Thursdays hit, cumulative | 12 of 12 |
| WhatsApp Channel members | 600 to 1,000 |

### Do NOT build yet
Map UI. Geocoding. Search. User accounts. Saved events. Email capture. Images
beyond a single thumbnail. Instagram ingestion. The submission form. The MCP
server. An admin panel beyond raw SQL access. Anything resembling a design
system; one stylesheet is enough.

### Gate to Phase 2
A manual count for one weekend shows the site lists more real, correct, future
Hyderabad events than District alone and than BookMyShow alone. Plus the full
Phase 1 definition of done in `SPEC.md` section 11.

### Kill criterion
Month 3 with fewer than 500 WhatsApp Channel members despite publishing every
week. The list is not spreading, and no amount of engineering fixes a
distribution problem.

---

## Phase 2: place and discoverability

**Month 4 to 6. Cost: about 1,500 rupees a month.**

### Goal
Two unlocks. Distance, which is the highest-value filter in a city where nobody
crosses town on a weeknight. And Google, which is the only channel that
compounds while the operator sleeps.

### Build
- `venue` table and one-time geocoding of about 300 venues. Hand-fix the messy
  ones; Indian venue strings resist automation and 300 rows is an afternoon.
- **Distance sort ships before the pin map.** "Events near me, soonest first" is
  most of the value; the map is the presentation layer on top of it.
- `schema.org/Event` JSON-LD on every event page, validated against Google's
  Rich Results test.
- Programmatic routes (`data-model.md` section 11) and a data-driven sitemap
  generated from current published rows. Empty routes stay out of it.
- Public JSON endpoint, ICS feeds, `llms.txt`, MCP server
  (`data-model.md` section 10).
- Minimal admin form for composing and archiving the digest.

### Current implementation snapshot (2026-09-08)
The public JSON and ICS feeds, event JSON-LD, `llms.txt`, venue table,
data-driven sitemap, distance query, and the documented programmatic routes are
implemented. The MCP surface is intentionally thin HTTP endpoints for now; a
full SDK transport, map UI, paid geocoding and the digest admin form remain
outside this slice.

### Do
- Instagram three times a week, not only Thursdays.
- Weekly r/hyderabad text post, no link, under the operator's own name.
- Approach admins of 20 Hyderabad WhatsApp groups (`go-to-market.md` section 3).
- Submit the sitemap to Search Console and watch the events report weekly.

### Success metrics
| Metric | Target by month 6 |
|---|---|
| Organic sessions per month | 1,000+ |
| Events appearing in Google events results | confirmed in Search Console |
| WhatsApp Channel members | 2,000 |
| Instagram followers | 5,000 |
| Venues geocoded | 300, with under 5% `geocode_state = 'failed'` |
| Share of published events with `area != 'other'` | 92%+ |

### Do NOT build yet
Instagram ingestion. Accounts or login. Paid placements infrastructure. A
newsletter. Push notifications. A second city. Any part of tag-along.

### Gate to Phase 3
Events confirmed appearing in Google's events results, and 1,000 organic sessions
in a month.

### Kill criterion
Month 6, under 1,000 organic sessions a month with structured data shipped and
indexed. The compounding channel is not compounding, which removes the main
argument for being a database rather than an Instagram page.

---

## Phase 3: the long tail and the supply flip

**Month 6 to 9. First revenue.**

### Goal
Tier A made the product complete. Tier C makes it hard to copy: open mics, cafe
gigs, flea markets, run clubs, the events that exist only as an Instagram poster.
Then invert the supply problem so organisers push events to us.

### Build
- Instagram ingestion across about 40 accounts, caption-first then vision model
  (`data-model.md` section 9).
- **Human review queue.** Model-extracted events are never auto-published. Target
  under 10 minutes of operator time a day.
- "Submit your event" form, no login, mobile-first, under two minutes to
  complete.
- Public organiser pages at `/o/{slug}`, which are the asset used in outreach.
- Featured placement mechanics: a `promotion` row with a date range, a paid flag,
  and a visible "Featured" label. Never disguise paid placement as editorial.

### Do
- Message 100 organisers: "You are listed, here is your page, it is free."
- Convert inbound interest into featured placements at 2,000 to 5,000 rupees.
- Register the sole proprietorship before taking money.

### Success metrics
| Metric | Target by month 9 |
|---|---|
| Share of listings unavailable on any Tier A source | 30%+ |
| Review queue time per day | under 10 minutes |
| Vision extraction precision after review | 85%+ approved |
| Unsolicited organiser submissions per month | 10+ |
| Revenue in the best month | 10,000 rupees |

### Do NOT build yet
Tag-along. Accounts. Payments held on behalf of organisers. A mobile app.
Analytics dashboards for organisers.

### Gate to Phase 4
Organisers submit events without being asked, and the site has recorded a
10,000 rupee revenue month.

### Kill criterion
Month 9, zero rupees earned and no organiser has ever asked to be featured.
Nobody on either side of this market is willing to pay for it.

---

## Phase 4: tag-along

**Month 9 to 15. The product with real revenue potential, and the one that can
end the project if it is built carelessly.**

### Goal
Sell the thing people actually want: someone to go with. Movies and stand-up are
the right starting point precisely because they are not social events. Two hours
of sitting in silence is a low-pressure first meeting.

### Build
All of the following, together. None is optional and none is deferrable, per
`SPEC.md` section 9.4:

- Accounts with government ID plus liveness selfie verification.
- Ticket upload and verification for a specific event.
- Event-scoped matching only. **No browsable directory of people.**
- No messaging until both parties accept. No messaging outside the event window
  plus 24 hours.
- Hard gender balancing, default no more than 60% of matched participants of one
  gender per event, with a waitlist.
- Women-only opt-in from launch.
- Like or report only. One report ends an account, no appeals in year one.
- Published grievance officer name, address, contact and takedown timelines,
  live before the first account is created.
- Entity moved to LLP or Pvt Ltd before taking user money.

### Charge
One-time verification fee of 199 to 299 rupees, membership of 149 to 299 rupees
a month. Paying is itself a safety filter. There is no free tier that can match.

### Success metrics
| Metric | Target |
|---|---|
| Completed tag-alongs | 100 |
| Safety incidents | 0 |
| Gender split of matched participants | no worse than 65/35 |
| Repeat usage within 60 days | 30%+ |
| Verification-to-first-match conversion | 40%+ |

### Do NOT build
Profile browsing. Public profiles. Group chats. In-app ticket purchase. A
"discover people" surface of any kind. Anything that turns this into a social
network rather than a single seat, once.

### Gate to Phase 5
100 completed tag-alongs, zero safety incidents, repeat usage above 30%. Below
30% this is a novelty rather than a subscription, and the pricing model is wrong.

### Kill criterion
Any safety incident that a reasonable person would call serious. Stop matching
immediately, review, and do not restart until the specific failure is designed
out. Also: gender split worse than 80/20 after three months of hard gating,
which means the balancing is not working and the product cannot function.

---

## Phase 5: off the internet

**Year 2. Requires a hire.**

### Goal
Run events now that the hard part, an audience that trusts the brand, already
exists.

### Do
- Hire one part-time host in Hyderabad. Host first, because they run the room and
  are the face. Scout second, to source Tier C and verify venues. Editor last,
  and only if the digest is what is breaking.
- Format: six strangers, one table, one weeknight, prepaid. 999 rupee seat
  against a 650 rupee fixed menu negotiated with a restaurant that is empty
  midweek, so roughly 350 rupees margin per seat. Six tables of six is about
  12,500 rupees a night.
- Sell it to the WhatsApp Channel first, nowhere else.

### Success metric
The first dinner sells out from one Channel post.

### Kill criterion
An audience of 8,000 weekly readers cannot fill 36 seats. The audience was
attention, not intent. Stay a media and data business and do not sign a lease.

---

## Cross-phase kill criteria

Any one of these stops the project regardless of which phase is active:

- **Month 1:** two of four Thursdays missed.
- **Month 3:** under 500 WhatsApp Channel members.
- **Month 6:** under 1,000 organic sessions a month with structured data shipped.
- **Month 9:** zero revenue and no inbound organiser interest.
- **Any month:** the operator dreads Wednesday.

**Not** a kill signal: no revenue before month six. That is the plan working as
written, not a failure.
