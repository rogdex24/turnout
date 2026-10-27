# Turnout mobile design board

Signed off by <user> on <date>

(Left blank on purpose. The F6 review fills this in.)

## Purpose

The board is the reference the mobile app is built and reviewed against. It sets out, for each screen in the v1 app, what we looked at in other apps, what we take, what we leave, and which Nightlife spec rules apply. Nothing in `apps/mobile` should be built that the board does not cover.

Steps B1 to B16 follow section 1 of the v1 mobile plan:

| Step | Screen or topic |
|---|---|
| B1 | Welcome |
| B2 | Sign in, phone then code |
| B3 | Profile with notice and consent |
| B4 | Handle checking and rejected |
| B5 | Home (Shows tab) |
| B6 | Show page and go sheet |
| B7 | Add your ticket (screenshot proof) |
| B8 | Your plans tab |
| B9 | Plan detail |
| B10 | Leave this plan |
| B11 | Meet card |
| B12 | Group thread |
| B13 | After the show |
| B14 | Settings and safety |
| B15 | Notifications |
| B16 | Platform conventions |

## Files

- `board.html`: one static page with B1 to B16. No scripts, no images, no third-party assets. Open it in a browser. It follows the phone or desktop light or dark setting.
- `sources.md`: the same references as a flat list, with URL, access date, HTTP status and the take and leave notes.
- `refs/`: optional local folder for reference screenshots. It is git-ignored and never committed.
- Final mockups (`final/meet.html` and the others) live outside git. The board links to them by name only.

## How to review

1. Open `board.html` and go step by step.
2. For each step, read the screens table, the approved copy and the spec rules. Open the named mockup next to it, in both dark and light.
3. Check each reference: does the take make sense for Turnout, and is the leave something we really do not want?
4. Check the screen against the rules for that step. Rejected states must use the neutral Note and never danger.
5. Note anything missing or wrong in the review thread, against the step or sub-ID, for example `B9.2`.

Approved copy is word for word and must not be edited without a new sign-off:

- B1: "Everyone signs in with a phone number, a real photo and a social profile we check."
- B3 women-only: "Only women and non-binary people who chose this."
- B3 handle, why we ask: "So we can check you're a real person. Others in your group never see it."

## Sub-IDs and route files

Each step has sub-IDs such as `B7.2`. From Week 2, every route file starts with this line:

```ts
// Board: B<step>.<n>
```

For example `// Board: B7.2`. The trace test fails on a missing or unknown ID, so a screen cannot ship without a place on this board.

## Open questions for F6

- B3.1 (notice and consent) has no mockup in `final/`. Decide whether it is a full screen or a Sheet.
- B4.2 (handle rejected) has no mockup in `final/`. It is built from the neutral Note with a Change handle button.
- B1 cards 2 and 3 reuse the card 1 layout and have no separate mockup.
- No reference screenshots were collected, so `refs/` is empty.
- Several reference sites block scripted fetches. Their entries in `sources.md` carry the HTTP status, and the claims were read through search results. A reviewer with a browser should open those links once before sign-off.
