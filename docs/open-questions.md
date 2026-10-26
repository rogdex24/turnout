# Open questions

Only decisions that a human still has to make. Everything already decided lives
in `SPEC.md` and is not repeated here.

Each entry states what blocks on it and by when. If an entry has no blocker and
no date, it does not belong in this file.

Status key: **OPEN** needs a decision, **LEANING** a recommendation exists and
needs confirmation, **BLOCKED** waiting on external information.

---

## Q1. The name — DECIDED

**Question.** `hydsocial` or `Kya Scene`, or something else?

**Why it matters.** It goes on the Instagram handle, the Channel, the domain and
every post. Changing it after 2,000 Channel members is expensive; changing it now
costs nothing.

**Options.**
- `hydsocial`: reads like a directory, weak recall, but the handle is likely free
  everywhere.
- `Kya Scene`: local, memorable, a complete sentence, and literally the question
  the product answers. Risk: harder to spell for search, and the handle may be
  taken.
- Others considered: `Chai O'Clock`, `Weekend in Hyd`, `Deccan Diary`.

**Decision (2026-10-10).** `Hyd Tonight`, chosen by the operator. It names the city and the
product's question. Handle and domain availability is still Q2.

**Earlier recommendation.** `Kya Scene`, subject to Q2.

**Blocks.** The first Phase 0 Instagram post. Blocks no engineering, because all
user-visible strings go through `SITE_NAME` (`SPEC.md` section 5).

**Decide by.** Before the first digest goes out, week 1.

---

## Q2. Domain and handle availability — BLOCKED

**Question.** Are the handle and domain for the chosen name actually free on
Instagram, WhatsApp, `.com` and `.in`?

**Why it matters.** Determines whether Q1's recommendation survives contact with
reality. A name with a taken Instagram handle is not a name.

**Action needed.** Check Instagram, `.com`, `.in`, and Reddit username in one
sitting. Register everything the same day, including the ones not immediately
used.

**Blocks.** Q1's final answer.

**Decide by.** Week 1.

---

## Q3. Any on-ground contact in Hyderabad? — OPEN

**Question.** Does the operator have even one reliable person in Hyderabad who
would answer a "is this place real, is this event actually happening" message?

**Why it matters.** This is the highest-value unknown in the whole plan. It
changes venue verification quality, whether Phase 3's review queue can resolve
ambiguous posters, and whether Phase 5's host hire starts from a warm
introduction or a cold search. It does not change the architecture, but it
changes the confidence of everything downstream.

**Options.**
- Yes, one or more: use them sparingly for venue verification only. Do not turn a
  friend into unpaid staff.
- No: lean harder on cross-source agreement as the verification signal, and treat
  Phase 3's submission form as the main correction mechanism rather than a
  convenience.

**Blocks.** Nothing in Phase 0 or 1. Shapes Phase 3 review design and Phase 5
hiring.

**Decide by.** Before Phase 3 design, month 5.

---

## Q4. Time to revenue: is the operator actually fine with zero for six months? — OPEN

**Question.** The plan earns nothing until roughly month six and meaningful money
around month ten. Is that acceptable, or is there an income requirement?

**Why it matters.** If there is a Q1-of-next-year income need, this is the wrong
project and no amount of execution fixes that. Better to know before writing a
scraper than in month five.

**Options.**
- Fine with it: proceed exactly as written.
- Not fine with it: the plan needs replacing, not accelerating. Do not attempt to
  pull tag-along or paid placements forward; both fail without an audience and
  failing early poisons the brand for the later attempt.

**Blocks.** Whether to start at all.

**Decide by.** Before Phase 1, month 1.

---

## Q5. Advertising budget — OPEN

**Question.** What is the monthly ceiling for Instagram ads, and starting when?

**Why it matters.** Paid geo-targeted reach in one city is the fastest lever on
Channel growth, and the month-3 kill criterion (500 Channel members) is the one
most likely to be missed for want of a few thousand rupees of reach.

**Recommendation.** 2,000 to 5,000 rupees a month starting after 20 organic
posts, optimising for Channel joins rather than followers.

**Blocks.** Phase 2 growth targets.

**Decide by.** Month 2.

---

## Q6. Cinema listings: in or out? — LEANING

**Question.** Should BookMyShow's movies vertical be ingested, or only the events
vertical?

**Why it matters.** Hyderabad has enormous daily cinema inventory. Ingesting it
would multiply row counts by a large factor, dominate every listing page, and
serve a need already perfectly met by BookMyShow itself.

**Recommendation.** Out for Phase 1 and Phase 2. Events vertical only.

**Reconsider when.** Phase 4, where cinema is the ideal tag-along inventory: high
volume, low social pressure, cheap tickets. At that point ingest movies **only**
as tag-along inventory, not as general listings.

**Blocks.** The BookMyShow adapter's scope in Phase 1.

**Decide by.** Before writing that adapter, month 2.

---

## Q7. Instagram ingestion: build, buy, or ask? — OPEN

**Question.** Tier C ingestion has no legal API for reading other accounts.
Options carry different cost, fragility and risk.

**Options.**
- **Build directly.** A dedicated account plus conservative rate limiting. Free,
  fragile, expects periodic blocking.
- **Buy a third-party scraping API.** Roughly 2,000 to 5,000 rupees a month,
  more reliable, moves the risk to a vendor, and pushes past the stated cost
  ceiling in `SPEC.md` section 9.1.
- **Ask organisers to submit.** Slowest to start, zero risk, and the only option
  that improves over time rather than degrading.

**Recommendation.** Build directly with low expectations, ship the submission
form in the same phase, and treat submissions as the destination rather than the
fallback. Revisit buying only if Tier C coverage is the thing blocking growth.

**Blocks.** Phase 3 build. Also affects the Phase 3 cost ceiling.

**Decide by.** Month 5.

---

## Q8. Geocoding provider — LEANING

**Question.** Google Places, or an open provider such as Nominatim or Photon?

**Why it matters.** Indian venue strings are messy ("Prism Club, opposite Inorbit,
Madhapur"). Open geocoders handle Indian points of interest noticeably worse than
Google, and venue coordinates are what the entire map and distance feature rests
on.

**Recommendation.** Google Places text search, used once per venue, roughly 300
lookups total, comfortably inside the free tier. Store `google_place_id` so
re-geocoding is free later. Hand-fix the failures rather than adding a second
provider.

**Confirm.** That a Google Cloud billing account is acceptable to set up, since
the free tier still requires one.

**Blocks.** Phase 2.

**Decide by.** Month 4.

---

## Q9. Content language policy — OPEN

**Question.** English only, or also Hindi and Telugu?

**Why it matters.** The primary ICP is English-first, but a meaningful share of
Hyderabad events, particularly theatre, heritage walks and community events, are
conducted in Telugu or Urdu. The `languages` field already exists on `event`; the
question is whether the site and digest are also published in another language.

**Recommendation.** Site and digest in English only through Phase 3. Populate the
`languages` field from day one so events can be filtered by the language they are
conducted in, which is the part that actually helps the reader.

**Reconsider when.** The `heritage` and `theatre` categories become a large share
of traffic, which would indicate an audience beyond the primary ICP.

**Blocks.** Nothing immediately. Confirm so the field is populated correctly from
Phase 1.

**Decide by.** Month 3.

---

## Q10. Grievance officer identity — OPEN

**Question.** Whose name, address and contact are published as grievance officer
before Phase 4 opens accounts?

**Why it matters.** Indian intermediary obligations require a named person with a
contactable Indian address once users post content or interact. If the operator
is not resident in India, this needs a real answer well before Phase 4, and it
may require the LLP or Pvt Ltd structure to be in place first.

**Options.**
- The operator, if they have an Indian address that can be published.
- A co-founder or the Phase 5 host, if either is resident.
- A compliance service, at ongoing cost.

**Blocks.** Phase 4 entirely. No accounts may be created before this is answered.

**Decide by.** Month 8, so that the entity work can complete before Phase 4
build starts.

---

## Q11. Identity verification vendor for tag-along — OPEN

**Question.** How is government ID plus liveness verification actually performed?

**Why it matters.** It is the load-bearing safety control in Phase 4. Building it
in-house means storing identity documents, which brings storage, retention and
breach obligations that a solo side project should not take on.

**Options.**
- A KYC vendor, which holds the documents and returns a pass or fail. Preferred:
  no identity documents are ever stored by us.
- DigiLocker-based verification, cheaper, more friction for the user.
- Manual review by the operator. Not acceptable at any volume, and worst on
  liability.

**Recommendation.** A vendor, storing only the verification result and never the
document. Confirm pricing fits inside the verification fee of 199 to 299 rupees.

**Blocks.** Phase 4 build.

**Decide by.** Month 9.

---

## Q12. What happens if the operator is unavailable for a week? — OPEN

**Question.** Who publishes the Thursday digest during travel, illness, or a busy
work week?

**Why it matters.** The Thursday streak is identified in `go-to-market.md`
section 9 as the single health metric of the business, and the month-1 kill
criterion is two missed Thursdays. There is currently no continuity plan.

**Options.**
- Batch ahead: write and schedule three issues in one sitting before any known
  absence. Free, requires discipline, and works only for planned absences.
- A second trusted person with Channel access, which reintroduces the editor
  note problem since the note is the operator's voice.
- Accept a "no digest this week, back next Thursday" note, which is honest and
  costs less trust than silence.

**Recommendation.** Batch ahead for planned absences, and use the honest skip
note for unplanned ones. Never let a week pass silently.

**Blocks.** Nothing to build. Decide the policy before it is needed.

**Decide by.** Week 2.

---

## Q13. Do Grok's terms allow unattended use of a consumer subscription? — OPEN

**Question.** The `agent:grok` source runs the Grok CLI headless, on a schedule or by hand, signed in
with the operator's own consumer subscription. Do xAI's terms allow that, or do they
require an API key or a business plan for automated, unattended use?

**Why it matters.** A suspended account would take the operator's personal subscription
with it. Using an API key instead is out of scope for the harness brief.

**Options.**
- Read xAI's terms and the CLI's own usage policy.
- Run the agent sources by hand, attended, never on a schedule.
- Move to an API key if the terms forbid it, which costs money per run.

**Recommendation.** Read the terms before the first scheduled run. Until then, run
agent sources only by hand.

**Blocks.** Scheduling any `agent:*` source.

**Decide by.** Before the first scheduled agent run.
