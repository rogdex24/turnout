# Turnout mobile: stack confirmation

Status: Week 1 draft, 2026-10-27; F12 and F8 results added 2026-10-28. Plan F7 and F8. The plan (section 2, Engineering) is
authoritative for what is chosen; this file records the version, the source and the age of each
pick, and the answers to the four Week 1 questions in `docs/plans/mobile-app-brief.md`.

## How to read the tables

- Published is the npm `time` entry for that exact version (`npm view <pkg> time --json`), or the
  GitHub release or Maven date for things outside npm. Read on 2026-10-27.
- The 14-day rule (`minimumReleaseAge = 1209600`, Renovate 14 days) is counted at the earliest
  scaffold time, 2026-10-29 19:40 UTC, which is 14 days after `expo@58.0.11`. A version published
  after 2026-10-15 19:40 UTC does not qualify, and the table shows the newest one that does.
- Versions the plan names are used as named. Where the plan names only a package or a release
  line, the version here is a candidate: the newest one that passes the rule. Expo-managed
  packages are finally set by `bunx expo install` at F12, and this file is updated then.
- Status is `planned` until the package is in a `package.json` or the tool is in use, then
  `installed`. The F24 exit check on 2026-11-02 reviews every row.

Versions that did not qualify, kept so nobody bumps to them by hand before the age rule allows it:
`expo-router` 58.0.27 (2026-10-27), `uniwind` 1.13.0 (2026-10-19), `@tanstack/react-query` 5.105.0
(2026-10-26), `react-hook-form` 7.91.0 (2026-10-23), `posthog-react-native` 4.84.2 (2026-10-27),
`eas-cli` 26.0.0 (2026-10-26), `react-native` 0.88.1 (2026-10-27) and `jest-expo` 58.0.12
(2026-10-21).

## Engineering rows from plan section 2

| Topic | Package or tool | Planned version | Published | Source | Status |
|---|---|---|---|---|---|
| Framework | `expo` | 58.0.21 | 2026-10-28 | https://expo.dev/changelog/sdk-58 | installed (`apps/mobile`) |
| Framework | `react-native` | 0.88.0 (the line Expo SDK 58 pins) | 2026-10-15 | https://www.npmjs.com/package/react-native | installed (`apps/mobile`) |
| Framework | `react` | 19.3.0 | 2026-09-09 | https://www.npmjs.com/package/react | installed (root, web) |
| Package age | `minimumReleaseAge` in `bunfig.toml` | 1209600 | n/a | https://bun.com/docs/runtime/bunfig | planned (workspaces stream) |
| Workspaces | `bun` | 1.4.3 | 2026-10-10 | https://docs.expo.dev/guides/monorepos/ | installed |
| Navigation | `expo-router` | 58.0.28 (planned 58.0.19) | 2026-10-14 | https://docs.expo.dev/router/introduction/ | installed (`apps/mobile`) |
| Components | `@react-native-reusables/cli`, components vendored into `src/ui/primitives` | 0.7.1 (candidate) | 2026-03-14 | https://reactnativereusables.com | planned |
| Styling | `uniwind` | 1.12.2 (candidate, F8 decides) | 2026-10-05 | https://docs.uniwind.dev | installed (`apps/mobile`); F8 below |
| Styling | `tailwindcss` | 4.3.3 | 2026-07-16 | https://www.npmjs.com/package/tailwindcss | installed (root, web) |
| Styling fallback | `nativewind` on Tailwind v3, inside `apps/mobile` only | 4.2.7 | 2026-09-14 | https://www.nativewind.dev | planned (only if F8 fails) |
| Server state | `@tanstack/react-query` | 5.104.3 (candidate) | 2026-10-15 | https://tanstack.com/query/v5/docs/framework/react/overview | installed (`apps/mobile`) |
| Server state | `react-native-mmkv` | 4.3.2 | 2026-06-22 | https://github.com/mrousavy/react-native-mmkv | installed (`apps/mobile`) |
| Server state | `expo-crypto` | 58.0.7 (planned 58.0.6) | 2026-10-09 | https://docs.expo.dev/versions/v58.0.0/sdk/crypto/ | installed (`apps/mobile`) |
| Server state | `expo-secure-store` | 58.0.2 (candidate) | 2026-10-01 | https://docs.expo.dev/versions/v58.0.0/sdk/securestore/ | installed (`apps/mobile`) |
| Forms | `react-hook-form` | 7.90.0 (candidate) | 2026-10-11 | https://react-hook-form.com | installed (`apps/mobile`) |
| Forms | `zod` | 4.6.6 | 2026-10-11 | https://zod.dev | planned (contract package, workspaces stream) |
| Sessions | `jose` | 6.2.12 | 2026-09-05 | https://github.com/panva/jose | planned (server, S1) |
| Sign-in channel | WhatsApp authentication template, Meta Cloud API, Graph API | v26.0 | n/a | https://developers.facebook.com/docs/whatsapp/cloud-api/ | planned (S28) |
| Autofill | `com.whatsapp.otp:whatsapp-otp-android-sdk`, wrapped by the local Expo module `whatsapp-otp` | 1.0.0 | 2026-03-26 | https://central.sonatype.com/artifact/com.whatsapp.otp/whatsapp-otp-android-sdk | planned |
| Maps | `react-native-maps` | 1.29.11 | 2026-09-27 | https://docs.expo.dev/versions/v58.0.0/sdk/map-view/ | installed (`apps/mobile`) |
| Push | `expo-notifications` | 58.1.7 (planned 58.1.4) | 2026-10-14 | https://docs.expo.dev/versions/v58.0.0/sdk/notifications/ | installed (`apps/mobile`) |
| Push | Firebase project `turnout-push` on Spark (FCM V1) | n/a | n/a | https://firebase.google.com/pricing | planned (M3) |
| Icons | `phosphor-react-native` | 3.0.6 | 2026-04-23 | https://www.npmjs.com/package/phosphor-react-native | installed (`apps/mobile`) |
| Icons | `react-native-svg` | 15.16.0 (candidate, Expo pins) | 2026-10-15 | https://docs.expo.dev/versions/v58.0.0/sdk/svg/ | installed (`apps/mobile`) |
| Fonts | `@expo-google-fonts/inter` | 0.4.2 | 2025-09-11 | https://www.npmjs.com/package/@expo-google-fonts/inter | installed (`apps/mobile`) |
| Fonts | `@expo-google-fonts/big-shoulders` | 0.4.1 | 2025-09-04 | https://www.npmjs.com/package/@expo-google-fonts/big-shoulders | installed (`apps/mobile`) |
| Lists, motion | `@shopify/flash-list` (v2) | 2.3.2 (planned 2.3.3) | 2026-10-01 | https://shopify.github.io/flash-list/ | installed (`apps/mobile`) |
| Lists, motion | `react-native-reanimated` (v4) | 4.7.1 (candidate, Expo pins) | 2026-10-02 | https://docs.swmansion.com/react-native-reanimated/ | installed (`apps/mobile`) |
| Lists, motion | `react-native-gesture-handler` | 3.3.0 (planned 2.33.0) | 2026-09-14 | https://docs.swmansion.com/react-native-gesture-handler/ | installed (`apps/mobile`) |
| Lists, motion | `expo-haptics` | 58.0.7 (planned 58.0.6) | 2026-10-13 | https://docs.expo.dev/versions/v58.0.0/sdk/haptics/ | installed (`apps/mobile`) |
| Errors | `@sentry/react-native` | 8.28.0 (planned 8.31.0) | 2026-10-15 | https://docs.sentry.io/platforms/react-native/ | installed (`apps/mobile`) |
| Analytics | `posthog-react-native` | 4.81.2 (candidate) | 2026-10-14 | https://posthog.com/docs/libraries/react-native | installed (`apps/mobile`) |
| Server runtime | `bun` with `bun:sqlite` in WAL | 1.4.3 | 2026-10-10 | https://bun.com/docs/runtime/sqlite | installed |
| Server packages | `expo-server-sdk` | 7.2.0 | 2026-08-24 | https://github.com/expo/expo-server-sdk-node | planned |
| Server packages | `libphonenumber-js` | 1.13.14 | 2026-09-24 | https://gitlab.com/catamphetamine/libphonenumber-js | planned |
| Files | Local disk store (`OBJECT_STORE=disk`), Bun `S3Client` later | n/a | n/a | https://bun.com/docs/runtime/s3 | planned |
| Backups | Litestream | 0.5.6 | 2026-01-09 | https://github.com/benbjohnson/litestream/releases/tag/v0.5.6 | planned (host slot) |
| Contract | `@turnout/contract` (Zod only) | workspace | n/a | `docs/plans/mobile-app-brief.md` | installed (`apps/mobile`) |
| Lint, format | `@biomejs/biome` | 2.5.15 | 2026-09-30 | https://biomejs.dev | installed |
| Lint, format | ESLint, React Compiler rules and `expo/no-dynamic-env-var` only | 10.13.0 with `eslint-plugin-react-hooks` 7.1.1 and `eslint-plugin-expo` 1.2.1 | n/a | https://docs.expo.dev/guides/using-eslint/ | installed (`apps/mobile`) |
| Tests | `bun test` | 1.4.3 | 2026-10-10 | https://bun.com/docs/cli/test | installed |
| Tests | `jest-expo` | 58.0.11 (the 58.x line) | 2026-10-15 | https://docs.expo.dev/develop/unit-testing/ | installed (`apps/mobile`) |
| Tests | `@testing-library/react-native` | 14.1.0 (candidate) | 2026-10-08 | https://callstack.github.io/react-native-testing-library/ | installed (`apps/mobile`) |
| Tests | Maestro CLI | 2.11.0 | 2026-09-29 | https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.11.0 | pinned in `ci.yml` with its sha256; `check-syntax` passes on the flows |
| Tests | `@storybook/react-native` (v10) | 10.7.0 | 2026-10-13 | https://github.com/storybookjs/react-native | installed (`apps/mobile`) |
| Visual diffs | `odiff-bin` | 4.5.0 | 2026-07-23 | https://github.com/dmtrKovalenko/odiff | installed (root devDependency) |
| CI | `reactivecircus/android-emulator-runner` | v2.38.0 | 2026-07-05 | https://github.com/ReactiveCircus/android-emulator-runner/releases/tag/v2.38.0 | pinned in `ci.yml` by commit SHA; not yet run |
| CI | `@expo/repack-app` | 0.10.4 | 2026-09-29 | https://docs.expo.dev/build-reference/repack/ | installed (`apps/mobile` devDependency, run by `apps/mobile/ci/repack.sh`); not yet run |
| CI | GitHub Actions, standard runners, one required check `ci-gate` | n/a | n/a | https://docs.github.com/en/actions/reference/limits | installed (`ci.yml`, `mobile-canary.yml`, `eas-update.yml`, `eas-build.yml`); not yet run on a runner |
| Unauthorized access | One 404 for not found, not yours and not yet | n/a | n/a | `docs/plans/mobile-app-brief.md` | planned (server) |
| Device matrix | `android-small`, `android-large`, `ios-small`, `ios-large` | n/a | n/a | `docs/plans/mobile-visual-testing.md` | planned |
| Builds | `eas-cli` | 26.0.0 (run with `bunx`, not a dependency) | 2026-10-26 | https://docs.expo.dev/build/introduction/ | pinned in `eas-update.yml` and `eas-build.yml`; the 14-day age rule is waived for it |
| Dependency updates | Renovate GitHub app | n/a | n/a | https://docs.renovatebot.com | planned (F23) |
| Secrets scanning | gitleaks | v8.30.1 | 2026-03-21 | https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1 | planned (public-repo-audit stream) |
| Release | Play internal, closed, then production | n/a | n/a | `docs/plans/mobile-play-release.md` | planned |

Rows with no package are enforced by tests, workflow files and `docs/plans/mobile-ci-budget.md`.

## Brief Week 1 decisions

The four decisions the brief asked for (`docs/plans/mobile-app-brief.md`, "Decisions I need from
you in week 1"), plus the two the plan settled on the way.

| Question | Answer | Evidence |
|---|---|---|
| Does the monorepo work with Expo and Metro? | Yes. Bun workspaces `apps/*` and `packages/*`, root stays the server package, hoisted linker | https://docs.expo.dev/guides/monorepos/ |
| Maps library | `react-native-maps` 1.29.11. Google on Android with a restricted key, Apple on iOS. Not `expo-maps`, which needs iOS 17 | https://docs.expo.dev/versions/v58.0.0/sdk/map-view/ |
| Visual diff tool and its cost | `odiff-bin` 4.5.0 at threshold 0.1, free (MIT), with Maestro `takeScreenshot`. Baselines in Git LFS (F20) | https://github.com/dmtrKovalenko/odiff and `docs/plans/mobile-ci-budget.md` |
| Identity vendor | Dropped. v1 has no identity check; the handle check (S24) and the ban list (S25) replace it | Plan section 2, Identity and Retired IDs (S12, A18, C6, C7) |
| Chat SDK or our own thread | Our own: text only, group only, polled every 5 s while the screen is focused (S13). No per-message or per-user cost | Plan section 2, Thread |
| OTP channel | WhatsApp authentication template through the Meta Cloud API, no SMS (S3). About 820 INR a month at the 200 a day cap | https://developers.facebook.com/docs/whatsapp/pricing/ |

## F8 spike: styling and maps

The styling half ran at F12 on 2026-10-28, in the build session, with no emulator and no Mac. The
maps half needs a device and a key, so it is pending. Both are marked below.

### Styling: Uniwind or NativeWind

Test: Uniwind 1.12.2 with Tailwind 4.3.3 on Expo SDK 58, with the token theme, the two fonts and
the Button primitive, light and dark.

| Check | Pass when | Result | Screenshot |
|---|---|---|---|
| Builds on SDK 58 | Android and iOS bundles compile | Pass at bundle level: `bunx expo export --platform android` and `--platform ios` both succeed with the Uniwind Metro config. A native APK build was tried (JDK 17, Android SDK 37, `assembleDebug` for x86_64) and the Gradle daemon disappeared during the Kotlin compile steps; no APK exists. Android APK build pending, and no iOS build is possible without a Mac. Native build and launch are covered by the `build-android` and `build-ios` CI jobs, which have not run | none |
| `className` applies | The Button shows the token colours and padding from its classes | Pass at bundle level: the exported bundle holds the token variables, the generated utility styles and the font sizes. On a device: pending. In Jest, Uniwind has no runtime, so tests assert the `className` prop (`src/ui/primitives` tests), not the pixels | none |
| Dark mode follows the system | Switching the emulator theme restyles the Button with no app code | Pass at bundle level: the dark values are scoped variables under the dark theme, with no app code. On a device: pending. The device jobs capture light and dark for each story | none |
| `bunx expo install --check` | Clean, no mismatched versions | See "Installed versions at F12" below | n/a |

Outcome: Uniwind on Tailwind 4.3.3 stays as the styling layer. Every check that can run without a
device passes, and nothing failed. The verdict is conditional on the device checks: if the first
`android-small` or `ios-small` run shows unstyled screens or a dark mode that does not follow the
system, the plan's fallback applies (NativeWind 4.2.7 on Tailwind v3 inside `apps/mobile` only,
fed by `design.md export --format json-tailwind`). Two facts to keep in mind:

- Uniwind has no Jest runtime. A component test cannot see a resolved style, so it asserts the
  `className` prop. Pixel checks are the Storybook and visual-diff job.
- Tailwind scans the source for whole class names. A class built by string concatenation never
  reaches the bundle, so components use lookup tables of full literals.

### Maps

Pending. These checks need a device or emulator and the restricted key, which the owner creates
(`docs/plans/mobile-accounts.md`). Nothing below has been run.

| Check | Pass when | Result | Screenshot |
|---|---|---|---|
| Android, restricted key | Two pins show on the map in a dev build with the real SHA-1 on the key | pending: needs owner and a device | |
| Android, wrong SHA-1 | The map is blank and `adb logcat` shows the authorization error | pending: needs owner and a device | |
| iOS simulator | Apple Maps shows the two pins with no key | pending: needs a Mac or the `ios-small` job | |
| e2e variant | The `.e2e` build, which has no key, shows the "map unavailable" card | pending: the card comes with the map screen (M3) | |

The config side is done and tested: `GOOGLE_MAPS_ANDROID_API_KEY` is read only in `app.config.ts`,
the `preview` and `production` variants throw without it, and the `.e2e` variant never gets one.
Acceptance for F8 is both outcomes recorded here with screenshots. The screenshot column links to
the PR or run that holds them; no PNG is committed for this spike.

## Installed versions at F12

The scaffold used the newest version of each package that `bunx expo install` and the plan
allow, with every package pinned exactly in `apps/mobile/package.json` (no `~` or `^`). Where the
tables above say "planned", the installed version is the one in `package.json`. The 14-day rule
was waived for the scaffold only (`--minimum-release-age=0` on each `bun add`; `bunfig.toml` is
unchanged), so a few versions are younger than 14 days. They are listed in the "did not qualify"
note at the top. Renovate applies the 14-day rule to later updates.

Checks on 2026-10-28:

- `bunx expo-doctor`: 20 of 20 checks pass.
- `bunx expo install --check`: up to date.
- Without the exclusion below, both report two patch mismatches: `expo` 58.0.11 (SDK 58 now expects
  ~58.0.20) and `jest-expo` 58.0.11 (expects ~58.0.12). The plan pins `expo` at 58.0.11, and the
  newer patches are younger than the 14-day rule, so `apps/mobile/package.json` lists the two in
  `expo.install.exclude`. That keeps `mobile-health` green and hides nothing else. Remove the
  exclusion when Renovate bumps both (`DECISIONS.md`, 2026-10-28).
- `mobile-health` checks against the SDK 58 versions Expo publishes now, not the ones at scaffold
  time. On 2026-10-28 Expo shipped a patch for thirteen modules (`expo-clipboard`, `expo-constants`,
  `expo-dev-client`, `expo-font`, `expo-image`, `expo-image-manipulator`, `expo-linking`,
  `expo-location`, `expo-notifications`, `expo-router`, `expo-splash-screen`, `expo-system-ui`,
  `expo-updates`), and the job failed until the exact pins moved to them. Those bumps waive the
  14-day rule like the scaffold did.
- The module patches of 2026-10-28 need `expo-modules-jsi` 58.0.21. With `expo` at 58.0.11 the
  lockfile kept `expo-modules-core` 58.0.27 and `expo-modules-jsi` 58.0.20, and the iOS build crashed
  at launch (`ExpoFont` could not find a symbol in `ExpoModulesJSI`). `expo` now pins 58.0.21, which
  brings `expo-modules-core` 58.0.28 and `expo-modules-jsi` 58.0.21. `expo` left
  `expo.install.exclude`, so the check now flags it when it falls behind; only `jest-expo` stays.
