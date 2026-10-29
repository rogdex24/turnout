# Turnout mobile: CI and build budget

Status: Week 1 draft, 2026-10-27. Plan F18 (EAS builds), F20 (LFS) and F19 (runners). Three
allowances limit the mobile pipeline: EAS builds, Git LFS and GitHub Actions concurrency. This
file holds the numbers, the arithmetic and what happens at each limit. All three are free
allowances, so the rule is to stay inside them, not to buy more.

Sources:
- EAS Free: https://expo.dev/pricing
- Git LFS: https://docs.github.com/en/billing/concepts/product-billing/git-lfs
- Actions limits: https://docs.github.com/en/actions/reference/limits

## EAS builds

EAS Free gives 15 builds per platform a month, in a low-priority queue. EAS builds are never in
the pull request path: pull requests build with GitHub Actions on standard runners. EAS builds
are for the install-on-a-device profiles and for Play.

Monthly plan, against 15 per platform:

| Profile | Android | iOS | Why |
|---|---|---|---|
| `development` (and `development-simulator` for iOS) | 3 | 2 | Dev client rebuilds when native dependencies change |
| `preview` | 3 | 0 | Tester builds; JS changes go out as EAS Update on the `preview` channel instead |
| `production` | 6 | 0 | Play AAB, one per closed-test build and release candidate |
| Total | about 12 of 15 | about 2 of 15 | Leaves 3 Android builds spare |

The `e2e` profile is not in the budget: native builds for pull requests run on GitHub Actions and
are cached by fingerprint (F19). With no Apple account (F26) there is no iOS preview or production build.

Rules:
- A build is spent only for a native change. A JS-only change goes out with EAS Update.
- `runtimeVersion` uses the `fingerprint` policy, so an update never reaches a binary it cannot run on.
- `.easignore` keeps the monorepo upload small.
- When the queue is long or the budget is nearly gone, use `eas build --local`.
- Weekly cold builds run in `mobile-canary.yml` on GitHub Actions (Mondays 03:00 UTC), not on EAS.

Monthly log. Fill in the count from the EAS dashboard at the start of each week.

| Billing month | Android used | iOS used | Notes |
|---|---|---|---|
| 2026-10 | | | First EAS builds on Fri 10-30 (F18) |
| 2026-11 | | | |
| 2026-12 | | | Production release on Fri 12-18 |

## Git LFS

GitHub gives 10 GiB of LFS storage and 10 GiB of bandwidth a month. Past the quota, LFS is
blocked, not billed: pulls and pushes of LFS objects fail until the next month or until the
files move.

What goes in LFS: the visual baselines under `apps/mobile/.maestro/visual/baselines/` (see
`docs/plans/mobile-visual-testing.md`). Nothing else.

| Number | Value | How it is reached |
|---|---|---|
| Size of one full set of baselines | about 168 MB | The plan's estimate for 16 shots per state across the stories |
| Storage | 168 MB per set against 10 GiB (10,240 MB) | A new set after a change only adds the shots that changed, so storage grows slower than one set per change |
| Bandwidth | about 2 GB a month | The plan's estimate across the PR jobs |
| Per device job | about 42 MB | One quarter of a set: `.lfsconfig` skips the baselines on checkout and each device job fetches only its own `<target>` folder |
| 70 percent of storage | 7 GiB | Fallback trigger |
| 70 percent of bandwidth | 7 GiB a month | Fallback trigger |

The 42 MB figure is the 168 MB estimate divided by the four targets, not a measurement. The
first snapshot on Mon 11-02 gives the real size; replace the estimates here then.

Orphan-branch fallback: at 70 percent of either storage or bandwidth, the baselines move out of
LFS to an orphan branch that holds only the PNGs, and the device jobs fetch them from there.
Proposed check: on the first of each month and after every `visual-accept` commit, from the LFS
usage on the repository owner's GitHub billing page.

| Date | Storage used | Bandwidth used | Action |
|---|---|---|---|
| 2026-11-02 | | | First snapshot (F20) |

## GitHub Actions

The repo is public, so standard runners are free. The limits that matter:

| Limit | Value | Effect |
|---|---|---|
| Concurrent jobs | 20 | A pull request runs the check jobs, two build jobs and four device jobs |
| Concurrent macOS jobs | 5 | `ios-small` and `ios-large` plus `build-ios` use 3 per PR; a second PR queues its iOS jobs |
| Runners | Standard only (`ubuntu-latest` with KVM for Android, `macos-latest` for iOS) | No larger runners, which are billed |

Controls from F19 and F20: caches for native builds by fingerprint, `fetchexclude` for LFS,
no automatic re-run inside a device job (a failed job is re-run whole, on a fresh server), and a flow that is flaky more than 1 run in 10 in a week is fixed
or quarantined that week. Software emulation on Linux and required device jobs can block
merges, which is why `ci-gate` is the single required check and the fix-or-quarantine rule exists.
