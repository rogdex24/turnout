# Turnout mobile v1: final design spec (Nightlife)

Direction: Nightlife in the Gallery Night palette, picked in taste round 3, with every fix from the design review applied.
The mockups in this folder are the reference for the app build. `src/base.css` is the shared system, `src/screens/*.html` hold one screen each and `src/build.py` writes a dark file (`<screen>.html`) and a light file (`<screen>-light.html`) per screen.

## 1. Tokens

### Colour roles

| Role | Dark | Light | Use |
|---|---|---|---|
| `app-bg` | #121212 | #ede8e1 | Page |
| `app-surface` | #1a1a1a | #f6f2ed | Cards, sheets, fields |
| `app-surface-raised` | #232323 | #e2dcd3 | Plan bar, notes, pre-reveal tiles |
| `app-line` | #2f2f2f | #cfc8be | Dividers, card borders (decorative) |
| `app-outline` | #6b665f | #87827b | Borders of controls (3:1 on bg) |
| `app-ink` | #ede8e1 | #181818 | Text and icons |
| `app-muted` | #9a958e | #645f59 | Secondary text |
| `app-signal` | #ea6e12 | #94400a | Live signal only |
| `app-signal-soft` | signal at 14% | signal at 8% | Background of the live chip |
| `app-primary` / `app-on-primary` | #ede8e1 / #121212 | #181818 / #ede8e1 | The one primary button per screen |
| `app-scrim` | black 60% | #181818 45% | Behind sheets |
| `app-on-photo` | #f3eee7 | #f3eee7 | Text on posters and photos |
| `app-marquee` | #1a1a1a | #181818 | Marquee band (dark in both themes) |

Contrast checked (computed from DESIGN.md by `test/mobileTokens.test.ts`; DESIGN.md wins over this table): signal #94400a on light bg 5.75, on surface 6.29, on raised 5.14, on the soft chip 5.14 over bg and 5.59 over surface (the "In 48 min" chip; the old #a84a08 was 4.13). Dark signal #ea6e12: 6.0, 5.6, 5.0. Muted on bg, surface and raised: dark 6.30, 5.85, 5.29, light 5.19, 5.67, 4.64. Outline on bg: dark 3.29, light 3.13. The live chip sits on bg or surface only: in dark it is 4.15 on raised.

### Type

| Token | Font | Size/line/weight | Scales with text size |
|---|---|---|---|
| `display-hero` | Big Shoulders Display 900 | 116/90 | No (fixed: the giant meet time) |
| `display-band` | Big Shoulders Display 800 | 28/28, caps, +0.06em | No (marquee band) |
| `display-poster` | Big Shoulders Display 800 | 30 to 70, caps | No (show titles on posters; poster box is fixed) |
| `display-numeral` | Big Shoulders Display 800 | 24 to 36 | No (price, count, code digits) |
| `display` | Inter 600 | 28/34 | Yes, cap 1.6 |
| `title-large` | Inter 600 | 22/28 | Yes, cap 1.6 |
| `title` | Inter 600 | 17/24 | Yes, no cap |
| `body` | Inter 400 | 15/22 | Yes, no cap |
| `control` | Inter 500 to 600 | 15/20 (buttons 17) | Yes, cap 1.6 |
| `meta` | Inter 400 | 13/18 | Yes, no cap |
| `label` | Inter 500 | 12/16 | Yes, cap 1.3 |

- Display numerals stay fixed and labels scale, as F4 says.
- Tabular figures (`fontVariant: ['tabular-nums']`) on every time, date, price, count and code.
- Section heads are sentence case Inter 600 (`title-large` or `title`). No eyebrows. No all-caps labels outside the wordmark, posters, the marquee band and `PM`.
- Headlines are one colour.

### Shape, space, motion

- Radius: 14 fields and faces, 16 cards, 20 the featured card, 24 sheet top, pill for buttons and chips.
- Spacing on a 4 grid; page gutter 16 (20 for hero text).
- Hit areas: 44pt minimum for chips, icon buttons, links and rows. Primary button 56, secondary 48.
- Pressed: rows, cards and links go to opacity 0.85; buttons, chips and icon buttons scale to 0.97. Both within 100 ms. Focus ring 2px ink, offset 2.
- Motion only on group confirmed, meet card live and "I'm here" (F5). Loops play 2 to 3 times and stop. Reduced motion turns them off and swaps the reveal for a crossfade.
- No blur and no shadows on bars. Bars and docks are solid with a 1px top rule.

### Icons

Phosphor everywhere (`phosphor-react-native` 3.0.6 in the app; Phosphor web 2.1.1 in the mockups). Regular weight by default, Fill for the active tab and small status marks, Bold only inside the live chip. Back is `CaretLeft`. Tabs: `Ticket` Shows, `CalendarCheck` Plans, `UserCircle` You.

## 2. Rules (the review fixes)

1. Plan bar: a solid `surface-raised` strip docked on top of the tab bar, full width. The list gets a bottom inset of tab bar plus plan bar. Same rule for every sticky dock (`.dock`).
2. Two loud moments only: the marquee band on the show page and the giant time on the meet card. Everything else is quiet.
3. One-colour headlines.
4. "How it works" is three plain sentences, no numbering.
5. Posters are real photos as a one-hue duotone per category: comedy burnt orange, music smoke, theatre warm ink. No glyph art, no category pill; the category is in the text line ("Stand-up comedy", "Live music", "Theatre").
6. No middle dots in meta strings. Use commas or line breaks. The marquee band keeps its dot.
7. Meet card shows real photos at T-48m. No "PHOTO" labels anywhere. Before T-3h the plan screen shows the pre-reveal state: a count in a display numeral and the reveal time. No names, no photos and no per-person placeholder tiles (A13 tests this).
8. "Meet card" is a plain screen title, not a pill.
9. Safety is a labelled button ("Safety") and opens a sheet with Leave this plan and Report someone always visible.
10. No in-app theme toggle. The app follows the system. Every screen ships in dark and light.
11. 44pt targets. The BookMyShow link is a secondary button.
12. Pressed states as above.
13. Light signal #94400a.
14. Ticket copy: "Add your BookMyShow ticket."
15. Orange has one job: live signal (finding your group pulse, "In 48 min", "Group chat is open", someone just arrived). Counts and prices are ink.
16. One Hyderabad cue: the cafe photo on the meet card (Cafe Niloufer in the mockup). The app shows the real photo of the picked cafe. No promo copy.
17. Phosphor only.
18. Text scaling per the type table.
19. Tabular figures for data.
20. Motion stops after a few plays; reduced motion respected.
21. Decorative marquee bulbs, the date block on posters and the grain are hidden from screen readers.
22. Every plan state and the late case are designed (section 4).

## 3. Components

- `Poster` (featured 180 high in a ticket card, tile 196, hero 336, thumb 40): duotone photo, bottom scrim, title in `display-poster`, sub line in Inter. `image_url` is null today (A7), so the default is the placeholder: a flat category tone (comedy #6b2a0c, music #2a2826, theatre #3a2c22) with the same title type and a fine grain. The duotone photo is applied when an image exists. Home shows both.
- `TicketCard`: poster, perforation, stub with time, venue and price. No looking count on Home (A7).
- `PlanBar`: thumb, title "Traffic Jam Tales, Sat 7:00 PM", status line, caret.
- `StatusLine`: signal for live states (pulse dots), ink for done states, muted for waiting.
- `Face`: 62x76 photo tile, first name under it. Used only from T-3h. A leaver's tile goes.
- `RevealCount`: before T-3h, the group size as a display numeral, "people with tickets" and "Names, photos and the cafe at 4:00 PM". No tiles.
- `Sheet`: grabber, title, lead, content, one primary and one secondary action.
- `Row`: icon, title, sub, caret; 56 high.
- `Note`: raised surface with an icon, for neutral information. Rejected and called-off states use `Note` too; never `danger` red.
- `Field`: 56 high, outline border, label above, help below.

## 4. Screens and states

| File | Screen | State |
|---|---|---|
| welcome | Welcome | Card 1 of 3 with the trust line |
| signin-phone | Sign in | Phone entry |
| signin-code | Sign in | Code from WhatsApp |
| profile | Profile | Notice and consent, then the profile form |
| home | Home | Shows tab with the plan bar |
| show | Show | Marquee, stub, looking count, how it works |
| show-go | Show | Go with a group sheet |
| ticket-add | Add your ticket | `needs_ticket` |
| ticket-checking | Add your ticket | `checking_ticket` |
| ticket-rejected | Add your ticket | `ticket_rejected` |
| plans | Your plans | Tab with plans in several states |
| plan-finding | Plan detail | `finding_group` |
| plan-confirmed | Plan detail | `group_confirmed`, before the reveal |
| plan-three | Plan detail | Group of 3 after someone left |
| plan-no-group | Plan detail | `no_group`, called off |
| plan-cancel | Plan detail | Leave this plan sheet |
| meet | Meet card | `meet_card_live` 48 min before the meet (5:12 PM). "I'm here" is disabled with the hint "You can tap this from 5:30 PM"; check-in opens at T-90m and closes at T+60m. Once a member checks in, their face gets the signal ring and the status line shows it. |
| meet-safety | Meet card | Safety sheet |
| thread | Group thread | Open, with "Running late" quick message |
| after | After the show | Morning after |
| you | You tab | Settings and safety |
| report | Report | Report someone |

### Running late

The plan has no "running late" feature. The design adds it as a quick message chip above the thread composer ("Running 10 min late", "I'm here", "Where are you sitting?"). It sends ordinary text, so the server needs no change. The meet card shows nothing extra for a late member.

## 5. Copy rules

- Never "verified", "ID check", "ID-checked", "KYC". No em dashes.
- First names only on group surfaces. No handles.
- No guilt copy on leave or no group.
- Push text carries no names or cafe names.
- "We delete it after the show" on the ticket screens.
- Location: "Your location stays on your phone."

## 6. Image sources

Mockup photos are stand-ins for the build. They are not shipped in the app.

| File | Source | Licence |
|---|---|---|
| `poster-comedy.jpg` | "Amir Asgharnejad Parkteatret (212237)", Tore Sætre, Wikimedia Commons | CC BY-SA 4.0 |
| `poster-music.jpg` | "DFC 5470 A guitarist performs on stage...", PattayaPatrol, Wikimedia Commons | CC BY-SA 4.0 |
| `poster-theatre.jpg` | "Stalinjeet& JassiJaspreet in play Swami", Stalinjeet, Wikimedia Commons | CC BY-SA 4.0 |
| `venue-shilpa.jpg` | "Shilpa Kala Vedika, Hyderabad", Bathula Ganesh Goud, Wikimedia Commons | CC0 |
| `venue-rbharathi.jpg` | "Ravindra Bharathi auditorium", Adbh266, Wikimedia Commons | CC BY-SA 4.0 |
| `cafe-niloufer.jpg` | "Café Niloufer, Hyderabad", Mohammad Anees Qamar, Wikimedia Commons | CC BY 4.0 |
| `irani-chai.jpg` | "Irani chai and osmania biscuits", manojkumar chidambaram, Wikimedia Commons | CC BY-SA 4.0 |
| `face-*.jpg` | randomuser.me portraits (placeholder service for mockups) | Mockup use only |
