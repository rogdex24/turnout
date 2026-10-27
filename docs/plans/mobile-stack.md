# Turnout mobile: stack confirmation

Status: Week 1 draft, 2026-10-27. Plan F7 and F8. The plan (section 2, Engineering) is
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
| Framework | `expo` | 58.0.11 | 2026-10-15 | https://expo.dev/changelog/sdk-58 | planned |
| Framework | `react-native` | 0.88.0 (the line Expo SDK 58 pins) | 2026-10-15 | https://www.npmjs.com/package/react-native | planned |
| Framework | `react` | 19.3.0 | 2026-09-09 | https://www.npmjs.com/package/react | installed (root, web) |
| Package age | `minimumReleaseAge` in `bunfig.toml` | 1209600 | n/a | https://bun.com/docs/runtime/bunfig | planned (workspaces stream) |
| Workspaces | `bun` | 1.4.3 | 2026-10-10 | https://docs.expo.dev/guides/monorepos/ | installed |
| Navigation | `expo-router` | 58.0.19 (candidate) | 2026-10-14 | https://docs.expo.dev/router/introduction/ | planned |
| Components | `@react-native-reusables/cli`, components vendored into `src/ui/primitives` | 0.7.1 (candidate) | 2026-03-14 | https://reactnativereusables.com | planned |
| Styling | `uniwind` | 1.12.2 (candidate, F8 decides) | 2026-10-05 | https://docs.uniwind.dev | planned |
| Styling | `tailwindcss` | 4.3.3 | 2026-07-16 | https://www.npmjs.com/package/tailwindcss | installed (root, web) |
| Styling fallback | `nativewind` on Tailwind v3, inside `apps/mobile` only | 4.2.7 | 2026-09-14 | https://www.nativewind.dev | planned (only if F8 fails) |
| Server state | `@tanstack/react-query` | 5.104.3 (candidate) | 2026-10-15 | https://tanstack.com/query/v5/docs/framework/react/overview | planned |
| Server state | `react-native-mmkv` | 4.3.2 | 2026-06-22 | https://github.com/mrousavy/react-native-mmkv | planned |
| Server state | `expo-crypto` | 58.0.6 (candidate) | 2026-10-09 | https://docs.expo.dev/versions/v58.0.0/sdk/crypto/ | planned |
| Server state | `expo-secure-store` | 58.0.2 (candidate) | 2026-10-01 | https://docs.expo.dev/versions/v58.0.0/sdk/securestore/ | planned |
| Forms | `react-hook-form` | 7.90.0 (candidate) | 2026-10-11 | https://react-hook-form.com | planned |
| Forms | `zod` | 4.6.6 | 2026-10-11 | https://zod.dev | planned (contract package, workspaces stream) |
| Sessions | `jose` | 6.2.12 | 2026-09-05 | https://github.com/panva/jose | planned (server, S1) |
| Sign-in channel | WhatsApp authentication template, Meta Cloud API, Graph API | v26.0 | n/a | https://developers.facebook.com/docs/whatsapp/cloud-api/ | planned (S28) |
| Autofill | `com.whatsapp.otp:whatsapp-otp-android-sdk`, wrapped by the local Expo module `whatsapp-otp` | 1.0.0 | 2026-03-26 | https://central.sonatype.com/artifact/com.whatsapp.otp/whatsapp-otp-android-sdk | planned |
| Maps | `react-native-maps` | 1.29.11 | 2026-09-27 | https://docs.expo.dev/versions/v58.0.0/sdk/map-view/ | planned |
| Push | `expo-notifications` | 58.1.4 (candidate) | 2026-10-14 | https://docs.expo.dev/versions/v58.0.0/sdk/notifications/ | planned |
| Push | Firebase project `turnout-push` on Spark (FCM V1) | n/a | n/a | https://firebase.google.com/pricing | planned (M3) |
| Icons | `phosphor-react-native` | 3.0.6 | 2026-04-23 | https://www.npmjs.com/package/phosphor-react-native | planned |
| Icons | `react-native-svg` | 15.16.0 (candidate, Expo pins) | 2026-10-15 | https://docs.expo.dev/versions/v58.0.0/sdk/svg/ | planned |
| Fonts | `@expo-google-fonts/inter` | 0.4.2 | 2025-09-11 | https://www.npmjs.com/package/@expo-google-fonts/inter | planned |
| Fonts | `@expo-google-fonts/big-shoulders` | 0.4.1 | 2025-09-04 | https://www.npmjs.com/package/@expo-google-fonts/big-shoulders | planned |
| Lists, motion | `@shopify/flash-list` (v2) | 2.3.3 (candidate) | 2026-10-01 | https://shopify.github.io/flash-list/ | planned |
| Lists, motion | `react-native-reanimated` (v4) | 4.7.1 (candidate, Expo pins) | 2026-10-02 | https://docs.swmansion.com/react-native-reanimated/ | planned |
| Lists, motion | `react-native-gesture-handler` | 2.33.0 (candidate, Expo pins) | 2026-09-14 | https://docs.swmansion.com/react-native-gesture-handler/ | planned |
| Lists, motion | `expo-haptics` | 58.0.6 (candidate) | 2026-10-13 | https://docs.expo.dev/versions/v58.0.0/sdk/haptics/ | planned |
| Errors | `@sentry/react-native` | 8.31.0 (candidate) | 2026-10-15 | https://docs.sentry.io/platforms/react-native/ | planned |
| Analytics | `posthog-react-native` | 4.81.2 (candidate) | 2026-10-14 | https://posthog.com/docs/libraries/react-native | planned |
| Server runtime | `bun` with `bun:sqlite` in WAL | 1.4.3 | 2026-10-10 | https://bun.com/docs/runtime/sqlite | installed |
| Server packages | `expo-server-sdk` | 7.2.0 | 2026-08-24 | https://github.com/expo/expo-server-sdk-node | planned |
| Server packages | `libphonenumber-js` | 1.13.14 | 2026-09-24 | https://gitlab.com/catamphetamine/libphonenumber-js | planned |
| Files | Local disk store (`OBJECT_STORE=disk`), Bun `S3Client` later | n/a | n/a | https://bun.com/docs/runtime/s3 | planned |
| Backups | Litestream | 0.5.6 | 2026-01-09 | https://github.com/benbjohnson/litestream/releases/tag/v0.5.6 | planned (host slot) |
| Contract | `@turnout/contract` (Zod only) | workspace | n/a | `docs/plans/mobile-app-brief.md` | planned (workspaces stream) |
| Lint, format | `@biomejs/biome` | 2.5.15 | 2026-09-30 | https://biomejs.dev | installed |
| Lint, format | ESLint, React Compiler rules and `expo/no-dynamic-env-var` only | set at F13 | n/a | https://docs.expo.dev/guides/using-eslint/ | planned |
| Tests | `bun test` | 1.4.3 | 2026-10-10 | https://bun.com/docs/cli/test | installed |
| Tests | `jest-expo` | 58.0.11 (the 58.x line) | 2026-10-15 | https://docs.expo.dev/develop/unit-testing/ | planned |
| Tests | `@testing-library/react-native` | 14.1.0 (candidate) | 2026-10-08 | https://callstack.github.io/react-native-testing-library/ | planned |
| Tests | Maestro CLI | 2.11.0 | 2026-09-29 | https://github.com/mobile-dev-inc/Maestro/releases/tag/cli-2.11.0 | planned (F19) |
| Tests | `@storybook/react-native` (v10) | 10.7.0 | 2026-10-13 | https://github.com/storybookjs/react-native | planned (F16) |
| Visual diffs | `odiff-bin` | 4.5.0 | 2026-07-23 | https://github.com/dmtrKovalenko/odiff | installed (root devDependency) |
| CI | `reactivecircus/android-emulator-runner` | v2.38.0 | 2026-07-05 | https://github.com/ReactiveCircus/android-emulator-runner/releases/tag/v2.38.0 | planned (F19) |
| CI | `@expo/repack-app` | 0.10.4 | 2026-09-29 | https://docs.expo.dev/build-reference/repack/ | planned (F19) |
| CI | GitHub Actions, standard runners, one required check `ci-gate` | n/a | n/a | https://docs.github.com/en/actions/reference/limits | planned (public-repo-audit stream, F21) |
| Unauthorized access | One 404 for not found, not yours and not yet | n/a | n/a | `docs/plans/mobile-app-brief.md` | planned (server) |
| Device matrix | `android-small`, `android-large`, `ios-small`, `ios-large` | n/a | n/a | `docs/plans/mobile-visual-testing.md` | planned |
| Builds | `eas-cli` | 24.14.0 (candidate) | 2026-10-14 | https://docs.expo.dev/build/introduction/ | planned (F18) |
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

Runs on days 5 and 6 (2026-10-30 and 2026-11-02), after the scaffold. Results are empty until then.

### Styling: Uniwind or NativeWind

Test: Uniwind with Tailwind 4.3.3 and one react-native-reusables Button, light and dark, on the
Android emulator and the iOS simulator (the `ios-small` CI job if there is no Mac).

| Check | Pass when | Result | Screenshot |
|---|---|---|---|
| Builds on SDK 58 | Android and iOS dev builds compile and launch | | |
| `className` applies | The Button shows the token colours and padding from its classes | | |
| Dark mode follows the system | Switching the emulator theme restyles the Button with no app code | | |
| `bunx expo install --check` | Clean, no mismatched versions | | |

Outcome: pending. If every check passes, Uniwind on Tailwind 4.3.3 is the styling layer. If any
check fails, the fallback is NativeWind 4.2.7 on Tailwind v3 inside `apps/mobile` only, fed by
`design.md export --format json-tailwind`, and the fallback stays until after M5.

### Maps

| Check | Pass when | Result | Screenshot |
|---|---|---|---|
| Android, restricted key | Two pins show on the map in a dev build with the real SHA-1 on the key | | |
| Android, wrong SHA-1 | The map is blank and `adb logcat` shows the authorization error | | |
| iOS simulator | Apple Maps shows the two pins with no key | | |
| e2e variant | The `.e2e` build, which has no key, shows the "map unavailable" card | | |

Outcome: pending. Acceptance for F8 is both outcomes recorded here with screenshots. The
screenshot column links to the PR or run that holds them; no PNG is committed for this spike.
