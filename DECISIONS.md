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
6. **Refresh token reuse is strict (superseded on 2026-10-28 by the grace window below).** A refresh token that was already traded in signs the member out
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

## 2026-10-28: first run of the mobile device jobs

Decision. The four device jobs failed on their first runner run, after the scaffold PR merged. Five fixes:

- The iOS jobs waited for the seeded server with `timeout`, which macOS runners do not have. The wait is now a bounded loop, and
  the Android jobs use the same loop.
- Maestro 2 refuses a `takeScreenshot` path outside its own output folder. Each capture now runs with a fresh
  `--test-output-dir`, and `device-run.sh` moves the shot to `$SHOT_DIR/<story>/<theme>-<text>.png`, so the baseline layout
  does not change.
- The runner's avdmanager has no `pixel_9_pro_xl` profile. `android-large` uses `pixel_7_pro`, the same large-phone class.
- On the iOS simulator, a custom-scheme link opens the system alert "Open in “Turnout (e2e)”?". `capture-story.yaml` taps
  Open when the alert is there.
- The cold `pixel_7_pro` emulator showed "Pixel Launcher isn't responding" over the app. `device-run.sh` sets
  `hide_error_dialogs`, and `launch.yaml` taps Wait if the dialog still shows.

Evidence. The failed run is https://github.com/rogdex24/turnout/actions/runs/40613582365. `android-small` passed both flows
before the screenshot step, so the app, the e2e build and the seeded server work on a device. The last two fixes come from
https://github.com/rogdex24/turnout/actions/runs/40617294502.

## 2026-10-28: M2 server, review round for PR 9

Decision. Eight review items, each fixed with a test. Where one changes a choice above or the plan, it
is listed here.

1. **Refresh reuse has a 30 second grace window** (`session.refreshGraceSeconds`). This replaces item 6
   of the 2026-10-27 entry. A refresh token that was traded in less than 30 seconds ago, whose
   replacement is still unused, is a retry after a lost response: it is answered by rotating the
   replacement, and no session is revoked. After the window, or once the replacement has been used,
   revoked or replaced, the old token is a replay and every session of the member is revoked. The app
   must single-flight refresh (one call at a time); `AGENTS.md` says so (A1).
2. **Photos have a 40 MP limit and a daily upload limit.** The pixel count comes from `metadata()`
   before the decode; more than `photoMaxPixels` (40,000,000) is 413 `file_too_large`. `PUT /me/photo`
   is limited to 10 per member per IST day (`rate.photoUploadPerMemberDay`), counted before the decode.
3. **The photo key is opaque:** `photos/<ulid>.jpg`, with no member id. This changes the key shape that
   item 10 of the 2026-10-27 entry implied; the file link stays signed and short-lived.
4. **The orphan sweep covers `photos/` only.** It skips keys that fail `isValidKey`, and the day marker
   is written after a pass that finished, so a failed pass is retried on the next tick. Ticket files
   join the prefix list when they exist (M3).
5. **`serve` requires `TURNOUT_ENV`,** and `STAGING_TEST_TOKEN` must be at least 32 characters outside
   production. Tests and tools that build the app without the CLI still default to development.
6. **Reviewer wrong tries are capped:** 20 a day per IST day (`otp.reviewerFailCapPerDay`). Past it,
   a verify for the store-review number answers `invalid_code` even with the right code, and the
   operator is alerted once an hour (`otp_reviewer_locked`). The reviewer still skips the per phone
   request limits (a reviewer must always get a code), which is why the verify side needs its own cap.
   The count is in `rate_bucket` under a keyed hash, so no phone is stored.
7. **Alerts never block a request and give up after 5 seconds.** `notify` records the alert and sends
   in the background with `AbortSignal.timeout(5000)`; a failure or timeout goes to the process log.
   The hourly repeat guard is unchanged and runs before the send.
8. **`createAppContext` refuses a fake sender when the environment is production,** with a
   `ConfigError`. The earlier test name claimed more than it checked and now says what it does.

Evidence. `test/auth.test.ts`, `test/appProfile.test.ts`, `test/objectStore.test.ts`,
`test/appHousekeeping.test.ts`, `test/appApi.test.ts`, `test/mobileServer.test.ts`.

Why. Each is the narrower or safer behaviour that the review asked for. None adds a package or a
paid service. Item 1 is the one real reversal of an earlier choice: strict reuse would have signed
members out whenever a response was lost on a bad network.
## 2026-10-28: M2 app (A1 to A10), where the build differs from the plan or fills a gap

- `onboardingStep()` returns a fourth step, `sign_in`, between the notice and the profile, so a signed-out phone that has accepted the
  notice is held on the phone screens and cannot reach the app.
- Signed out, the notice is "accepted" when the stored version equals `NOTICE_VERSION`. Signed in, it is `me.consent.current`.
  Signing out clears the stored notice (the welcome flag stays), so the next person on the phone sees the notice.
- The route guards are two levels of `Stack.Protected`: `(onboarding)` against `(app)` at the root, and one guard per step inside
  `(onboarding)`. `(onboarding)/index.tsx` redirects `/` to the open step, because with no `/` route in that group a cold start
  lands on `+not-found`.
- The root layout keeps the splash up until the session, the disk cache and `/me` have answered, then keeps the last known step while
  `/me` refetches, so a screen is never shown and then replaced. A first `/me` that fails for lack of a network ends as a retry
  screen (the query is paused, not errored, so the gate treats a paused first load as failed). The retry marks the network as up
  before it fetches, because the last failure marked it down and the query would stay paused.
- Native tabs use SF Symbols and Material icons, not Phosphor (spec line 60 names Phosphor). `expo-router/native-tabs` draws the
  platform icons itself and cannot take a React component.
- `openPrefs` and `openCacheStore` live in `mmkvStore.ts`, because `react-native-mmkv` does not load in Jest and the other modules
  must.
- `me` is part of the encrypted disk cache so a start without a network still routes. The cache key is 24 random bytes held in the
  secure store as 32 base64 characters (an AES-256 key for MMKV).
- There is no `netinfo` package in the plan, so connectivity follows request outcomes: a call that gets no answer is offline, any
  answer is online.
- The OTP response has no `resendAfter` field in the contract, so the resend wait is a fixed 30 seconds, extended by `Retry-After`
  on a 429.
- The areas tool response has no contract schema, so the schema is local to the app (`/tools/list_areas`).
- The persister stamps the cache buster on every write. `PersistQueryClientProvider` reads its options only when it mounts, so a
  buster that changes with sign-in could not be passed as an option.
- Jest maps `./x.js` to `./x` because the contract package imports its own files with the `.js` suffix.
- `src/router.test.tsx` mocks `@/providers/boot` and the splash module and uses in-memory stores (`createTestApp`), because MMKV and
  the native splash do not load in Jest. The test still runs the real session, API client, query client, gates and route tree.
- The poster placeholder uses the music tone for categories that have no tone of their own.
- Sheet is a React Native `Modal` with a drag-free layout, not `@gorhom/bottom-sheet`, because that library needs a native gesture
  setup that cannot be checked without a device. The dependency stays listed for later.
- The story files type their `meta` as plain `Meta` and pass `args` explicitly, because the typed helper rejects components with
  required props.
- A1 acceptance "system back on every pushed screen" is covered by the router test on the pushed screens that exist. The sign-in to
  code and Home to Show cases are added with A5 and A8. The Android back gesture itself needs a device.
- Welcome (A4): the board only draws card 1, so the copy for cards 2 and 3 is written here (`src/copy/welcome.ts`) and the trust line
  is on every card. The wordmark diamond is left out of the hero; the wordmark is text only.
- `TextButton` is a new primitive for the borderless Skip, Next-as-text and Send again actions. The design uses it on four screens,
  so it lives in `src/ui/primitives` with stories, not as a one-off style.
- `Matrix` has a `framed` option that gives its content the window height, so full-screen stories (Welcome, sign-in) lay out as on a
  device.
- `jest.setup.ts` mocks `react-native-safe-area-context` with the library's own Jest mock, so any screen that reads insets renders in
  a test without a provider.
- WhatsApp one-tap (A5) uses Meta's `whatsapp-otp-android-sdk` 0.2.0, not 1.0.0. The 0.2.0 line gives the handshake id back through
  `processOtpCode`, so the app can drop a code that belongs to an earlier send. The module is a local Expo module in
  `apps/mobile/modules/whatsapp-otp` with a plain JavaScript config plugin (Expo loads plugins with no build step). Its Kotlin code
  could not be compiled or run here, so one-tap on a real phone is partial.
- On iOS and in the e2e build the module is a stub. The stub reports WhatsApp as installed in the e2e build, and `null` (maybe) on iOS,
  which the screens treat as "maybe installed". The e2e codes come from the `__test/otp` route.
- `expo-clipboard` 58.0.3 is added for the Paste action on the code screen.
- Jest `roots` now include `modules`, so the config plugin test runs under `bun run check`.
- The code screen's "Not there yet?" and the resend wait are two clocks: the prompt shows 60 seconds after the send, or when the
  resend wait ends if that is later, and Send again stays off until the resend wait ends.
- The sign-in screens (A5) share one `SignInFlowProvider` in the `(onboarding)` layout: the typed number, and the code that was sent
  (phone, challenge id, send time, when Send again opens). The code route sends a cold start back to the phone step, since there is
  no challenge to enter. The phone step has no back button, because nothing sits before it in the sign-in step.
- Sign-in polls `GET /auth/otp/:id` every 3 seconds from second 3 to second 117 (39 asks), then stops. `undeliverable` swaps the
  boxes for the "not on WhatsApp" note with Change number only; `failed` says the code did not arrive and opens Send again early.
- The same refusal sentence shows for any 403 on send or verify, so the screen never says why a number was turned away.
- `BackBar` (a back arrow row) and the `icon` and `disabled` props on `TextButton` are new for the code screen; `allowSeedNumbers`
  (`src/api/variant.ts`) lets the development and e2e builds type a full +1 202 555 01xx seed number, the production build never does.
- Maestro `otp-errors.yaml` waits out the 30 second resend wait, so it takes about a minute. CI passes the server's token to the
  flows as `TEST_TOKEN`, read from the seeded server's log and masked.
- Notice (A6) is a full screen, which the board left open between a full screen and a sheet. It shows the bundled notice paragraphs
  and takes the grievance officer's block from `/config`. Agree stays off until those details are on the screen, so nobody agrees
  to a notice with its contact missing, and a failed load offers Try again. Signed out, agreeing stores the version on the phone;
  signed in (the notice moved), it calls `POST /me/consent` and writes the new consent into the cached `me`, so the router moves on.
- Profile photo (A6): no camera option and no media-library permission. The system photo picker needs none, and the
  `expo-image-picker` plugin blocks the camera and microphone permissions. The picture is always drawn again at 1080 px on its long
  side and saved as a new JPEG on the phone, which drops EXIF and GPS; the server draws it once more. That the saved file really
  carries no EXIF is device-only, so that acceptance line is partial (the helper's calls are covered by a Jest test).
- Saving the profile is a stateless sequence: profile, then photo, then handle (a new photo sends an approved handle back to review,
  so the handle goes last). The cached `me` is updated after each call, so a retry sends only what is left, and a handle the
  account already holds is not sent again, since that would put an approved handle back in the queue.
- A server refusal shows next to its own field: `unsupported_type` and `file_too_large` under the photo, `handle_locked` and the
  daily limit under the handle, a refused profile under the first name or the women-only switch. Offline, rate limits and server
  faults with no field say so above Save.
- The women-only switch is shown only for women and non-binary people, with the system `Switch` coloured from the tokens, and it is
  cleared (and never sent) when the gender becomes man. `PersonAvatar` gets a 96 dp `lg` size for the profile photo.
- The Maestro onboarding flow stops at the photo: the system picker is not scripted, so the photo path is covered by Jest tests only.

## A7 Home (M2)

- The Home title is "Shows coming up" with no date range. The board's "Shows this week" would be wrong whenever the list holds more
  or fewer than a week of shows, since the server pages by start time and not by week. The city label under the wordmark is static
  and not a button: Hyderabad is the only city in v1, so there is nothing to choose.
- The featured card leaves out the date block on the poster. The stub under the tear line already carries the day and time
  ("Sat 7:00 PM") in text that scales, and a second copy on the picture added noise. Cards show no count of people, as the plan says.
- `image_url` is null for every show today, so the flat category-tone poster is what ships. The photo poster path is already in
  `Poster` and takes over once a show has an image.
- The plan bar sits in the flow under the list (a flex column), not absolutely positioned over it. The list is then inset above
  it without measuring anything, and it stays on top of the tab bar. There is no plan data until the plans arrive in M3, so
  `HomeScreen` passes `plan={null}` and the bar is built and tested with props only (stories: Finding, Settled, LongTitle).
- The handle check strip (A29) was built here, early, because Home is where it shows. It is the strip only: pending says the profile
  is being checked, rejected gives a sentence per reject reason and Change handle opens the existing profile form at
  `settings/profile`. There is no `settings/social` route in this build. `useMe` polls every 60 seconds while the handle is
  pending, so the strip goes away on its own when the review finishes.
- The area list schema lives in `src/api/shows.ts`, not in the contract package: `/tools/list_areas` is a web tool route, not part of
  the app API contract. Areas with no shows are hidden from the pills so no pill leads to an empty list.
- `useNow` moved from `screens/signin` to `providers`, since Home and the sign-in code step both read the clock.
- Jest now compiles `@shopify/flash-list` (it ships ES modules) and loads the library's own `jestSetup`, which fixes the measured
  window. FlashList's loaded timer fires outside `act` in a few Home tests and prints a warning; the tests pass and the warning is
  the library's own timer.
- Maestro `browse.yaml` uses the seeded members 0104 (approved handle), 0102 (pending) and 0103 (rejected). It is written for CI and
  has not run on a device. The visual capture story moved from `screens-home--placeholder` to `screens-home--loaded`.

## 2026-10-28: Expo patch pins follow the SDK, Metro resolves the contract's `.js` imports

`mobile-health` failed on PR 15 because Expo published new SDK 58 patches the same day, and
`expo install --check` compares against what Expo expects now. Thirteen modules in
`apps/mobile/package.json` moved to the expected patch, still pinned exactly, with the 14-day rule
waived as for the scaffold. `expo` and `jest-expo` stay excluded.

`build-android` and `build-ios` failed because Metro could not resolve `./category.js` from
`packages/contract/events.ts`. The contract imports its siblings with a `.js` suffix, which tsc and
Bun map to the `.ts` file and Metro does not. `apps/mobile/metro.config.js` now retries a relative
`.js` import from inside `packages/contract` without the suffix. Everything else resolves as before.

Why. A patch release inside the SDK is what Expo tests against, and holding the old pin leaves CI
red until Renovate's 14-day window passes. The resolver keeps the contract valid ESM for the server
without a build step for the app.

The module patches also need the matching native core. With `expo` held at 58.0.11, iOS crashed at
launch on a missing `ExpoModulesJSI` symbol, so `expo` moved to 58.0.21 too and left
`expo.install.exclude`, so `expo install --check` now flags `expo` when it falls behind its modules.
Only `jest-expo` stays excluded. The onboarding flow now matches the step count as the end of the
card's label (`.*1 of 3`), because Maestro compares `assertVisible` text with the whole label.
