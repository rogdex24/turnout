# Go to market: distribution, messaging and rules

Companion to `SPEC.md`. Four channels doing four different jobs, plus a short
list of things that are forbidden because they would end the brand or cost the
best organic channel in the city.

---

## 1. Channel map

| Channel | Job | Starts | Cadence |
|---|---|---|---|
| Instagram | Discovery. Where new people find us. The only channel worth paying for. | Phase 0 | 1x/week, then 3x/week from Phase 2 |
| WhatsApp Channel | Retention. Where they stay. | Phase 0 | Every Thursday 19:00 IST, without exception |
| Google organic | Compounding. Works while the operator sleeps. | Phase 2 | Continuous, driven by the pipeline |
| Organisers | Distribution through other people's audiences. | Phase 3 | Ongoing outreach |

Reddit is a supporting channel, not a primary one, and it operates under strict
rules (section 4).

Email is deliberately absent. The primary ICP does not read consumer email
newsletters in India, and maintaining a list is real work for weak returns.
Revisit only if the WhatsApp Channel is capped or restricted.

## 2. Instagram

### Why it is first
Geo-targeted paid reach inside a single city is inexpensive, and the primary ICP
already discovers venues and events there. It is the top of the funnel; the
WhatsApp Channel is the bottom.

### Content mix
- **Weekly digest carousel.** Nine slides, the shape in `data-model.md` section
  10.7. The dependable core.
- **Reels of actual events.** These outperform graphics substantially. The
  operator cannot film them, so source them: offer organisers a free featured
  listing in exchange for footage rights, from Phase 3. Until then, use organiser
  footage with permission and visible credit.
- **Single-event posts** for anything unusually good, mid-week.
- **Area-specific posts.** "Five things in Gachibowli this weekend" performs
  better than city-wide posts because it tells a specific person the post is for
  them.

### Paid
Start only after 20 organic posts, so there is a measurable baseline. Geo-target
Hyderabad, age 22 to 34, interests around live music, comedy, cafes and fitness.
Budget 2,000 to 5,000 rupees a month at first. Optimise for Channel joins, not
for followers; a follower is a vanity number and a Channel member is a reader.

### Captions carry the whole list
Instagram search reads captions and cannot read text inside an image. Every
carousel caption repeats all seven picks as plain text with area and price. This
is free search surface inside the app and most accounts waste it.

## 3. WhatsApp Channel and group admins

### Why a Channel, not groups
Broadcast-only, no phone numbers exchanged between members, no group noise, and
it is where this audience actually reads things. Mirror to Telegram once, then
stop thinking about it.

### The admin strategy
Do not join 40 groups and paste links. That gets the account removed within a day
and burns the relationship permanently.

Target **admins**, not groups. One message, sent privately:

> Hi, I put out a free weekly list of what's happening in Hyderabad every
> Thursday. No ads, no signup. Here's the Channel link if it's useful for your
> group: <link>. Happy to leave it there if not.

Rules:
- One message per admin, ever. No follow-up if there is no reply.
- Never post the link into a group without the admin saying yes.
- Offer the Channel link, not the website. It is easier to say yes to something
  members can leave with one tap.
- Track outreach in a sheet: group name, admin handle, date contacted, outcome.
  20 admins in Phase 2, another 30 in Phase 3.

An admin sharing the Channel is worth more than a hundred self-posted links,
because it arrives with borrowed trust.

## 4. Reddit

r/hyderabad is small, regular, and good at spotting seeded content. It is the
single best organic channel in the city and also the easiest one to lose
permanently.

### Forbidden
**No astroturfing.** No posts written to look like they came from an unaffiliated
user, no alt accounts, no seeded "has anyone tried this?" threads, no asking
friends to post on the project's behalf. The realistic outcome is a domain-level
ban, which also blocks anyone who ever genuinely wants to recommend the site.
That trades the channel's entire future value for a few weeks of traffic.

### What to do instead
- Post the weekend list under the operator's own account, as a plain text post
  with no link, every week. Real effort, genuinely useful, no ask.
- Answer "what's happening this weekend" and "new in Hyderabad" threads properly.
- Message the moderators before ever posting a link, and accept the answer.
- Be a recognisable helpful account for three to six months before expecting
  anything. Reddit rewards the boring honest version of this generously; it just
  takes six months rather than six days.

## 5. SEO

The only channel that compounds, and the one an Instagram page can never have.
It is the strongest single argument for building a structured database rather
than posting pictures.

### Three parts
1. **`schema.org/Event` JSON-LD** on every event page, complete enough to qualify
   for Google's events results (`data-model.md` section 10.3). Partial markup is
   rejected, so validate before shipping.
2. **Programmatic pages** off our own data (`data-model.md` section 11). Marginal
   cost near zero because the data already exists. Target the phrasing real
   searches use: "things to do in Hyderabad this weekend", "free events in
   Hyderabad", "live music in Hyderabad tonight", "events in Gachibowli",
   "comedy shows in Hyderabad".
3. **Freshness.** Sitemap regenerated on every pipeline run, `lastmod` accurate.
   Event search rewards recency and punishes stale listings, so `delisted` and
   past events must leave the sitemap promptly.

### Rules
- Never generate a page with zero events. Return 404 or redirect to the parent.
  Empty pages attract thin-content penalties and waste crawl budget.
- One `h1` per page, naming the city and the intent.
- Past events keep their URL and render as "this event has passed" with links to
  similar upcoming events. Deleting them loses accumulated links.
- Do not chase links. For this category, coverage and freshness beat backlinks.

### AI answer surfaces
Increasingly, "what's on in Hyderabad this weekend" is answered by an assistant
rather than a search results page. The open JSON endpoint, the ICS feeds, the MCP
server and `llms.txt` exist so that when that happens, our data is the data being
quoted and the source link travels with it. Being the canonical machine-readable
source for one city is small, winnable and durable.

## 6. Organisers as a channel

The channel nobody thinks about. Every listed venue has followers and no
marketing capability.

The Phase 3 motion:
1. Ingest their events whether they know about it or not (Tier C).
2. Give each organiser a public page at `/o/{slug}` that looks good and lists
   everything of theirs coming up.
3. Message them: "You're listed, here's your page, it's free. Tell me if
   anything's wrong."
4. They share their own page to their own followers, because it flatters them and
   costs them nothing.
5. Add the submission form so corrections and new events flow to us. The
   adversarial scraping problem quietly becomes a supply relationship.

Target: 100 organisers contacted in Phase 3, 10 unsolicited submissions a month
by month 9.

## 7. Messaging rules

These are binding. They exist because each one, if broken, damages something
that cannot be repaired with a later apology.

### 7.1 Do not sell loneliness
"Bored and alone this weekend?" makes people scroll past, because agreeing with
the ad costs them something in front of an audience. "Six things happening in
Gachibowli on Saturday" makes them stop.

Loneliness is why the product converts. It is not what the copy says. Sell the
plan, never the ache.

Forbidden phrasings: "no friends", "lonely", "nobody to go with", "stop sitting
at home", "new in the city and alone", and every variation of pity. This applies
to ads, captions, the site and the digest.

Allowed and preferred: specific plans, specific places, specific times, specific
prices.

### 7.2 Never fake a photo
No AI-generated image of a real venue, a real crowd, or a real event. Ever.

AI is allowed for typography, layout, backgrounds, icons, and copy variants. It
is not allowed to depict a place or the people in it. A local audience recognises
a venue they have been to, and being caught inventing one ends the brand's
credibility permanently. There is no recovery from it and no version of it that
is worth the time saved.

Corollary: organiser poster images are used at thumbnail size, with attribution,
unaltered. Do not upscale, restyle, or regenerate them.

### 7.3 Curate, do not review
The operator is not in Hyderabad and must never write as if they were. No claims
about food, service, sound quality or atmosphere from first-hand experience.

The honest and still valuable position is the person who reads everything so the
reader does not have to. Opinion is allowed when it is derived from public
information: "this will sell out", "small room, get there early", "this is the
third edition and the last two filled", "free, and the last one had a queue".

If a claim would be false coming from someone who has never been in the room, it
does not go out.

### 7.4 Never miss a Thursday
Reliability is the brand. A mediocre list that arrives every single week beats a
brilliant one that arrives when the operator feels like it. Batch a month ahead
when travelling. This rule outranks quality.

### 7.5 Label paid placement
Featured listings carry a visible "Featured" label, always. Paid placement
disguised as editorial destroys the only thing being sold, which is that the list
is honest.

### 7.6 Lead with free
Free events get shared harder than anything else published, and they are badly
served by every ticketing platform, which has no reason to list what it cannot
sell. `/free` is a permanent, prominent section, and at least two of the seven
weekly picks should be free whenever the calendar allows.

### 7.7 Have a face
Sign the digest. "Curated by <name>" outperforms a faceless brand and costs
nothing. Being remote does not prevent being a person.

## 8. Revenue, staged

Figures are planning estimates, not forecasts. The shape matters more than the
numbers: nothing before month six earns anything, and that is by design.

| Stream | Starts | Mechanism | Realistic monthly |
|---|---|---|---|
| Featured placement | Month 6 | Venue or organiser pays for the top slot in the digest and on a category page. Inbound once visible; do not build a sales function. | 10k to 40k |
| Ticket revenue share | Month 8 | 5 to 10% with small organisers who have no marketing. Not with BookMyShow, where there is no leverage and no need. | 5k to 25k |
| Tag-along membership | Month 10 | Verification fee plus 149 to 299 a month. The only stream that compounds, and the reason Phase 4 exists. | 30k to 150k |
| Hosted events | Year 2 | About 350 rupees margin per seat. Capped by the host's time, so it is a brand and community engine more than a profit centre. | 40k to 80k |
| Organiser tools | Year 2 | RSVP, payments, a page and analytics for organisers already listed. Highest ceiling, needs supply density first. | 20k to 100k |
| Display advertising | Never | At this traffic it pays in rupees and costs the clean fast browsing that is the product. | not pursued |

## 9. Measurement

Track weekly, in one sheet, from Phase 0:

- WhatsApp Channel members, and week-over-week change
- Instagram followers and reach per post
- Thursdays hit, cumulative, as a streak
- From Phase 1: published future events, duplicate rate, pipeline failures
- From Phase 2: organic sessions, indexed pages, Search Console events report
- From Phase 3: unsolicited submissions, revenue, review queue minutes per day

One number is the health of the whole business at every stage: **the Thursday
streak.** If it breaks, nothing else on this list matters.
