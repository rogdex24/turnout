# Turnout mobile: Week 1 exit check

Status: written 2026-10-31 for the exit day, Mon 2026-11-02. Plan F24 and the M1 exit checks.

This file has one line for each check in plan item F24. Each line has a status and a link to the evidence in the repo.
The M1 exit rule is "the F24 list, all green". Today 4 lines are done and 8 are open, so M1 is not green yet.

Status values:

- `done`: the evidence exists in the repo or in a CI run, and it was checked.
- `open: owner step`: only the repo owner can do it (an account, a GitHub setting, a sign-off).
- `open: engineer`: the engineer can do it. A line can also wait for an owner step. The note says so.

## The checks

| # | Check (plan F24) | Status | Evidence |
|---|---|---|---|
| 1 | F27 is signed off before the flip, and the repo is public with secret scanning and push protection on | open: owner step | The scan, the fixes and the history rewrite are in `docs/plans/public-repo-audit.md`. The repo is public. The flip came before the rewrite, which is out of order. In the sign-off checklist, three items are still open: the GitHub Support purge of `refs/pull/*`, secret scanning with push protection (F21), and the re-clone of the owner's copies. The agent token cannot read these settings, so the owner must confirm them. |
| 2 | `apps/mobile` on `expo@58.0.11` builds as an Android development APK on EAS | open: owner step | The `development` profile is in `apps/mobile/eas.json` and the `eas-build` workflow is in `.github/workflows/eas-build.yml`. No EAS build has run: the Expo account row in `docs/plans/mobile-accounts.md` is `pending: user`, and the monthly log in `docs/plans/mobile-ci-budget.md` is empty. `expo` is pinned to 58.0.21 in `apps/mobile/package.json`, not 58.0.11 as the plan says. `DECISIONS.md` (entry 2026-10-28, "Expo patch pins follow the SDK") gives the reason: iOS crashed at launch with 58.0.11 next to the newer module patches. Update the plan wording to 58.0.21. |
| 3 | `apps/mobile` builds as an Android e2e build and an iOS e2e build in CI | done | Jobs `build-android` and `build-ios` in `.github/workflows/ci.yml`. Both passed in CI run https://github.com/rogdex24/turnout/actions/runs/41086650580. Scripts: `apps/mobile/ci/build-android.sh` and `apps/mobile/ci/build-ios.sh`. |
| 4 | `bun run check` (server and mobile) passes in CI | done | Job `check` in `.github/workflows/ci.yml`. It passed in run https://github.com/rogdex24/turnout/actions/runs/41086650580. The command is `bun run check` in `package.json`. |
| 5 | One Maestro flow passes in all four device jobs against the seeded backend | done | Jobs `android-device` (`android-small`, `android-large`) and `ios-device` (`ios-small`, `ios-large`) in `.github/workflows/ci.yml`. All four passed in run https://github.com/rogdex24/turnout/actions/runs/41086650580. They run every flow in `apps/mobile/.maestro/config.yaml` against `e2e/mobile-server.ts`, not only one. |
| 6 | One visual snapshot (events list, 16 shots) passes through odiff with LFS baselines | done | The diff script is `scripts/visual-diff.ts` with `test/visualDiff.test.ts`. The capture is `apps/mobile/.maestro/visual/capture-story.yaml`. The LFS rule is in `.gitattributes` and `.lfsconfig`. The baselines cover 50 stories on all four targets, not only the events list, and `visual-compare.sh` fails a target that has none. `docs/release-gate.md`, item 2, names the device runs. The measured sizes are in `docs/plans/mobile-ci-budget.md`. |
| 7 | `ci-gate` is required on `main`, and a red PR cannot merge | open: owner step | The job `ci-gate` is in `.github/workflows/ci.yml`. The repo has no ruleset (`gh api repos/rogdex24/turnout/rulesets` returns an empty list). The agent token cannot read classic branch protection. The owner must add the required check (F21). Steps: `docs/public-repo-checklist.md`, step 9. |
| 8 | The Maps spike shows Google Maps on Android and Apple Maps on the iOS simulator | open: owner step | No screenshot exists. The four map checks in `docs/plans/mobile-stack.md` (section "Maps") are all `pending`. The Android checks need the restricted key and the EAS keystore SHA-1 from the owner (`docs/plans/mobile-accounts.md`). The iOS check can use the `ios-small` job after that. The map view is `apps/mobile/src/screens/meet/MeetMap.tsx`. |
| 9 | `@turnout/contract` is used by both sides, and the token drift test passes | done | Contract: `packages/contract`. The server imports it in `src/app-api`, `src/social`, `src/admin`, `src/catalog` and `src/web`. The app imports it in `apps/mobile/src`. The shared tests are in `test/contract.test.ts`. Token drift test: `test/mobileTokens.test.ts`, test "tokens.generated.ts and theme.generated.css match DESIGN.md". It runs in `bun run check`. |
| 10 | The board is approved with a date | open: owner step | `docs/design/mobile-board/README.md` still says `Signed off by <user> on <date>`. This is the F6 sign-off. Review files: `docs/design/mobile-board/board.html` and `sources.md`. |
| 11 | `mobile-stack.md` and `DECISIONS.md` record every verdict, including F8 | open: engineer | `docs/plans/mobile-stack.md` (section "F8 spike") and `DECISIONS.md` (entry 2026-10-28, "mobile scaffold; Uniwind kept, device checks pending") record the styling verdict at bundle level only. The device checks and the Maps verdict are pending. This line can close after line 8 and a device run of the styling checks. |
| 12 | The F1 account table is complete, and `mobile-ci-budget.md` shows EAS and LFS use so far | open: owner step | `docs/plans/mobile-accounts.md` has every account at `pending: user` or `n/a`. The EAS monthly log and the LFS row in `docs/plans/mobile-ci-budget.md` are empty. The EAS counts come from the Expo dashboard. The LFS figures wait for the first baselines (line 6). |

## Open items by owner

Owner steps (the user does these):

- Line 1: confirm the purge of `refs/pull/*`, then turn on secret scanning and push protection.
- Line 2 and line 12: open the Expo account, run the first EAS development build, and fill in the account table and the EAS log.
- Line 7: add `ci-gate` as the required check on `main`.
- Line 8: create the restricted Maps key and add the SHA-1 values.
- Line 10: sign off the board, with a name and a date.

Engineer steps:

- Line 6: review and merge the baselines in pull request 34, then record the LFS use.
- Line 11: record the F8 device results in `docs/plans/mobile-stack.md` and `DECISIONS.md` after line 8.

## How this was checked

- CI results come from `gh run view` for run 41086650580, a pull request run on `vorflux/app-m4` at commit 3ce9f9e. Files under `.github`, `apps/mobile/.maestro` and `apps/mobile/ci` changed after that run, and the newest run on the branch had not finished when this file was written. Check lines 3 to 5 again on the exit day.
- The repo visibility is from `gh repo view`. The settings on lines 1 and 7 are not readable with the agent token, so the file reports what it could read.
