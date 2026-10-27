# Turnout mobile v1: final designs

The reference for the app build (`apps/mobile`): the Nightlife direction in the Gallery Night palette, 23 screens and states, dark and light.

- `spec.md` is the written spec: tokens, rules from the design review, and the screen list.
- `src/base.css` is the shared system every mockup uses (colors, type, components).
- `src/screens/<name>.html` is one screen each. A screen name below is the file name without `.html`.
- `src/build.py` turns a screen into a finished mockup.
- `src/BRIEF.md` is the brief the mockups were made from.

## Screens

| Area | Screens |
|---|---|
| Onboarding | `welcome`, `signin-phone`, `signin-code` |
| Shows | `home`, `show`, `show-go` |
| Plans | `plans`, `plan-finding`, `plan-three`, `plan-confirmed`, `plan-no-group`, `plan-cancel` |
| Tickets | `ticket-add`, `ticket-checking`, `ticket-rejected` |
| Meeting | `meet`, `meet-safety`, `thread`, `after` |
| Profile | `you`, `profile`, `report`, `delete-account` |

That is 23 sources. `build.py` writes a dark file (`<screen>.html`) and a light file (`<screen>-light.html`) for each.

## Where the tokens live

The colors and type in these files are the starting point. `DESIGN.md` at the repo root is the source of truth, and
`packages/design-tokens` is generated from it (`bun run tokens:mobile`). Where they differ, DESIGN.md wins. Two values changed
after the review so every text pair reaches 4.5:1 (the light signal 5.1:1 on the "In 48 min" chip): light `app-muted` is
`#645f59` (the review had `#67625c`) and light `app-signal-soft` is 8% (the review had 10%). `src/base.css` and `spec.md` here
already carry them.

## Photos are not in the repo

The posters and faces in the mockups are stand-in photos. They are not committed and `src/img/` is ignored. To build the
mockups, put placeholder JPEGs with these names in `src/img/`: `poster-comedy`, `poster-music`, `poster-theatre`,
`cafe-niloufer`, and `face-arjun`, `face-kiran`, `face-meera`, `face-priya`, `face-rahul`, `face-sana`, `face-you`
(all `.jpg`). The names and the faces in the mockups are made up, and so are the phone number and handle.

```sh
python3 -I docs/design/mobile-final/src/build.py            # every screen
python3 -I docs/design/mobile-final/src/build.py home show  # some screens
```

The built files go to `build/` (ignored) and have the photos inlined as data URIs, so they are large. `build.py` stops the build
on banned copy, an em dash, a middle dot outside the marquee, a theme toggle, a "PHOTO" label, blur on bars, or an eyebrow.

## Biome

Biome does not read this folder: `biome.json` includes only `src/**`, `test/**`, `e2e/**`, `scripts/**`, `bench/**` and the
root `*.ts` and `*.json`, so no change to `biome.json` was needed.
