# Screenshots

Plan A27. The Play listing needs 2 to 8 phone screenshots. They come from the same pinned device runs as the visual
baselines, so the listing shows the real screens drawn from Storybook fixtures (made-up people, made-up shows), never a
real person, a real ticket or a real phone number.

## Where the pictures come from

`apps/mobile/.maestro/visual/baselines/<target>/<story>/<theme>-<text>.png`, in Git LFS. A CI device run makes them and
`bun scripts/visual-accept.ts <run-id>` commits them (`docs/plans/mobile-visual-testing.md`). Use the `android-large` target,
`light-default.png` for the listing (the phone-sized, default text, light theme shot).

State of the baselines on 2026-10-31: every target has a file for each story in `stories.json`, theme and text size (200
per target). `docs/release-gate.md`, item 2, names the device runs they came from.

## The list, in the order Play shows them

| # | What it shows | Story id (`screens-<screen>--<story>`) | Baseline folder | In `stories.json` | Caption for the listing |
| --- | --- | --- | --- | --- | --- |
| 1 | Shows coming up | `screens-home--loaded` | `home` | Yes | Pick a show you have a ticket for |
| 2 | One show, and how it works | `screens-show--ready` | `show` | Yes | See who else is going |
| 3 | Plan with a confirmed group | `screens-plan--group-confirmed` | `plan-group-confirmed` | Yes | We put you in a small group |
| 4 | Meet card three hours before | `screens-meet--open-to-check-in` | `meet-open` | Yes | See where to meet, and how far it is |
| 5 | Group chat | `screens-thread--conversation` | `thread` | Yes | Chat with your group |
| 6 | After the show | `screens-after--ready` | `after` | Yes | Tell us how it went. Only we see it |
| 7 | Your profile | `screens-profile--filled` | `profile` | Yes | One photo, your first name |
| 8 | Sign in | `screens-signinphone--empty` | `sign-in-phone` | Yes | A code on WhatsApp, no password |

The first two are the minimum if the others are not ready by Wed 11-11. The sign-in code and "not on WhatsApp" screens
(`sign-in-code`, `sign-in-not-on-whatsapp`) are baselines too, but they are not selling shots, so they stay out of the
listing.

Story names above come from the `Screens/*` stories (for example `Screens/Plan` has `GroupConfirmed`, `Screens/Meet` has
`OpenToCheckIn`, `Screens/Thread` has `Conversation`, `Screens/After` has `Ready`, `Screens/Profile` has `Filled`).

## Rules for the images

- Light theme, default text, `android-large`. The dark and largest-text shots stay baselines only.
- Play's size rule: each side between 320 and 3840 pixels, and the long side no more than twice the short side (check the
  current rule in Play Console on the day). The `android-large` shot is 1440 by 3120 and the `android-small` shot is
  720 by 1520, both a little taller than 2 to 1. Crop the status bar and the bottom gesture bar so the long side fits
  (1440 by 2880 works). The cropped file is a derived copy; do not commit it over a baseline.
- The clock in every shot reads 9:41 (`device-run.sh` pins it).
- No device frame is needed. If the owner adds one, do not hide the text.
- Captions are plain, say what the screen does, and never say "verified" or "safe".
- Also needed by Play, not drawn from baselines: a 512 by 512 icon and a 1024 by 500 feature graphic. Owner step.

## Steps for the owner

1. After the first accepted device run (`scripts/visual-accept.ts`), `git lfs pull` the `android-large` baselines.
2. Crop to the Play aspect ratio and upload in the order above.
