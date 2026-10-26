# Turnout v1: tag-along first

Status: draft for discussion, 2026-10-26. Nothing here overrides `SPEC.md` yet. Once
this is agreed, `SPEC.md` sections 3 to 9 get amended to match and this file becomes
the record of why.

## What v1 is

You have a ticket to a comedy show or a concert. You don't want to go alone, or you'd
like to meet people who like the same things. You tell Turnout. We put you in a small
group of verified people holding tickets to the same show. An hour before it starts,
the group meets at a cafe near the venue, then walks over together. Afterwards each
person can quietly flag anyone who made them uncomfortable. That's the whole product.

The event listing and map we already built stay. They become the supply side: the
show you tag along to is a row in our catalog, and the event page is where "find people
to go with" lives.

## Why this shape

- **A ticket is the trust filter.** Someone who paid 1,500 rupees for a specific
  comedian's show has shown intent and taste. Random "anyone up for coffee?" posts
  don't work in India at today's trust levels, and a paid ticket fixes most of that.
- **A group is a safer first meeting than a pair.** Four to six people at a public
  cafe reads as "going to a show together", not as a date. It also makes gender
  balance workable, which one-to-one matching never really is.
- **The show does the talking.** Ninety minutes of shared media gives everyone
  something to say on the walk out. Nobody has to perform.

## What changes from SPEC.md

| SPEC.md says | v1 says | Why |
|---|---|---|
| Hyderabad only, no second city | Hyderabad first, nothing city-specific in the name or the data model | Turnout is the brand. The catalog already takes a city slug |
| Tag-along is phase 4, months 9 to 15 | Tag-along is v1 | It's the product. The listing exists to feed it |
| One-to-one matching, no group chats | Groups of 4 to 6 per show | Safer first meeting, easier gender balance |
| Starts with movies and stand-up | Comedy, concerts, theatre, ticketed gigs. No movies | Movies are cheap and taste-free, so the ticket filters nothing |
| Like or report | Downvote or report, no upvote | People who liked each other will just talk. A like adds nothing |
| One report ends an account | A report suspends at once, pending review. Downvotes add up | A "felt off" and a "felt unsafe" are different signals |
| No social graph before phase 4 | Record who met whom from day one. Show none of it | The graph is what makes v2 possible. Recording it costs nothing |

Everything else in section 9.4 stands: verification before any match, no browsing of
people, women-only opt-in, gender balancing, public places only, a published grievance
officer before the first account.

## The v1 loop

1. **Find the show.** An event page for an eligible show has a "go with a group"
   button. Eligible means a ticketed event in comedy, music or theatre, priced at 499
   rupees or more. The price floor is a guess. Tune it with real data.
2. **Sign up once.** Phone number and OTP, first name, one clear face photo, gender,
   and the women-only preference. Then identity verification (see "Safety").
3. **Prove the ticket.** For BookMyShow, the booking ID. For everyone else, a
   screenshot or PDF. In v1 an operator checks each one by hand in the admin console.
   Most will take under a minute.
4. **Wait for a group.** A group forms when four people of the right mix hold tickets
   to the same show. Up to six. If no group forms by 24 hours before the show, the
   person gets told, with no guilt and no fee.
5. **The meet card.** At T minus 3 hours, everyone in the group sees each other's
   first name and photo, plus the meeting spot (a cafe within 10 minutes' walk of the
   venue) and the time (T minus 60 minutes). No phone numbers.
6. **The group thread.** A plain text thread for that group only, opening with the
   meet card and closing 24 hours after the show. This covers "I'm running late" and
   "we're at the back table". It is not a chat app.
7. **After.** The next morning, each person sees the others' faces and can downvote
   ("I didn't feel comfortable") or report ("I felt unsafe" or "this person did
   something wrong"). Both stay private. Doing nothing is the normal case.

## Safety

These are part of v1, not a later version.

- **Identity.** Government ID check through a vendor (DigiLocker-based or similar,
  `open-questions.md` Q11) plus a liveness selfie that matches the profile photo. We
  keep the vendor's yes or no and a reference, never the ID image itself.
- **Gender balance.** No group has more than 4 of 6, or 3 of 4, of one gender.
  Women can pick women-only groups. If the mix won't work, people wait. Slower
  growth is the price.
- **Public places only.** The meeting spot is a cafe we pick, never a home, never a
  car. The venue is public by definition.
- **Report.** One report suspends the reported account at once and hides it from
  every future group. An operator reviews within 24 hours. A report from a woman about
  a man is never closed without contacting her.
- **Downvotes.** A downvote means the two of you are never grouped again. Three
  downvotes from three different people across three different shows, and the account
  stops being grouped. No appeal in year one.
- **Grievance officer.** Name, address, contact and takedown times published before
  the first account exists (Q10). DPDP Act notice and consent at signup, saying in
  plain words what we store and that past co-attendees may be invited first in future
  (see "The met graph").

## The met graph

When a group meets and nobody in it downvotes or reports anyone, we record a "met"
edge between each pair who checked in. One table, two user IDs, the show, the date.

v1 shows none of it, anywhere. It exists so v2 can do the subtle thing: when you ask for
a group for a show, people you've met before who might like that show get a quiet nudge
("a group is forming for this show"). They never see who asked, and you never see who
got nudged. Groups fill faster, and repeat meetings happen without anyone having to
send a friend request.

The privacy notice says this happens. Subtle is fine. Secret isn't.

## The later versions (not v1)

- **v2: warm nudges.** The met graph in use, as above. Plus "go again with this
  group", offered only when nobody in the group downvoted anyone.
- **v3: open plans.** "I'm going to this gig on Saturday, who's in?" posts, a bit
  like Nomad List meetups. Visible only to people within two hops of you on the met
  graph. That's the Indian version: open, but only among people someone you trust has
  already met.
- **Later: hosted events.** Our own small dinners and walks, sold to people who
  already trust the brand. The phase 5 plan stays roughly as written.

## Not in v1

Movies. Profiles anyone can browse. Follows or friend lists. Messages outside a group
thread. Upvotes or star ratings. Selling tickets. A mobile app (the site stays
mobile-web, and a home-screen shortcut covers most of what an app would). Any city
other than Hyderabad, in practice.

## How we get there

### Step 0: run it by hand (about 4 weeks, no code)

Before building anything, run ten groups by hand.

- A Tally or Google form linked from a few event pages and an Instagram post: name,
  show, ticket upload, gender, women-only preference, Instagram or LinkedIn handle.
- The operator checks tickets, checks identity on a two-minute video call, forms
  groups, picks the cafe, and makes a WhatsApp group per show. The operator leaves the
  group once the meet starts.
- A form the next morning for downvotes and reports.

This tests the only question that matters: do people turn up and want to do it again?
It also tells us where the hand work really goes before we automate any of it.

Gate to step 1: ten groups met, at least 70% of confirmed people turned up, zero safety
incidents, and at least a third asked to go again.

Kill or rethink: fewer than three groups formed in four weeks. Then the demand isn't
there at this price floor, or the ask is wrong.

### Step 1: build the loop (v1)

New code, in the module rules of `AGENTS.md`:

- `src/social/`, a new module that imports `catalog` and `utils` only. It holds
  accounts, tickets, groups, the thread, votes and met edges, with pure grouping logic
  in its own file with unit tests (group size, gender caps, women-only, never-again
  pairs).
- Web: the "go with a group" button on eligible event pages, signup, ticket upload,
  the meet card and the thread. These are the first logged-in pages, so sessions and
  CSRF come with them.
- Admin: a ticket review queue and a report queue. This breaks the invariant that the
  admin only writes `mute_rule`, so `AGENTS.md` changes with it.
- Vendors: an SMS OTP provider and an identity vendor. Both cost money per use, so
  pick them in step 0 (Q11).

### Measures for v1

| Metric | Target after 3 months |
|---|---|
| Groups that met | 100 |
| Safety incidents | 0 |
| Show-up rate of confirmed members | 75% or better |
| People who go again within 60 days | 30% or better |
| Gender split across all groups | no worse than 60/40 |

## Open questions

1. **Money.** The spec wanted a verification fee as a safety filter. Do we charge in
   step 0, or only once there's an entity to take money (spec phase 4 says LLP or Pvt
   Ltd first)?
2. **Who's on the ground?** Picking cafes, and answering a report fast, are easier
   with one person in Hyderabad (Q3).
3. **Group size.** Four to six is a guess. Comedy might suit four, concerts six.
4. **Seats.** A group with tickets in different rows still meets before and after. Is
   that enough, or should we push people to book together?
5. **The thread or WhatsApp.** In-app keeps phone numbers private. WhatsApp is what
   everyone already uses. Step 0 uses WhatsApp, and how that goes decides it.
