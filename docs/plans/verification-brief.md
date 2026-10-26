# Verification brief (S8)

You are the independent verifier for `docs/plans/map-react-migration.md`. You did not
write this code. Your job is to check that what was built matches what was planned and
researched, with evidence. You may run anything (tests, servers, Playwright, builds), but
**do not edit any source, test, config or design file**. The only files you may create are
your report and screenshots under `docs/review/verification-2026-10-11/`.

Read first, in this order:
1. `docs/review/ui-review-2026-10-11.md` (the research and merged recommendation)
2. `docs/review/ui-review-codex-2026-10-11.md` (the original findings with file:line)
3. `docs/plans/map-react-migration.md` (decisions D1 to D11, criteria S1.1 to S7.3)
4. `docs/plans/map-react-progress.md` (what the implementer claims, and why)
5. `AGENTS.md`, `DESIGN.md`

Then verify:

1. **Every decision D1 to D11 and every criterion S1.1 to S7.3**: pass, partial or fail.
   Evidence for each: file:line, test name and its result, command output, or a screenshot
   path you took yourself. Do not accept a claim from the progress note without checking it.
2. **Deviations from the plan**: list each (for example clusters not on mapcn, presets and
   Group by as links rather than Toggle Group, the revised bundle budget). For each, say
   whether the recorded reason holds up and whether the research's intent is still met.
3. **The original review findings**: for each numbered finding and top-10 change in the
   Codex review, say whether it is resolved, with evidence. Also check the seven bugs in
   `ui-review-2026-10-11.md`.
4. **Re-run**: `bun install`, `bun run check`, `bun run e2e`, the bundle measurement test,
   and take your own screenshots of `/map` (1280x800 and 390x844, light and dark, idle,
   venue selected, event expanded, filters open, Near me on, phone sheet at each detent)
   and of `/` and one `/e/<id>` page. Look at them and note any visual defect.
5. **Deleted code is gone**: `innerHTML`, `dangerouslySetInnerHTML`, `!important` under
   `src/web`; `parseFilters`, `toQuery`, `withEventVenue`; `render.ts`, `styles.ts` panel
   CSS, `client/map.ts`, `page.ts`, string templates in `pages.*`; duplicate theme code.
6. **Library choices**: confirm installed versions are pinned exactly and match the
   decisions (React 19.3, shadcn Base UI variant, @base-ui/react, nuqs, mapcn source
   recorded, maplibre-gl 6.13, Inter self-hosted, Playwright).
7. **Quality**: dependency rule holds; AGENTS.md describes the new layout accurately;
   accessibility basics from the Vercel guidelines (focus visible, hit targets, reduced
   motion, no `transition: all`, tabular numbers); no console errors on any page.

Write `docs/review/verification-2026-10-11/report.md`:
- A verdict line: PASS, or FAIL with the count of fails and partials.
- A table: ID, status, evidence.
- A numbered **fix list** for every fail and unexplained partial, each with the file and
  what "done" looks like, ordered by severity.
- What you could not verify and why.

Be strict. A criterion with no evidence is a fail. Then stop.
