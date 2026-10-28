# Decisions

## 2026-10-10: use Grok for the agent source; park Gemini and Antigravity

Decision. `agent:grok` is the agent source we use. `agent:gemini` and `agent:agy` stay
parked and are not run. Revisit Gemini once the process is streamlined, and then only as
a tool-calling step inside our own pipeline, not as a source that finds events itself.

Evidence. Pilot on one seed (`events.communitie.in/hyderabad`, events for Oct 10 and 11),
run against `data/pilot.sqlite`, one run per harness.

| | Grok | Gemini | agy |
|---|---|---|---|
| Wall time | 12m 1s | 8s | 8m 52s |
| Emitted | 69 | 0 | 23 |
| Accepted | 52 | 0 | 15 |
| Rejected | 17 | 0 | 8 |
| Accepted rows matching a Communitie row | 49 of 52 | n/a | 13 of 15 |

Why not Gemini. The CLI fails at login: "This client is no longer supported for Gemini
Code Assist for individuals", with a pointer to Antigravity. No model call is made, so
this says nothing about its quality.

Why not agy. It found a third of what Grok found on the same page, and its accepted
events were a subset of Grok's. No flag removes its shell: `--sandbox` limits terminal
commands only, and it used the shell to write and run a download script that read a file
from its own state directory. Too loose to run unattended.

Why Grok. It found the most events, and `--tools web_search,web_fetch,write_file` gives
it the narrowest tool scope of the three.

Caveats. One seed and one run each. Communitie is also a Tier A source, so it is the easy
case. Test Grok on a venue site with no API before drawing wider conclusions.

Follow-ups for Grok.
- The verifier rejected 10 real events because the agent reformatted the date quote
  (allevents.in writes "Sat, 10 Oct 2026 • 7:00 PM (IST)", the agent quoted "Sat, 10 Oct,
  2026 at 07:00 pm IST"). Consider matching on day, month and time tokens.
- Grok still loads the operator's MCP servers (a Playwright server appeared in the run
  directory). Block them.
- Open question Q13 (vendor terms for unattended use of a consumer subscription) still
  applies before any scheduled run.

Update 2026-10-10. The operator confirmed Grok only. The Gemini and agy harnesses, the
Gemini policy file and their doc mentions are removed. The Harness table keeps its shape,
so adding a harness later is one entry plus one registry line.

Update 2026-10-10 (later). The date check now verifies by parts (day, month, time within
60 characters), and run directories sit next to the --db file. Verification run on a copy
of the pilot DB: 53 emitted, 43 accepted, 0 rejections for date formatting (was 10 of 17).
The Grok MCP follow-up is still open.

## 2026-10-27: mobile stack confirmed; odiff for visual diffs, our own chat, WhatsApp codes

Decision. The mobile stack in plan section 2 stands, and the four Week 1 questions in
`docs/plans/mobile-app-brief.md` are answered. The monorepo works with Expo and Metro, so the
app lives in `apps/mobile` under Bun workspaces. Maps use `react-native-maps` 1.29.11. Visual
diffs use `odiff-bin` 4.5.0 at threshold 0.1, with baselines in Git LFS. The identity vendor is
dropped. The group thread is our own, polled while the screen is focused. Sign-in codes go by
WhatsApp, with no SMS. The full table with versions, sources and publish dates is
`docs/plans/mobile-stack.md`.

Evidence. Expo's monorepo guide (https://docs.expo.dev/guides/monorepos/) and its map view page
for SDK 58 (https://docs.expo.dev/versions/v58.0.0/sdk/map-view/). Every version was read from
the npm `time` entry on 2026-10-27 and held to the 14-day rule at the scaffold date,
2026-10-29 19:40 UTC. `odiff-bin` 4.5.0 is installed and the diff script runs against generated
sample PNGs (same, changed, missing, new, resized) in `test/visualDiff.test.ts`.

Why. A monorepo keeps `@turnout/contract` one source for the server and the app. `expo-maps`
needs iOS 17, and the plan supports iOS 16.4. odiff is free and fast, and a threshold of 0.1
leaves room for anti-aliasing. The identity check is gone from v1, replaced by the handle check
and the ban list. A text thread for one group needs none of a chat SDK's moderation and read
state. WhatsApp codes cost about 0.136 INR each with GST and have one-tap autofill on Android.

Caveats. Uniwind against NativeWind is not decided: the F8 spike on 2026-10-30 and 2026-11-02
decides it, and NativeWind 4.2.7 stays as the fallback until after M5. Several Expo-managed
versions are candidates that `expo install` may move at the scaffold. `posthog-react-native`
4.84.2, `react-hook-form` 7.91.0, `@tanstack/react-query` 5.105.0 and `eas-cli` 26.0.0 are under
14 days old today, so older versions are listed. Baseline LFS use is an estimate (about 168 MB a
set, about 2 GB a month of bandwidth) until the first snapshot on 2026-11-02. The iOS gaps (no
TestFlight, real iPhone, universal links, iOS push, or App Store listing) are listed in
`docs/plans/mobile-visual-testing.md`.

## 2026-10-27: M2 server, where the build differs from the plan or fills a gap

Decision. Each item below is a choice made while building S1 to S6, S16 and S20 where the plan was
silent, or where it could not be followed as written. Each keeps the plan's intent.

1. **The contract lives in `packages/contract`, not `src/`.** The plan's file list says
   `packages/contract/src/*.ts`; the workspace from F-tasks puts the files at `packages/contract/*.ts`
   and `packages/contract/app/*.ts`. The server imports `@turnout/contract`. `FIRST_NAME_MAX` is 40, not
   30, so long first names in common use fit; the app reads the same constant.
2. **`rate_bucket.window_start` is epoch seconds.** Every other table uses ISO UTC text. A rate window
   is arithmetic (floor to the window), so integers avoid parsing on each request. `docs/data-model.md`
   section 13 says so.
3. **`otp:sends` is kept 62 days.** The monthly spend alert needs the previous and current month, so
   the one counter outlives the usual one-window retention. No phone or address is in it.
4. **A distinct 503 `otp_cap_reached`.** The plan says every refusal is one generic `sign_in_unavailable`
   except 429 and the tripped cap. The cap answer is a different status and code so the app can show
   "try again tomorrow" and not "this number cannot sign in". `sign_in_unavailable` itself is 403.
5. **The ban list stands in as `member.status = 'banned'` until M4.** S25 (the keyed-hash ban list) is
   not in this stream. Sign-in refuses a banned member with the generic 403 and refresh revokes the
   session. M4 adds the hashed list and does not change the response.
6. **Refresh token reuse is strict.** A refresh token that was already traded in signs the member out
   everywhere, with no grace window. A client that retries a refresh after a lost response will have to
   sign in again; this is the safe side for a stolen token. Revisit if the field shows many false hits.
7. **Exact T-24h counts as closed.** `isEligible` closes joining at the instant T-24h, the same as the
   lock, so the two never disagree. The tests cover one second before, exactly, and after.
8. **The start override is null in M2.** `isEligible` takes an operator start override, but the table
   and the admin write arrive in M3 (S15). Until then a date-only show is never eligible.
9. **The handle lock is a stub.** `PUT /me/handle` returns 409 `handle_locked` through
   `isInLockedGroup`, which returns false until the group tables exist in M3. The route and its test
   hook are in place.
10. **`FileLink.url` is a relative path or an absolute URL.** Disk and memory stores give a path on the API
    origin (`/api/app/v1/files/<key>?exp=&sig=`); S3 gives a presigned absolute URL. The store takes the
    signer as an injected `link` function so `src/utils` imports nothing from `src/app-api`.
11. **Photo upload takes raw bytes.** `PUT /me/photo` reads the request body as the image, with the
    `Content-Type` ignored and the bytes sniffed (JPEG, PNG, HEIC). A multipart form would need a parser
    that reads past the 10 MB cap before it can refuse.
12. **HEIC is sniffed and decoded by `Bun.Image`, and the decode could not be checked here.** I could not
    verify a HEIC decode on this Linux machine, so the tests cover the sniffer and the failure path (a
    file the decoder cannot read is 400 `unsupported_type`). A real HEIC upload is a check on the host
    (`docs/plans/mobile-accounts.md`, needs owner). A member whose phone sends HEIC and fails is told to
    try a JPEG or PNG.
13. **Staging and development fill a missing secret with a random one for the run.** The server lists
    the names in `ephemeral` and logs them. Sessions end at a restart. Production refuses to start
    instead.
14. **S20: `FAKE_UNDELIVERABLE_PHONES`.** The plan asks for one number the fake sender marks
    `undeliverable`. It is an environment list so any environment can name its own; the seed prints it.
15. **S20: five seeded states wait for M3.** Waiting, grouped before the reveal, meet card live, group
    of 3 and done need plan and group tables. They are seeded as matchable members with their numbers
    reserved, and the seed file says where M3 adds the rows. The recording push sender belongs with the
    push work (S11, M3), so staging uses no push sender yet.
16. **S20: the test token is generated per run.** `e2e/mobile-server.ts` makes a random
    `STAGING_TEST_TOKEN` at start and hands it to the test through the returned object. It is never
    written to a file.
17. **`/privacy` is not an exact-path route.** `exactPath` in `src/web/index.ts` declines a trailing
    slash and returned 404 for `/privacy/`; the page now answers both.

Evidence. Tests for each item: `test/auth.test.ts`, `test/appApi.test.ts`, `test/appProfile.test.ts`,
`test/eligibility.test.ts`, `test/objectStore.test.ts`, `test/seedStaging.test.ts`,
`test/privacyPage.test.ts`, `test/mobileServer.test.ts`.

Why. Each one is the smaller or safer choice that keeps the plan's behaviour for members. None adds a
paid service or a package.

## 2026-10-28: mobile scaffold; Uniwind kept, device checks pending

Decision. `apps/mobile` is scaffolded (F12 to F21) and Uniwind 1.12.2 on Tailwind 4.3.3 is the
styling layer. NativeWind stays the documented fallback and is not installed. The verdict holds
at bundle level only: no emulator, Mac or Maps key was available, so the device checks in
`docs/plans/mobile-stack.md` (F8) are pending and the maps checks are not run.

Evidence. `bunx expo export` for android and ios succeeds with Uniwind; the bundle holds the token
variables, the dark-theme values and both fonts. A release export drops Storybook (7.7 MB to
4.2 MB). `bunx expo-doctor` passes 20 of 20. Jest, ESLint, Biome, the typecheck and the
dependency rules pass. An Android debug APK build (JDK 17, Android SDK 37, x86_64) was started and
the Gradle daemon disappeared in the Kotlin compile steps, so no APK exists. Android APK build
pending. The iOS build needs a Mac, so it waits for the `build-ios` job. Maestro `check-syntax`
passes on every flow. No CI job has run on a GitHub runner.

Why. Uniwind needs no Tailwind v3 pin and no second Tailwind in the repo. The only gap found is
that it has no Jest runtime: a unit test asserts the `className` prop, and the pixel check is the
Storybook and visual-diff job.

Deviations from the plan and choices made while scaffolding:

- Version age. The 14-day rule was waived for the scaffold with `--minimum-release-age=0` on each
  `bun add`. `bunfig.toml` is unchanged. Every package in `apps/mobile` has an exact pin.
- `expo` stays at 58.0.11 and `jest-expo` at 58.0.11, though SDK 58 now expects 58.0.20 and 58.0.12.
  `expo.install.exclude` lists those two so `expo-doctor` and `expo install --check` pass in CI.
  Remove it when Renovate bumps them.
- Fonts are embedded at build time through the `expo-font` plugin, so there is no splash wait on a
  font download and the e2e build needs no network.
- No color literal in `apps/mobile/src`. A Biome grit plugin (`lint/no-color-literals.grit`)
  enforces it; colors come from token classes or `useColors()`.
- Storybook is a route gated by the inlined `EXPO_PUBLIC_STORYBOOK`, so release bundles drop it.
  The check was done once with an export, not in CI.
- Config files import with `.ts` extensions (`config/variants.ts`), because `app.config.ts` is
  loaded by Node's type stripping before Metro runs.
- `preview` and `production` throw at config time without `EXPO_PUBLIC_API_URL` and
  `GOOGLE_MAPS_ANDROID_API_KEY`. `e2e` and `development` do not need the key.
- The router test is `src/router.test.tsx`, not under `src/app`, because Expo Router turns every
  file in `src/app` into a route.
- `.easignore` is at the repository root, because EAS archives from the git root in a monorepo.
- The copy lint is a Jest test (`src/copy/copy.test.ts`), not a Biome rule, because it reads a
  word list across all strings.
- F20 uses the Home placeholder story (`screens-home--placeholder`) as the only visual story, since
  the events list is an M2 screen. `visual-compare.sh` passes with a notice until a target has an
  accepted baseline; none could be made without an emulator.
- Device jobs are two matrix jobs, `android-device` and `ios-device`, whose run names are the four
  targets. The one automatic re-run is `cmd || cmd` in the job script.
- The iOS runner is `macos-26` instead of `macos-latest`, with the simulator runtime pinned to
  iOS 26.2, so a runner image change cannot move the baselines. actionlint does not know the
  `macos-26` label yet and reports it; the label is valid on GitHub.
- The Maestro CLI sha256 in `install-maestro.sh` was computed from the 2.11.0 download, because the
  release publishes no checksum file.
- `eas-cli` 26.0.0 is newer than 14 days and is run with `bunx` in `eas-update.yml` and
  `eas-build.yml`, not installed as a dependency. Both workflows are skipped while the repository
  variable `EAS_PROJECT_ID` is empty.
- The `mobile` paths filter in `ci.yml` is wider than `apps/mobile/**`: it also matches `packages/**`,
  `src/**`, `e2e/**` and `data/**` (the e2e server serves the real API), `scripts/visual-*.ts`, the
  LFS config, `package.json`, the lockfile and `ci.yml`.
- The native cache key is the fingerprint taken before prebuild. A hit is repacked with
  `@expo/repack-app` 0.10.4 (`apps/mobile/ci/repack.sh`); a miss builds from scratch.
- Risk, not fixed. The root `prepare` script runs `lefthook install`, which may fail on an EAS build
  machine that has no `.git` or no lefthook. If the first EAS build fails there, guard `prepare`
  with a check for `.git`.

Caveats. The Maps checks, the first baseline accept and every account-dependent step are listed in
`docs/plans/mobile-accounts.md` under "Needs owner" and "First CI run".
