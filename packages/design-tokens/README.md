# @turnout/design-tokens

Design tokens for the Turnout mobile app. Data only: no React, no React Native, no runtime imports.

- `tokens.generated.ts` and `theme.generated.css`: colors (light and dark) and type styles, generated from the `app-*` tokens in `DESIGN.md` by `scripts/build-mobile-tokens.ts`. Run `bun run tokens:mobile` after editing `DESIGN.md`; `test/mobileTokens.test.ts` fails when they drift. Do not edit them.
- `native.ts`: written by hand. Spacing and radii in dp, hit areas, the display-face ranges, springs, pressed feedback and font scaling caps.
- `theme.generated.css` uses the Uniwind theme syntax (`@layer theme`, `@variant light` and `@variant dark`).

The values and their reasons are in the Mobile app section of `DESIGN.md` and in `docs/design/mobile-final/spec.md`.
