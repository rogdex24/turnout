# Turnout mobile: visual testing and the iOS gaps

Status: Week 1 draft, 2026-10-27. Plan F20 (visual diffs) and F26 (iOS on the simulator only).
The scripts and the LFS rule exist now; the first snapshot lands on Mon 11-02.

## iOS gaps until an Apple account exists

v1 ships on Android only. iOS runs on the simulator in CI: `build-ios`, `ios-small` and
`ios-large` run on every mobile pull request with the same flows and the same visual matrix as
Android. Push handling is checked with `xcrun simctl push` and a sample payload. These things
are not covered, and no test result stands in for them:

| Gap | What is missing | What covers it meanwhile |
|---|---|---|
| TestFlight | No Apple Developer account, so no signed iOS build and no tester distribution | Simulator builds in CI only |
| A real iPhone | No device runs the app. Haptics, camera and photo picker, keyboard and safe areas are checked on the simulator only | The `ios-small` (iPhone SE, 3rd generation) and `ios-large` (Pro Max) jobs |
| Universal links | Needs the app's Apple team ID and an associated-domains entitlement | The Android app links path; the server accepts `APP_LINKS_IOS_APP_IDS` but it stays empty |
| iOS push | Needs APNs credentials from the Apple account. The server accepts iOS tokens and never sends to them until `PUSH_PLATFORMS` includes `ios` | `xcrun simctl push` with a sample payload proves the handler, not delivery. iOS testers see notices on open |
| The App Store listing and review | Needs the account, a listing, privacy answers and Apple's review | Nothing. Review time is not planned for |

Trigger: the user decides to launch on iOS. Enroll in the Apple Developer Program at least 3
weeks before that release. WhatsApp autofill (the `whatsapp-otp` module) is Android only, so iOS
sign-in is paste or typing.

## The visual pipeline

Maestro `takeScreenshot` photographs Storybook stories on each device job. `odiff-bin` 4.5.0
compares them with the baselines at threshold 0.1. The baselines are PNGs in Git LFS.

### Matrix

16 shots per state: 4 targets, light and dark, default and largest text.

| Part | Values |
|---|---|
| Target | `android-small` (360 dp, 720x1520 at 320 dpi), `android-large` (Pixel 7 Pro profile, the large-phone class), `ios-small` (iPhone SE, 3rd generation), `ios-large` (Pro Max) |
| Theme | `light`, `dark` |
| Text | `default`, `largest` (Android font scale 2.0, iOS `accessibility-extra-extra-extra-large`) |

Fonts, animations, the status bar clock, dates and map tiles are fixed in the e2e variant, so a
shot is the same on every run.

### Where the baselines live

```
apps/mobile/.maestro/visual/baselines/<target>/<story>/<theme>-<text>.png
```

For example `apps/mobile/.maestro/visual/baselines/android-small/events-list/dark-largest.png`.
`<story>` is one folder name per Storybook story, lower case with hyphens.

`apps/mobile` exists now, but the `baselines` folder is still created by the first accepted
snapshot, because no emulator was available when F20 was written. The path is fixed in three
places that must change together: `.gitattributes`, `.lfsconfig` and `DEFAULT_BASELINES_DIR` in
`scripts/visual-accept.ts`. No PNG is committed yet.

The capture side is in the app. `apps/mobile/.maestro/visual/stories.json` lists the stories to
shoot (`folder`, Storybook `id`, and the text that shows when the story is ready),
`apps/mobile/.maestro/visual/capture-story.yaml` takes one shot, and
`apps/mobile/.maestro/ci/device-run.sh <target>` loops the themes and text sizes and leaves
`<story>/<theme>-<text>.png` files for `visual-compare.sh`. `visual-compare.sh` fails when a
target has no baseline. The Home story is `screens-home--loaded`
(folder `home`).

### Git LFS

- `.gitattributes` sends every PNG under the baselines path to LFS
  (`filter=lfs diff=lfs merge=lfs -text`). Install once per machine with `git lfs install`.
- `.lfsconfig` sets `lfs.fetchexclude` to the same path, so a clone, a checkout and a plain
  `git lfs pull` fetch no baselines. Working trees hold the small pointer files until asked.
- A device job fetches only its own target folder. A bare `--include` does not work, because the
  exclude in `.lfsconfig` still applies to it, so clear the exclude for that one command:

  ```
  git -c lfs.fetchexclude= lfs pull --include="apps/mobile/.maestro/visual/baselines/<target>/**"
  ```

- Storage and bandwidth budget, and the fallback at 70 percent of either: `docs/plans/mobile-ci-budget.md`.

### Artifact naming contract

Every device job uploads its fresh shots as a GitHub Actions artifact named
`visual-shots-<target>`, where `<target>` is one of the four target names. The artifact root
holds `<story>/<theme>-<text>.png`, with no target folder inside, so the same path under
`baselines/<target>/` is the shot's baseline. `scripts/visual-accept.ts` relies on this; changing
the name or the layout means changing the script and its test in the same commit.

### Scripts

Compare a candidate folder with a baseline folder (CI does this per target):

```
bun scripts/visual-diff.ts apps/mobile/.maestro/visual/baselines/<target> <candidate-dir> --report visual-diff-report/<target>
```

- Matches files by relative path. Options: `--report <dir>` (default `visual-diff-report`,
  git-ignored) and `--threshold 0.1` (the plan's value, odiff's per-pixel colour tolerance from 0 to 1).
- Writes `report.json`, `report.md` and a diff image per changed shot under `diffs/`.
- Exit code 0 when every shot matches. 1 when any shot changed, changed size, is missing from the
  candidate, or has no baseline (a new shot needs an accepted baseline too). 2 for a usage error
  or when there is nothing to compare.
- `odiff-bin` is pinned to the exact version 4.5.0 in the root `package.json`.

Accept a run's shots as the new baselines:

```
bun scripts/visual-accept.ts <run-id> [--repo owner/name]
```

- Downloads each `visual-shots-<target>` artifact of the run with `gh run download` and replaces
  that target's folder under the baselines path, so a removed shot does not linger.
- Needs the GitHub CLI signed in (`gh auth login`) and git-lfs installed. It refuses to run
  without git-lfs, and when the baselines folder already has uncommitted changes.
- It commits nothing. Accepting makes the shots the truth for every later run, so the change is a
  reviewed commit: look at the diff images in the run's report first, then `git add` the baselines
  folder and commit it on its own, and have it reviewed like code. Do not push shots straight from a run.

### Flake handling

A shot that differs only by noise is fixed at the source (font, animation, clock, date or map
tile pinned), not by raising the threshold. A flow that is flaky more than 1 run in 10 in a week
is fixed or quarantined that week (F19).
