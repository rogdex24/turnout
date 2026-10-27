# Brief for screen authors (final Nightlife set)

Read first: `../spec.md` (tokens, type, rules, components), `base.css` (shared classes), `build.py` (macros and lint), `screens/home.html` (the reference screen; copy its structure).

## How to make a screen

1. Write `screens/<name>.html`. Start from `screens/home.html`: same `<head>`, `<!-- @head -->`, a `<style>` block for this screen's layout only, a `.frame` with `<!-- @status 9:41 -->` (or `@status-photo` over a photo), and `<!-- @gesture -->` last. Tab screens add `<!-- @tabbar shows|plans|you [badge] -->`.
2. Do not edit `base.css` or `build.py`. Use the shared classes. If you need a new shared piece, write it in the screen `<style>` and list it in your report.
3. No colour, font size or radius outside the spec tokens. Use `var(--...)`. On photos use `var(--on-photo)`.
4. Images: `img/<file>.jpg` in `src` or `url(img/<file>.jpg)`; the build inlines them. Files: `poster-comedy`, `poster-music`, `poster-theatre`, `venue-rbharathi`, `venue-shilpa`, `cafe-niloufer`, `irani-chai`, `face-priya`, `face-sana`, `face-meera`, `face-arjun`, `face-rahul`, `face-kiran`, `face-you`.
5. Build: `python3 -I /code/.plans/designs/final/src/build.py <name> [<name>...]`. It writes `../<name>.html` (dark) and `../<name>-light.html` (light) and fails on copy breaks.
6. Screenshot: `/tmp/pal/scripts/shot.sh /tmp/pal/shots/<you> /code/.plans/designs/final/<name>.html /code/.plans/designs/final/<name>-light.html`. Look at both themes. Fix clipping, overlap and contrast. Frame is 390x844; content may run off the bottom like a scroll, but nothing important may hide under a dock, plan bar or tab bar.
7. Add `data-component-id` to every interactive element and give icon-only buttons an `aria-label`. Decorative things get `aria-hidden="true"`.

## Visual rules (summary of spec section 2)

- Two loud moments only: the marquee band (show page) and the giant meet time (meet card). Everything else is quiet Inter. Display face also for the wordmark, poster titles and single data numerals (price, count, code digits).
- Section heads: sentence case, `t-title-l` or `t-title`. No eyebrows, no all-caps labels, no numbered steps, no middle dots (use commas or line breaks).
- Orange (`--sig`, `.live`, `.status-text`, `.live-dot`, `.eq`) only for live signal: finding your group, "In 48 min", thread open, someone just arrived. Never for prices, counts, buttons or headings.
- One primary `.btn` per screen. Secondary `.btn2`, tertiary `.btn3`, links `.link`. 44pt targets everywhere.
- Rejected, called off and error states use `.note` (neutral), never red.
- Pushed screens use `.navbar` with a `ph-caret-left` back `.iconbtn` (aria-label "Back") and a centred Inter title.
- Bars and docks are solid (`.dock`, `.planbar`, `.tabbar`). No blur, no shadows.
- Phosphor icons only (`ph`, `ph-fill`, `ph-bold`).
- `tnum` on times, dates, prices, counts, codes.

## Product facts (binding)

- Plan states: needs_ticket, checking_ticket, ticket_rejected, finding_group, group_confirmed, meet_card_live, no_group, withdrawn, done.
- Groups of 4 to 6. After T-24h a group goes ahead with 3; below 3 it is called off.
- Reveal at T-3h: first names, photos, the cafe. Before T-3h: NO names, NO photos and NO per-person placeholder tiles; show a count only.
- Meet at T-60m at a cafe within a 10 minute walk of the venue. "I'm here" works from T-90m to T+60m.
- Thread: text only, open T-3h to T+24h, read-only after T+24h or when no_group. Long-press on someone else's message offers Report. Links are not auto-linked.
- First names only on group surfaces. Never handles.
- Banned words: verified, ID check, ID-checked, KYC. No em dashes. No guilt copy on leaving or no group. No confirmshaming.
- Ticket proof: BookMyShow takes a screenshot only (JPEG, PNG, HEIC). Other sellers also take a PDF. Copy "We delete it after the show".
- Location is foreground only and never leaves the phone: "Your location stays on your phone."
- Report: 112 is always visible and dialable.

## Shared demo data (use these, keep them consistent)

- Member: you are Ananya (face-you).
- Active plan: "Traffic Jam Tales", stand-up comedy, Sat 31 Oct, show 7:00 PM, Shilpa Kala Vedika, Madhapur. Poster class `comedy`. Venue photo `venue-shilpa`.
- Group: Priya, Sana, Meera, Arjun, Rahul and you (6). Group of 3 variant: Priya, Arjun and you.
- Cafe: Cafe Niloufer, Hitec City (photo `cafe-niloufer`). 6 min walk to the venue. Meet 6:00 PM. Reveal at 4:00 PM.
- Meet card time in the mockup: 5:12 PM, "In 48 min".
- Second show: "The Biryani Wars", theatre, Sat 31 Oct 7:30 PM, Ravindra Bharathi (venue-rbharathi). "The Monsoon Theory", live music, Fri 30 Oct 8:00 PM, Phoenix Arena, HITEC City, from ₹1,499.

## Exact copy

- Welcome trust line: "Everyone signs in with a phone number, a real photo and a social profile we check."
- Women-only: "Only women and non-binary people who chose this." In settings add: "Applies to plans you join from now on."
- Handle why we ask: "So we can check you're a real person. Others in your group never see it."
- Handle pending strip: "We're checking your profile. Usually within a day. You can add a ticket in the meantime."
- Sign in: 10 digit number starting 6 to 9, +91 prefix. "We'll send a code on WhatsApp." After 60 s: "Not there yet?" Refusal: "We can't sign you in with this number."
- Ticket: title "Add your BookMyShow ticket". "We delete it after the show".
- Show page: lookingCount copy: 0 "Be the first to look for a group", 1 "1 person is looking for a group", many "12 people are looking for a group". "Go with a group" disabled with a reason when not eligible.
- Location permission line: "Your location stays on your phone."
- After the show: doing nothing is the default and the copy says so ("Nothing to do here if it went fine."). "I didn't feel comfortable" asks to confirm. Closed after 72 h. No share, no save.
