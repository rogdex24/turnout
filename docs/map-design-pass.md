# Map design pass brief

Bring `/map` up to `DESIGN.md`. The map works; this pass is about finish: every token,
every state, real images where we have them, honest placeholders where we don't.

`DESIGN.md` at the repo root is the contract. Where this brief and `DESIGN.md` disagree,
`DESIGN.md` wins; if `DESIGN.md` is wrong or missing a value, change it first (and say so)
rather than coding around it.

## Before any code

1. Merge `status-check-progress` into your branch (it now has `DESIGN.md`). Run
   `bun install` and `bun run check`.
2. Read `DESIGN.md` fully, then look at the references in `.playwright-mcp/reference/`
   (`nextdoor.png`, `nextdoor-map.png`: the hero and the live map with a selected card)
   and your own current screenshots.
3. Write the screen and state inventory as a table in your reply and in
   `docs/map-states.md`: for desktop card and phone sheet, every state the components in
   `DESIGN.md` list (idle, hover, focus, selected, cluster, approximate, expanded event,
   with image, without image, with organiser, without organiser, loading, empty, error,
   location denied). For each: what it shows and how to reach it. Do not write UI code
   before this table exists.

## Build in layers, verify after each

Work in this order. After each layer, screenshot and compare before moving on, so drift
stays in one layer.

**Layer 1: tokens.**
- Add `@google/design.md` pinned to `0.4.0` as a dev dependency. Scripts:
  `"design:lint": "design.md lint DESIGN.md"`, and add it to `check`.
- Generate the CSS custom properties from `DESIGN.md` with
  `design.md export --format css-vars` at build time (the map build already runs on
  `serve`). Map the `-dark` tokens into the dark-mode blocks in one place. Remove every
  hard-coded color, radius, spacing and font value in `src/web/map/` that a token covers.
  A test asserts no hex color literal remains in `src/web/map/styles.ts` outside the
  generated block.

**Layer 2: layout.** Breakpoints, frame inset, card widths, camera padding, sheet detents
(peek 120 px, half 50dvh, full 100dvh minus 72 px), pill row scrolling, zoom rules (ease to
at most 14, no move when already in view).

**Layer 3: components.** Pill, search pill, marker tile with the Lucide category glyphs
listed in `DESIGN.md`, count badge, label chip, cluster stack with "+N" and "N events",
approximate circle, card, sheet with handle and keyboard detent buttons, event row,
expanded event, organiser block, rating component (built, hidden). Use Lucide as inline
SVG; vendor only the 11 glyphs plus the few UI icons you need, do not add an icon font.

**Layer 4: data for images and organisers.**
- Additive columns `event.image_url` and `event.organiser_name` (the `hasColumn` pattern,
  with an upgrade test from the old schema).
- Fill them at ingest for the sources that send them: BookMyShow `bannerUrl`; Communitie
  landscape, then preview, then portrait, and `hostName`; District `imageUrl`; MeraEvents
  `coverImageUrl`. Accept only absolute https URLs. Another worker is adding a shared
  http(s) URL check in `ingestion/sources/shared.ts`; add a small `parseHttpsUrl` there
  with a test, and the two will be reconciled at merge.
- Expose both in `/api/map` events. Keep the response small: report the new gzipped size.
- Placeholder: neutral tint from a hash of the event id (6 neutral steps), glyph at 40%.
  Avatar placeholder: initials on a tint from the name. Images: lazy, async, fixed size,
  `referrerpolicy="no-referrer"`, swap to the placeholder on error without layout shift.
- Vertical posters: contained over a blurred, darkened copy of the same image.
- Trust line from our own data ("N events this month · on M sources"); no rating renders
  without data. A test proves the rating component renders nothing when there is no
  rating.

**Layer 5: states and motion.** Every state from your inventory is previewable with
`?state=` (loading, empty, error, denied) or reachable by a URL (`?venue=`, an expanded
event). Motion per `DESIGN.md` with `prefers-reduced-motion` making it instant.

## Verification loop

For each layer and at the end:
- Screenshot at 1280 × 800 and 390 × 844, light and dark, every state in the inventory.
- Open each screenshot and look at it. Write a difference table: element, expected (cite
  the `DESIGN.md` token or rule), actual, fix. Fix and re-shoot.
- At most 3 rounds per layer. Anything still off after that goes into the final report
  instead of more rounds.
- Also: no console errors; no horizontal page scroll at 390 px; `/` loads none of the map
  bundle; `/map` JS stays under 320 KB gzipped; `bun run check` passes.

## Rules

- No values outside `DESIGN.md`. No new runtime dependencies except what the brief names
  (Lucide SVGs are vendored, not installed).
- Do not touch `src/admin/` or `src/ingestion/agent/`. Keep edits to `sync.ts`,
  `catalog/dedupe.ts` and `cli.ts` minimal; Codex is fixing dedupe and sync in parallel.
- No em dashes in code comments, commits or docs.
- Commit per layer with messages that say what changed and why.

## Final report

The state inventory, before and after screenshots for each state (paths), the final
difference table with anything unresolved, image coverage (share of listed events with
a real image), `/api/map` and bundle sizes, the `bun run check` summary, and any change
you made to `DESIGN.md` with the reason.
