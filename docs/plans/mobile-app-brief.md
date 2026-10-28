# Engineering brief: the Turnout mobile app

For: the senior engineer who owns the app from first commit to store release.
From: Abu. Draft, 2026-10-26.

Read [`v1-tagalong.md`](v1-tagalong.md) first. It says what v1 does and why. This brief
says how I want it built and how good it has to feel. Where the two disagree,
`v1-tagalong.md` wins on product and this file wins on engineering.

`SPEC.md` section 6 says "no mobile app". That decision is reversed. I'll amend the
spec, so don't treat that line as a blocker.

## The job in one paragraph

Build Turnout as a React Native app for iOS and Android. People with a ticket to a
comedy show or a concert get put in a small, verified group for that show, meet at a
cafe nearby an hour before, and walk in together. Afterwards they can quietly flag
anyone who made them uncomfortable. The app has to feel as considered as the best
consumer apps on anyone's phone, and it has to be built like something we'll still be
maintaining in three years. Both are requirements. Neither is a nice-to-have.

## Three rules that override your instincts

1. **Reuse before you write.** Use what Expo, React Native, an installed package or a
   maintained open-source project already does. Write custom plumbing only when nothing
   usable exists. When you do write it, the PR says what you searched for and why none
   of it fit, with links.
2. **Nothing visual is invented from scratch.** Colours come from an existing,
   accessible palette system. Icons, type and motion come from proven libraries.
   Layouts and flows start from real apps people already like (see "Design
   research"). Your job is to choose, adapt and polish, not to originate.
3. **Every screen is earned.** If a screen, field or tap doesn't help someone get to
   the show with a group, it doesn't ship.

## What already exists and what you can take from it

This repo (`rogdex24/turnout`) is a Bun and TypeScript service:

- **The catalog.** `sync` pulls Hyderabad events from Communitie, Luma, District,
  BookMyShow, Townscript, MeraEvents, AllEvents and Growezy into SQLite, with dedupe,
  categories, areas and geocoded venues (`src/catalog`, `src/ingestion`). That's your
  list of shows. Don't rebuild it.
- **A public JSON API and feeds** in `src/web`. Read `listable_event` through them,
  never the raw tables (`AGENTS.md`, "Invariants").
- **A design system** in `DESIGN.md`: tokens in its front matter, Inter, Phosphor
  duotone category icons in a sprite. The app starts from these tokens and extends
  them for native. It doesn't fork them.
- **Engineering norms** in `AGENTS.md`: Biome, strict TypeScript with
  `noUncheckedIndexedAccess`, dependency-cruiser rules, lefthook hooks, reproduce a
  bug with a failing test before the fix. The app follows the same norms.

Put the app in this repo as `apps/mobile`, with Bun workspaces, so it shares types
with `catalog` instead of copying them. If the monorepo fights Expo or Metro, tell me
before splitting it out.

## Product scope for v1

Screens, in the order a new person meets them:

1. **Welcome.** Three short cards: what happens, that everyone's verified, that you
   meet in public. Then sign in.
2. **Sign in.** Phone number and a WhatsApp code. Nothing else at this step. The code
   is sent and checked by our own server, which issues short-lived access tokens with
   a refresh token. The number needs WhatsApp, and there is no SMS fallback in v1
   (amended 2026-10-26).
3. **Profile.** First name, one photo, gender, the women-only preference. Four
   fields. No bio, no quiz, no interests in v1.
4. **Handle check** (amended 2026-10-26; moved from M4 to M3). An Instagram or LinkedIn
   handle the operator checks. There is no identity check in v1. Explain why in one
   sentence before the field.
5. **Home.** Upcoming eligible shows near you, from the catalog. The one primary
   action is "Go with a group".
6. **Show.** Poster, time, venue, price, the link out to buy if you haven't yet, and
   how many people are already looking for a group.
7. **Add your ticket.** BookMyShow booking ID, or a screenshot or PDF. Then a clear
   "we're checking it" state.
8. **Your plans.** Every show you're in, with where each one stands: checking ticket,
   finding your group, group confirmed, meet card live, done.
9. **Meet card.** Live from 3 hours before the show: first names and photos, the cafe,
   a map, the meet time, and "I'm here".
10. **Group thread.** Text only, that group only, open from the meet card until 24
    hours after the show.
11. **After the show.** The next morning, the faces again, with a private "I didn't
    feel comfortable" and "Report". Doing nothing is the default and the copy says so.
12. **Settings and safety.** Women-only, blocked people, how matching works, the
    grievance officer, delete my account.

Out of v1: profiles anyone can browse, follows, DMs, upvotes or ratings, movies,
buying tickets in the app, any city but Hyderabad in practice.

## Design research (do this before the first screen)

Spend the first week on research and come back with a board. I want to see what we're
borrowing and from where before anything gets built.

- **Apps to study.** Timeleft (strangers at a dinner table, the reveal countdown),
  222 (phone-first signup as a quality filter), Partiful and Luma (event pages and
  invites people enjoy opening), Hinge (photo-first profiles, warm copy), Bumble BFF,
  NomadTable (meetups among travellers), Airbnb (trust, maps, booking states), and
  Headout or District for the Indian event context.
- **Where to look.** Mobbin for real screens and full flows, especially onboarding,
  verification, empty states and post-event feedback. Botsi-style onboarding
  teardowns. Apple's Human Interface Guidelines and Material 3 for platform behaviour.
- **What to bring back.** For each step of the v1 loop, two or three reference
  screens with a note on what we take from each. A palette decision. A type scale. A
  motion language. Show me the board before you build.

Lessons already in hand, so you don't relearn them:

- Timeleft forces a long personality quiz before you can book, and critics single it
  out as the worst part. We ask for four fields and nothing more.
- Timeleft keeps you guessing until the night before, which feels like suspense to
  some people and anxiety to others. We show the group's first names and photos once
  the group confirms, so the person knows who they're walking in with.
- Timeleft unlocks an icebreaker in the app 30 minutes before. Worth copying in a
  quieter form: one optional prompt on the meet card, never a game.

## The visual bar

"Premium" here means calm, confident and fast. It doesn't mean dark mode with gold
accents.

- **Palette.** Start from Radix Colors or an equivalent published scale with tested
  contrast in light and dark. One accent, as `DESIGN.md` already rules. Every pair
  meets WCAG AA.
- **Type.** Inter, as on the web. Respect Dynamic Type on iOS and font scale on
  Android. Test the largest size.
- **Icons.** Phosphor, as on the web (`phosphor-react-native`). Duotone for
  categories, regular for UI.
- **Motion.** Reanimated and Gesture Handler. Springs, not linear easing. Every
  animation can be interrupted. Respect Reduce Motion. The moments worth motion: the
  group confirming, the meet card going live, "I'm here".
- **Haptics.** `expo-haptics` on the confirming moments only. Not on every tap.
- **Native feel.** Native stack transitions, native tabs, native sheets, the system
  back gesture. Nothing that feels like a website in a frame.
- **Images.** `expo-image` with blurhash placeholders. No layout shift, ever.
- **Empty and error states** are designed screens, not leftovers. "No group yet" is
  the most common screen in the app, so it gets the most care.

## Words, journey and the quiet pull

The copy carries this product as much as the UI does.

- **Talk like a person.** Write "You're in. We'll tell you who's coming once your
  group is set." Never "Your request has been submitted successfully."
- **Never sell loneliness.** `go-to-market.md` section 7.1 applies to every string in
  the app. No "alone", no "no friends", no "new in the city". Sell the plan: the show,
  the cafe, the time.
- **One decision per screen.** Show only what the person needs for the step they're
  on. The ticket screen doesn't mention the meet card.
- **Guided, not tutored.** No coach marks, no tour. Each screen's own layout teaches
  it. The one exception is the first "Go with a group" tap, which gets one sentence on
  what happens next.
- **Status is always visible.** At any moment the person can see where they stand
  (checking ticket, finding a group, confirmed) and what happens next, with a time.
  Uncertainty is what makes people cancel.
- **Honest pull, never dark patterns.** Real social proof ("9 people are looking for a
  group for this show"). Real scarcity only ("2 spots left in this group"). The
  anticipation of the reveal. A gentle "the cafe's a 6 minute walk" push on show day.
  No fake counts, no fake timers, no guilt copy, no confirmshaming on cancel.
- **Notifications are part of the journey.** Ticket accepted, group confirmed, meet
  card live, "you're 10 minutes away". Every push has a reason and a time. No "we miss
  you" pushes.

## Stack

These are my picks from a short look at the current tooling. Challenge any of them in
week 1 with evidence. After that, they're settled.

| Need | Pick | Why |
|---|---|---|
| Framework | Expo, current SDK (58 as of October 2026), New Architecture, development builds | Expo is what React Native's own docs recommend. EAS covers builds, updates and submission |
| Navigation | Expo Router | File-based, native stacks and tabs, typed routes, deep links without extra plumbing |
| UI components | `react-native-reusables` (shadcn/ui for React Native) on NativeWind | The web already runs shadcn and Tailwind from `DESIGN.md` tokens, so the same tokens drive both |
| Server state | TanStack Query | Caching, retries, offline replay. Don't hand-roll fetch state |
| Local state | React state plus one small store (Zustand) if it's truly needed | No Redux |
| Forms | React Hook Form with Zod | Zod schemas are shared with the server |
| Auth | Our own: a WhatsApp code sent and checked by the Bun server, then our own short-lived access tokens and refresh (amended 2026-10-26; replaces Better Auth) | TypeScript, self-hosted, no per-user pricing, no SMS vendor |
| Handle check | The operator checks an Instagram or LinkedIn handle in the admin console (amended 2026-10-26; replaces the identity vendor, Q11 closed) | We do not collect identity documents |
| Group thread | A hosted chat SDK with React Native UI (Stream Chat or similar) if the cost fits. Otherwise a plain thread on our own server | Chat looks small and isn't. Moderation, read state and push come with the SDK |
| Maps | `react-native-maps` | One cafe and one venue pin. Nothing fancier |
| Push | `expo-notifications` | Android only until the Apple account exists (amended 2026-10-26) |
| Secure storage | `expo-secure-store` for tokens | Keychain on iOS, Keystore on Android |
| Errors | Sentry for React Native | Crashes with source maps from EAS builds |
| Analytics | PostHog React Native | Already in use. Funnels for the loop, session replay with masking on |
| Payments, later | Razorpay | Not in v1 unless open question 1 in `v1-tagalong.md` says so |

## Quality gates

All of these run in CI on every pull request, and the lefthook hooks run the fast ones
locally, same as the web.

- **Lint and format.** Biome, the same config as the root. Add ESLint only for rules
  Biome doesn't have yet (`eslint-plugin-react-hooks`, React Native specifics), and say
  which ones.
- **Types.** `strict` plus `noUncheckedIndexedAccess`. No `any` without a comment
  naming why.
- **Unit and component tests.** Jest with `jest-expo` and React Native Testing
  Library, plus `expo-router/testing-library` for routes. The grouping rules,
  eligibility and state machines live in pure modules with tests.
- **End-to-end.** Maestro flows for the whole v1 loop on both platforms, run on EAS
  Workflows against development builds. The flows use a seeded test backend, never
  production.
- **Visual.** A screenshot for every screen and state, in light and dark, at default
  and largest text size, on one small and one large device. Diffs block the PR.
  Storybook for React Native holds the component states. Pick the diff tool in week 1
  and tell me why.
- **Accessibility.** Every control has a label and role. Tap targets are at least
  44 points. Screen reader passes on the v1 loop with VoiceOver and TalkBack before
  each release.
- **Health.** `expo-doctor` and `expo install --check` in CI. Dependency updates
  through Renovate, pinned versions, nothing younger than two weeks.
- **Performance.** Cold start and the time until home shows real content, measured
  on a mid-range Android phone, since that's what most of our users carry.
  Lists use FlashList.

## Security and privacy

This app holds faces, phone numbers, handles and where people will be tonight. Treat it that way.

- Follow OWASP MASVS at level L1 at minimum, L2 for auth and storage.
- No secrets in the bundle. Everything privileged happens on the server.
- Tokens in secure storage only. Short-lived access tokens with refresh.
- We do not collect identity documents (amended 2026-10-26).
- Location only while the meet card is live, foreground only, and only to show
  distance. Never stored after the show.
- Every endpoint checks that the caller belongs to the group whose data they're asking
  for. Write tests for the "not your group" case on every one.
- Rate limits on OTP, ticket upload and report.
- DPDP Act: plain-language notice and consent at signup, deletion that actually
  deletes, and a data map in the repo of what we store, why and for how long.
- Screenshots of other people's faces can't be stopped, so the after-show screen
  doesn't make them easy. No share button, no save.

## Milestones

Each one ends with something I can install from TestFlight and Play internal testing.

1. **Week 1: research and setup.** The design board, palette and type decisions, the
   stack confirmed, the Expo app in `apps/mobile` with lint, types, unit tests, one
   Maestro flow and one visual snapshot running in CI.
2. **Weeks 2 to 3: the shell.** Welcome, sign in, profile, home and show pages
   reading the real catalog. Light and dark, all states designed.
3. **Weeks 4 to 5: the loop.** Ticket upload, admin review queue, grouping, your
   plans, meet card, push notifications.
4. **Weeks 6 to 7: trust.** Group thread, after-show feedback, report
   handling, women-only, gender caps, settings, account deletion.
5. **Week 8: hardening.** Accessibility pass, performance on a mid-range Android
   phone, a security review against MASVS, store listings, privacy labels.

The manual step 0 in `v1-tagalong.md` runs alongside milestones 1 and 2. What it
teaches us can change milestones 3 and 4, so expect that.

## Done means

- Every gate above is green on both platforms.
- I've used the full loop on the iOS simulator (until the Apple account exists) and a
  real mid-range Android phone, in light and dark, with large text on, and nothing
  felt unfinished.
- Every screen in the app has a reference screen in the design board it traces back
  to.
- Every custom piece of plumbing has a PR note saying what existing project it
  replaced and why that project didn't fit.

## Decisions I need from you in week 1

1. The visual diff tool, and what it costs.
2. The chat SDK, or our own thread, and what each costs at 1,000 groups a month.
3. ~~The identity vendor~~ Dropped on 2026-10-26: no identity check in v1.
4. Whether the monorepo works with Expo and Metro, or the app needs its own repo.
