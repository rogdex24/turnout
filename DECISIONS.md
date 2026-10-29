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
  targets. `device-run.sh` runs the flows once, with no re-run inside the job (see the entry of
  2026-10-29 on the device job re-run).
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

## 2026-10-28: M3 server, where the build differs from the plan or fills a gap

Context. The plan's section 4 M3 server tasks (S7 to S11, S15a, S19, S24) against the section 5
contract and the section 6 rules. Each item below is a choice the plan did not settle or a place
the build differs from it.

1. **Alerts that must fire once use `alert_sent`.** The handle alert, the no-cafe alerts and the
   other one-time operator alerts record a key in `alert_sent` with `INSERT OR IGNORE`, so a restart
   or a second ticker does not repeat them. Notices use their own unique `dedupe_key`.
2. **The `eligible_show` view holds no group rule.** It is `listable_event` with the operator's start
   time and the venue's point. `isEligible` runs over each row with the tunables and the clock, so the
   single 404 holds for a show past T-24h, free, not placed or unlisted. (Changed in the review round
   below; the first version baked the default tunables into the view.)
3. **A device is linked to the session that registered it.** `device.session_id` lets sign-out
   remove that device's token. `revokeAllSessions` deletes the member's devices, so a reuse of a
   refresh token also stops the pushes.
4. **A plan needs only a pending or approved handle.** A member with a pending handle can make a
   plan and send a ticket; the grouping pass skips anyone whose handle is not approved. A rejected
   or missing handle is `handle_required`.
5. **`plan_exists` carries `planId`,** so the app can open the plan it already has.
6. **`lock_lapsed` picks its reason from where the plan stopped.** A plan with no group at T-24h
   ends as `no_group`; the reason depends on the ticket and handle state at that moment, and the
   ticker writes the `no_group` notice once (`dedupe_key` `no_group:<plan>`).
7. **Never-pairs are stubbed until M4.** The grouping input has the field and the pass honors it; no
   code fills it yet.
8. **A ticket's `sha256` is of the original upload bytes,** with no re-encode, so the same file
   sent for two plans is flagged as a duplicate in the admin queue.
9. **A member who joins a group to refill it gets no notice to the existing members.** The size
   shown in the group response changes; nothing is pushed about it.
10. **A start-time change updates the plan and open-group snapshots** and is refused with 409
    `too_late` inside T-24h and `group_locked` once a group has locked.
11. **A withdrawn or called-off plan sets `group_id` to null,** so the plan stops pointing at a
    group the member can no longer see. The `group_member` row keeps `left_at`.
12. **The tick runs in a fixed order** (withdraw members who are gone, lock groups, lapse plans at
    T-24h, grouping per show, reveal, head-over notices, finish shows, operator alerts) and the lease
    is released after each pass (`finishLease`), not held across the 30 s gap, so a second process
    can take over.
13. **The pending-handle queue sorts by the earliest lock,** then by submit time.
14. **Test tickets are built in code,** not read from a binary fixture file.
15. **A member photo key is shared across groups.** The key is the profile's, so the same photo
    link serves every group the member is in; links are still signed and short lived.
16. **A ticket retry is idempotent.** Sending the same bytes again for a plan that already holds
    that file answers 200 with the same ticket instead of a duplicate row.
17. **`PUSH_SENDER` and `EXPO_ACCESS_TOKEN`.** `fake` or `expo`; production always uses `expo` and
    refuses `fake`. The token is optional. Push goes after the commit that made the notice.
18. **Housekeeping runs on each ticker pass** and each sweep is cheap and idempotent: expired OTP
    rows, sessions, rate buckets, `push_delivery` and notices past retention, `alert_sent` and
    `operator_action` past their windows. Ticket files due for deletion (T+24h) are dropped from the
    store by the ticker, and the row keeps no key or hash. The orphan sweep now covers `tickets/` as well as
    `photos/`.
19. **`POST /__test/clock` takes an optional `tick`,** so a staging test can move time and run the
    passes in one call.
20. **`ErrorExtra`.** `app-api/errors.ts` lets an error body carry one extra field the app needs
    next to `code` and `message` (for example `planId` on `plan_exists`).
21. **`POST /plans` answers 201** and `GET /shows/:publicId` returns only a live plan in `plan`.
22. **`/health` probes a write and reports the ticker's age,** so a stuck ticker is visible to the
    uptime check without a separate route.
23. **The app files route never serves `tickets/`.** A ticket file is for the operator only; the
    key is a 404 there whatever the signature.
24. **The admin opens ticket files and handle photos through its own signed routes.** The admin
    cannot import `app-api` (dependency rules), so `src/admin/files.ts` signs and checks 5 minute
    links with the same `FILE_LINK_SECRET` and opens the same store (`OBJECT_STORE`, `FILES_DIR` or
    `S3_*`). A signed GET skips the bearer token but keeps the loopback Host check. Images are inline;
    everything else is an attachment, with `nosniff` and a sandbox policy. With the secret unset or
    `memory`, no link is made and the queues still work. The handle photo link opens only a pending
    handle's photo.
25. **The admin ticket and handle decisions use a two click confirm,** and a reject needs one of the
    fixed reasons from the contract. A decision on something already decided, or past T-24h, shows
    the server's 409 message.
26. **Admin writes for tickets, handles, start times and cafes all go through `operator.ts`.** The
    `operator_action` row is written in the same transaction. `AGENTS.md` now says "from M3" where
    it said "from M4".

Evidence. `test/socialPlans.test.ts`, `test/socialTick.test.ts`, `test/appPlans.test.ts`,
`test/appTickets.test.ts`, `test/appGroups.test.ts`, `test/appNotices.test.ts`,
`test/appPush.test.ts`, `test/appTicker.test.ts`, `test/appHousekeeping.test.ts`,
`test/adminSocial.test.ts`, `test/appAuthz.test.ts`.

Why. Each fills a gap the plan left, or applies a layering rule (item 24) that the plan did not
foresee. None adds a package or a paid service.

## 2026-10-28: M3 server, review round for PR 13

Decision. A security review and a logic review of the M3 server each rated it medium risk. Each item
below is fixed with a test.

1. **Grouping looks at genders when it picks sizes.** It chose sizes first, so nine women and three
   men placed six people instead of twelve. New groups now try every split of the waiting people into
   groups of 4 to 6, largest total first, and keep the first split the caps allow. A property test
   compares the placed count with a brute force search on mixed pools of up to 14.
2. **Admin writes refuse another site.** The approve routes read no body, so a cross-site form POST to
   the loopback panel passed. Without a token, every write needs a same-origin `Origin` or
   `Sec-Fetch-Site`.
3. **A signed admin file link passes in token mode,** and the admin and app links sign different
   text, so one kind of link cannot be made from the other.
4. **The reveal closes** `revealCloseHours` (24) after the start; the group route then answers the
   single 404. `meetMinutesBefore` and `threadCloseHoursAfterStart` are tunables too.
5. **Name, gender and photo are locked while the member is in a group** (409 `profile_locked`, as for
   the handle), so the women-only rule and the photo review cannot be undone after placement.
6. **Ticket uploads count attempts first.** `rate.ticketAttemptPerMemberHour` (60) is taken before the
   body is read. The per-plan and per-day limits stay, so a retry of the same file is still free.
7. **Notices are claimed before they are pushed,** so two passes cannot push one notice twice.
8. **An operator alert is recorded as sent only after it went out,** and the handle alert is keyed by
   show, so a failed send is retried and two shows do not share one alert.
9. **`eligible_show` holds no group rule** (item 2 of the entry above).
10. **`createPlan` and `addTicket` take the write lock first** (an immediate transaction). Two requests
    for one show line up, and the one that loses answers `plan_exists` with the winner's `planId`.
11. **`/health` checks the write lock at most every 5 seconds,** and device registration is limited to
    20 an hour per member (`rate.deviceRegisterPerMemberHour`).

Evidence. `test/grouping.test.ts`, `test/groupingOptimal.test.ts`, `test/adminServer.test.ts`,
`test/adminSocial.test.ts`, `test/appGroups.test.ts`, `test/schedule.test.ts`, `test/appProfile.test.ts`,
`test/socialPlans.test.ts`, `test/socialPush.test.ts`, `test/socialTick.test.ts`,
`test/appTicker.test.ts`, `test/appNotices.test.ts`, `test/eligibleShow.test.ts`.

Why. Each is the narrower or safer behaviour the reviews asked for. None adds a package or a paid
service.

## 2026-10-28: M4 server, where the build differs from the plan or fills a gap

Context. The plan's section 4 M4 server tasks (S13, S14, S15 reports, bans and accounts, S17, S18, S19
complete, S25) against the section 5 contract and the section 6 rules. Each item below is a choice the
plan did not settle or a place the build differs from it.

Thread and feedback

1. **The never-pairs input is the `downvote` and `report` tables.** `neverPairsAmong` reads both, so a
   downvote or a report between two people keeps them out of one group. The M3 stub is gone.
2. **`revealClosesAt` is the feedback close, and `revealCloseHours` is removed.** The feedback window
   closes 72 hours after the morning after, and the group route's single 404 starts then, so the
   reveal and the feedback end together. Feedback gives 409 `outside_window` both before it opens and
   after it closes.
3. **The feedback close is tracked per group** in `feedback_close` and runs as its own ticker step, so
   met edges and the stop rule run once and a restart does not repeat them.
4. **The stop rule counts downvotes since the last operator reinstate,** and needs at least 3 distinct
   voters and 3 distinct shows. A stopped member keeps their account and sign-in, gets a `downvote_stop`
   ban row, has plans withdrawn and cannot plan again.
5. **Met edges include every checked-in member of the group,** whether or not they left it later. One
   downvote in a group means no edges for anyone there.
6. **`GET /me/blocked` returns `{blocked:[...]}`** with first name, show and date only.
7. **A retried `clientId` returns 200 and skips the rate limit,** for messages and for reports.
8. **Thread notices are throttled:** one per plan every 5 minutes, and only to a member who has been
   away for 10 minutes. A notice holds no message text and no name.
9. **Messages are deleted 30 days after the show,** unless a report on that group is still open.
10. **`messageListQuerySchema` is strict,** like every other query schema.

Reports, suspension and bans

11. **A report suspends the subject in one step** (status `suspended`, sessions revoked) and records
    the status they had before. A subject an operator already suspended records `suspended`, and a
    dismissal leaves that alone.
12. **A dismissal reinstates only if no other report about the subject is open.** After an upheld close,
    other open reports about the same person stay open for the operator to close.
13. **An operator reinstate is refused while any report is open.** Reinstating a stopped member removes
    the `downvote_stop` row and writes `member_reinstate`. A suspended member whose number is still
    listed as a stop goes back to stopped.
14. **Upheld means ban and erase.** The number is hashed into `ban_list` with `report_upheld`, and
    `eraseMember(..., 'ban')` nulls the phone and returns the file keys. On an already deleted subject
    the ban and erase are skipped.
15. **A report on a done group sets `left_at` on the subject's membership** and sends no loss notice.
16. **The woman-about-man contact rule is enforced in `closeReport`.** It throws `contact_required`
    until `contacted_reporter_at` is set; the admin answers 409 and tells the operator to contact first.
17. **Report alerts use their own keys:** `report_new:<id>`, `report_due_soon:<id>` and
    `report_overdue:<id>:<hour>`. The alert kind equals the key, so the notifier's once an hour per
    kind throttle does not swallow a different report's alert or the next hour's overdue alert, and the
    overdue alert reports the current hour only.
18. **Report rows are purged 1 year after they close.**
19. **The close note is stored on the report row only,** never in `operator_action`. The action holds
    the outcome and nothing else.
20. **`liftBan` writes an action with subject type `ban` and id `ban_list`,** and no number or hash.
21. **`operator_action` rows about a deleted member keep the tombstone id for 1 year.**

Deletion, location and auth

22. **A delete code shares the sign-in limits** and uses the same WhatsApp authentication template.
    It is refused with the generic `sign_in_unavailable` only for a number blocked by "I did not
    request this code" (`isPhoneBlocked`); it does not read the ban list, because a banned member's
    account is erased and has no session to ask with. A sign-in challenge cannot confirm a deletion
    (403 new error code `forbidden`); another member's is a 400.
23. **A self-deletion never writes the ban list.** Only a ban, an upheld report or a stop does.
24. **Files are deleted after the commit,** and the nightly `sweepFiles` retries any that failed.
25. **`requireMember` order:** token valid, session belongs to the member, banned or deleted gives 401,
    suspended gives 403 `account_suspended`, then a revoked session gives 401. A report revokes the
    suspended member's sessions, so the suspended check has to come before the revoked one (this
    reordered `auth.ts`).
26. **A suspended member can erase their own account, for as long as their access token lasts.**
    `DELETE /me` and `POST /me/delete-code` set `allowSuspended` on the route: `requireMember` lets a
    suspended member through and ignores the session the suspension revoked. Every other route is
    still 403. Their open report rows stay (`eraseMember` keeps reports). The window is the 15-minute
    access token: `/auth/otp/verify` still answers a suspended member 403, so once the token has
    expired they cannot sign in to delete. Put that remaining gap in front of whoever reviews the
    DPDP erasure duty; see `docs/plans/mobile-accounts.md`.

Admin

27. **The admin needs `BAN_PEPPER`** (the app's value) on its process. Without it the ban, lift,
    reinstate and close routes answer 503 and change nothing. It uses `DEFAULT_TUNABLES`.
28. **The admin deletes an erased account's files** through its own `AdminFiles` store. If the store is
    not configured the keys are left to the app's nightly sweep.
29. **The report queue and the account page show the member's phone number.** The operator has to contact
    the reporter, and the data map already lists the operator as a reader of `member.phone_e164`.
    No other screen shows one.
30. **"Failed notices" means** a push state of `stale`, `no_device` or `not_sent`, or a delivery
    that was refused. The list shows kind, state and error codes, with no text and no name.
31. **The admin lift accepts E.164 or an Indian mobile in the common formats** (spaces, dashes, 0 or 91
    in front) and answers 404 for a number that is not listed.

Evidence. `test/appThread.test.ts`, `test/feedback.test.ts`, `test/reports.test.ts`,
`test/deletion.test.ts`, `test/bans.test.ts`, `test/adminAccounts.test.ts`, `test/appAuthz.test.ts`,
`test/appTicker.test.ts`, `test/contract.test.ts`.

Why. Each is the narrower or safer behaviour. None adds a package or a paid service. Items 26 and 27 need
the owner (legal review and a secret on the admin host), so they are recorded as owner steps.

## 2026-10-28: M4 server, review round

Decision. A security review and a logic review of the M4 server each found items. Each is fixed with a
test, except where noted. The numbers match the review.

1. **The admin's `BAN_PEPPER` is checked against a fingerprint the app writes at start.** This was
   committed by another party (`2b09ce5`), not in this round.
2. **A suspended member can request a delete code and erase their own account** while their access
   token lasts (item 26 above). The gap that stays: `/auth/otp/verify` still answers a suspended member
   403, so after the 15-minute token they cannot sign in to delete. It is an owner question in
   `docs/plans/mobile-accounts.md`, not closed here.
3. **Closing a report skips the contact rule when the reporter has deleted their account.** There is
   nobody to phone, so the rule would block the close for good. The admin shows "reporter deleted their
   account" in place of the contact step.
4. **"I did not request this code" for a delete code revokes the member's sessions,** as well as
   blocking the number, because someone else holding a session may have asked for it.
5. **A delete code is refused at `/auth/otp/verify`** (400 `invalid_code`), now with a test.
6. **Item 22 of the entry above says what it does:** a delete code is refused only for a number blocked
   by "I did not request this code", and it does not read the ban list.
7. **The `isPhoneBanned` comment** now says what it reads, and **8. the `AdminContext.write` comment**
   says which writes it covers. Both are comment changes only.
9. **A never-pair no longer keeps a group from forming.** `newGroups` searches in approval order for
   another set of people when the first cannot be placed, instead of giving up on that size. The whole
   call is capped at 60,000 steps (`SEARCH_STEPS`). Past the cap it forms no groups on that tick, and the
   people stay waiting for the next one. The review's idea of skipping the later approver would not find
   some placeable sets, so this is a backtracking search, not a skip.
10. **The stop rule also runs for suspended members, and the reinstate baseline is on the member row.**
    `member.stop_baseline_at` is set by an operator reinstate and cleared by erasure. The rule counts
    downvotes after it. The baseline used to be read from the `member_reinstate` action, which the
    one-year purge of `operator_action` deletes; keeping it on the member leaves that retention alone,
    and an old reinstate no longer lets downvotes from before it count again. A dismissal restores
    `stopped` when the number is still stop-listed.
11. **A thread message gets an id above the group's newest.** The id was `ulid(now)` with `now` read before
    the body arrived, so a slow post could be stored behind a cursor a reader already held, and the reader
    skipped it. `postMessage` now takes `ulidAfter(newest id in the group, now)` inside its immediate
    transaction. The cursor is still the id, so the contract is unchanged.
12. **`notice(plan_id, kind, created_at)` has an index,** so the thread notice throttle looks up a plan's
    recent notices instead of scanning the table. A test reads the query plan.

Owner questions, unchanged by this round:

- The stop rule counts distinct voters and distinct shows separately (at least 3 of each). Whether
  that is the intended reading of "3 people, 3 shows" is for the owner to say.
- A report's never-pair is read from the report row, so it ends when the one-year report purge deletes
  the row (item 18 above). Whether it should last longer is for the owner to say.
- Deleting an account deletes the downvotes the member gave or got. If that happens before the feedback
  close, those downvotes never reach the stop rule or the met-edge check. Whether the mark should
  survive until the close is for the owner to say.

Evidence. `test/deletion.test.ts`, `test/appAuthz.test.ts`, `test/reports.test.ts`,
`test/whatsappWebhook.test.ts`, `test/neverPairs.test.ts`, `test/feedback.test.ts`,
`test/appThread.test.ts`, `test/ulid.test.ts`.

Why. Each is the narrower or safer behaviour the reviews asked for. None adds a package or a paid
service.

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

`expo-modules-jsi` 58.0.21 does not compile under Xcode 26.2 (Swift 6.2): `withEncodedValue` in
`JavaScriptObject.swift` captures a `nonisolated(unsafe) let` in an isolated closure, and the compiler
reports "sending 'slot' risks causing data races". The package's own `UncheckedSendable` comment
says to wrap such a capture, so `patches/expo-modules-jsi@58.0.21.patch` (a `bun patch`) wraps the
slot and changes nothing else. Drop the patch when a newer `expo-modules-jsi` compiles; the pin in the
patch name makes `bun install` fail loudly if the version moves under it.

## 2026-10-28: M2 app, A8 to A10

- A8 Show screen. The Go button is built, but the go route is M3, so `EXPO_PUBLIC_GROUPS_ENABLED` (read by `groupsEnabled()` in
  `src/api/features.ts`) decides what it does. Off, which is the default, Go opens a Coming soon sheet. The show shows no "looking"
  count while the server sends none: `lookingCount` is null and the line is hidden, not set to zero. `lookingLine` lives in
  `screens/show`, not in `model`, because it builds copy, and it uses `groupIndian` from `model/showTime` (now exported). How it
  works uses generic copy that holds for every show. The Buy button's icon sits after the label. The marquee bulbs are static, so
  nothing runs under Reduce Motion.
- A9 Sentry and PostHog. Consent is off by default, stored as the `analyticsConsent` pref ("1" or absent), and there is no switch for
  it yet: "Share usage data" is built with Settings. Nothing is built, loaded or sent before consent, and without a build key
  (`EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`) the whole module does nothing. Both SDKs are
  loaded with `require` after consent, so a build without consent never runs their code. Turning consent off calls PostHog `optOut`
  and closes Sentry.
- PostHog uses memory persistence, so its id is new on each launch and nothing about a device is kept. Session replay,
  autocapture of screens and geo lookup are off. Events go through a registry (`analytics/events.ts`): five events with fixed keys,
  strings scrubbed, and any call with a location, handle or person key (lat, area, city, handle, phone, email, name and the like,
  also inside nested objects) is dropped whole. Sentry gets no user, no request body or headers, no replay, no screenshot, no
  traces, and every message, breadcrumb and `extra` value is scrubbed of URLs (query, fragment and long token segments), emails,
  Bearer tokens and phone numbers.
- Telemetry starts after a frame and a zero timeout, not `InteractionManager`, which this React Native version no longer has.
- A10 App links. The https host is a build variable, `APP_LINKS_HOST` (`go.<domain>`), because the domain is not decided. It is set
  for the production variant only: `assetlinks.json` names the production package, so development, e2e and preview builds never
  claim the host. With it unset there is no intent filter and links work through the custom scheme only, which is what the Maestro
  flow uses. There is no iOS `associatedDomains` (the plan says so, citing Apple TN3155), so the AASA route is a stub: a 404 until `APP_LINKS_IOS_APP_IDS` is set.
- Every link goes through `redirectSystemPath` (`src/api/nativeIntent.ts`, re-exported by `src/app/+native-intent.tsx` because
  dependency-cruiser allows nothing to import a route). The list is short: a show (`/e/<id>` on the host, `show/<id>` or `e/<id>` on
  the scheme), its `/go`, Home, and, in the app's own scheme only, Storybook with a plain story id (the visual capture flow needs
  it) and the dev client launcher in a development build. Anything else opens Home. `/go` opens the show while groups are off. A path
  the router already holds (`/show/<id>`) is accepted too and gets the same checks, because the router test harness and some
  platforms hand paths back through the same function.
- The Android filter uses `pathPrefix: "/e/"`, so a `.ics` link on the go host also opens the app, and the app sends it Home. The
  filter cannot express "no suffix", and the website serves the file when the app is not installed.
- `assetlinks.json` is served only when both `APP_LINKS_ANDROID_PACKAGE` and one fingerprint are set, and is a 404 otherwise. A
  fingerprint is normalised to upper-case colon form, and an entry that is not a SHA-256 is dropped without failing the start, so
  one typo does not hide the others. The one change in `src/cli.ts` reads the env and passes it to `siteResponse`.
- `adb shell pm get-app-links` cannot be checked here: it needs the DNS host and the Play signing key. That step is listed in
  `docs/plans/mobile-accounts.md` as needs owner.
- Review round. A console breadcrumb keeps only its `logger`: what the app logged never goes to Sentry, even scrubbed. The
  scrubber now walks nested arrays and objects in breadcrumb data and `extra`. `serve` warns when an `APP_LINKS_*` value is set
  but dropped, and an iOS app id needs a 10-character team id. The Show screen's price and step numerals use the
  `display-numeral` face through `displayFaceStyle`, not raw sizes. `EXPO_PUBLIC_GROUPS_ENABLED` stays off until the A11 go route.

## 2026-10-28: second run of the mobile device jobs

- Android. Uniwind 1.12.2 styles react-native's own components only. `className` on the safe-area-context `SafeAreaView` was
  dropped without an error, so the notice screen lost `flex-1`, its ScrollView collapsed and Maestro saw only the button.
  `src/ui/primitives/SafeAreaView.tsx` wraps it once with `withUniwind`, as the Uniwind docs show, and a Biome
  `noRestrictedImports` override in `apps/mobile/src` refuses the bare import.
- iOS. The simulator build was unsigned (`CODE_SIGNING_ALLOWED=NO`), so the binary had no `application-identifier`
  entitlement, the simulator keychain answered expo-secure-store with -34018 and the app opened on the start-failed screen.
  `ci/build-ios.sh` now signs to run locally (`CODE_SIGN_IDENTITY=-`, no team) and logs the entitlements. The native cache key
  gains `signed` so the unsigned cached build is not repacked again.

## 2026-10-28: M3 app (A11, A12, A13, A29), where the build differs from the plan or fills a gap

No package was added. The server API and the contract schemas are used as they are.

Plan page and Plans tab (A13)

1. **No member name, photo or cafe is drawn on the plan page at any time.** The page shows counts and times from `groupFacts`
   (the others in the group, the reveal time, the size). Names live on the meet card (A15). `PlanScreen.test.tsx` checks that no
   member name is on the page before T-3h, and `loop-group.yaml` checks it on a device.
2. **"No group yet" uses the show's `lookingCount`.** The contract has no `waitingCount`, so the finding card reads `lookingCount`
   from GET /shows/:publicId and leaves the number out when it is unknown.
3. **The reveal numeral is the others in the group** (`othersCount(size)`), with "plus you" after it. The size-3 note comes from
   `belowPlan` and is hidden when `belowPlan` is null. The reveal time falls back to `revealFor(show.startsAt)` before the group
   query answers.
4. **The "How matching works" row is left out** because its destination does not exist yet. The Group chat row and the Ticket row
   are information only; the thread is A19's.
5. **The thumb and the Home bar use the category "other"**, since a plan carries no category.
6. **Open meet card pushes `/groups/[groupId]/meet`**, A15's route. The plan page reads the meet card's group query from
   `api/groups.ts` (the merge kept that one). Both `plans` and `group` are on disk, so offline the page shows the last group.
7. **Cancel is a transparent modal with the Sheet inside**, like Go. A 409 `plan_closed` refetches the plan and closes the sheet.
8. **The "group confirmed" moment is played once per plan**, tracked in prefs (`confirmedPlayed`).
9. **The Plans tab badge counts plans that need the person** (add a ticket, send another ticket, open the meet card). The Home
   bar prefers such a plan over one that is only waiting. `GET /plans` feeds the bar.

Go, ticket and handle (A11, A12, A29)

10. **The Go sheet is a transparent modal route** (`show/[publicId]/go.tsx`) with the Sheet inside, so the show stays behind the
    scrim. `Sheet` actions gained `loading` and `testID`. "Go explained" and "ticket asked" are prefs, so the first-time line and
    the notification ask show once.
11. **The ticket page has a Send step after picking**, so a person sees the screenshot before it goes. A PDF is allowed through
    the document picker only for `screenshot_or_pdf` (what the server accepts); BookMyShow is a screenshot. The reject-reason copy is
    original.
12. **The notification pre-ask only asks for permission.** Registering the token is A14's.
13. **The handle strip is announced on iOS only** (`AccessibilityInfo.announceForAccessibility`); Android reads the live region.
    `Field` gained an `inputRef` prop so Change handle can focus the field. Settings, Instagram or LinkedIn is Board B4.1.
14. **`router.test.tsx` scripts `GET /plans` by default**, because Home now reads it for the bar.

Maestro and the e2e server

15. **The seven flows (`loop-join`, `ticket-rejected`, `loop-group`, `loop-no-group`, `group-shrinks`, `cancel`, `profile-check`)
    have not run on a device.** No emulator or simulator is available where they were written, so they are checked only for valid
    YAML, for the ids and words in the app's own tests, and for the server calls they make (below).
16. **An operator sidecar, `e2e/mobile-operator.ts`, starts with `e2e/mobile-server.ts`** on the port after it. A flow cannot open
    the admin app or sign in as the other members of a show, so the sidecar answers handles and tickets, sends a ticket for a member,
    fills a show with members who have accepted tickets (then runs one grouping pass, since the server runs with `--no-ticker`),
    and makes a member leave. It uses the server's own functions, the same `x-staging-test-token`, and the server's clock.
    `test/mobileServer.test.ts` drives it against a real server: ticket sent, turned down, accepted, a group of four, the clock
    moved past T-24h, and a leaver after the lock leaving three.
17. **Ticket upload through the system picker is not covered by Maestro.** The sidecar sends the ticket; the upload path is
    covered by the component tests.
18. **The e2e build turns groups on** (`EXPO_PUBLIC_GROUPS_ENABLED=1` in `ci/env.sh` and the `e2e` profile). `browse.yaml` now
    opens the Go sheet and closes it with Not now where it used to expect Coming soon.
19. **The plan flows wait up to 80 seconds** for a change the operator made, because the plan page and Home ask once a minute.
    The last two flows move the server's clock, so `config.yaml` runs them last.

Why. Each keeps what the plan promises (no names before T-3h, no guilt copy, no step that is not needed) and fills the gaps the
contract and the server left, without a new package or a paid service.

## 2026-10-28: M3 app, A14 to A16 (push, meet card, web link)

Where the build differs from the plan or fills a gap.

1. **The push routing hook is in `src/providers`,** not `src/app`, because `routes-are-entry` forbids route files from holding logic. The route files stay thin.
2. **An e2e-only link, `turnout-e2e://push?kind=..&noticeId=..&planId=..`,** stands in for a tap on a push, because a real push needs a Play-signed build and a Firebase key. The link filter lets it through in the e2e variant only; any other build goes Home.
3. **The thread kind opens the plan** (Home when there is no plan); the thread screen is M4. The meet card kinds open `/groups/<groupId>/meet`. The morning-after kind now opens `/groups/<groupId>/after` (A20, below), and the plan when the notice names no group.
4. **The push permission is asked only after the person has a plan.** A12 can call `registerDevice` with `mayAsk` when it lands.
5. **iOS skips registration** (GET /config says push is off) and `enableRemoteNotifications` is false for iOS in `app.config.ts`.
6. **No notification icon asset is in the repo.** The owner adds a 96x96 white-on-transparent icon.
7. **The persisted query prefixes include `["group"]`,** so the meet card opens offline with the last cafe and members.
8. **The venue pin comes from the show, not the group.** GET /groups/:id has the cafe's pin but not the venue's, so the card finds the plan that holds the group in GET /plans, then reads the public show for the venue. That is kept on disk as `["group", id, "context"]` and also supplies the plan id for Leave. Suggested for the server: add the venue's `lat` and `lng` to the revealed group answer, which removes two requests.
9. **The phone's clock decides** when "I'm here" is on (T-90m to T+60m) and when the location watch runs. The server clock test hook does not move the phone, so `loop-meet.yaml` says the phone's clock has to be aligned.
10. **The check-in is retried only after a bad connection or a busy server.** A refusal (409 outside the window) does not change on a second try, so `registerReplayable` takes a retry rule and the check-in passes `retryTransient`.
11. **No cafe photo,** because the API has none. The Report and group chat cards of the design are left out: they are M4.
12. **The static map is not to scale.** It is two token-coloured pins on a plain card, for builds with no map. `showsRealMap`: the e2e variant never has the map; iOS draws Apple Maps and needs no key; Android needs `GOOGLE_MAPS_ANDROID_API_KEY` (`extra.hasMapsKey` is true when it is set).
13. **Safety has two rows:** Call 112 and Leave this plan. Leave opens `/plans/<planId>/cancel`, which `app-m3-plans` builds.
14. **A16: the website reads `APP_LINKS_HOST` and `PLAY_STORE_URL`.** With no host there is no "Go with a group" link. Until the Play URL is set the fallback page shows "The app is in testing on Android" with a contact link, and the Play badge is a text button. `/e/<id>/go` is served by the site itself. `SiteOptions.supportEmail` feeds "Contact us".
15. **`router.test.tsx` scripts GET /config and GET /plans by default,** because the signed-in layout now reads both.
16. **`loop-meet.yaml` is tagged `needs-group-seed` and excluded in `config.yaml`,** because the seed has no plan and group rows for the `meet_card_live` member yet. Neither Maestro flow has run on a device.

Evidence. `src/model/walk.test.ts`, `meetWindow.test.ts`, `meetCard.test.ts`, `src/api/groups.test.ts`, `notifications.test.ts`, `src/providers/useMeetLocation.test.tsx`, `useNotificationRouting.test.tsx`, `src/screens/meet/*.test.tsx`, `test/appLinks.test.ts`, and the Playwright cases in `e2e/`.

## 2026-10-29: M4 app, A19 and A21 (group chat, report)

Where the build differs from the plan or fills a gap.

1. **The chat is kept on disk as its newest 50 messages,** with an `incomplete` flag. A phone that reopens from disk shows them at once and then loads the whole thread, because the cursor (the last message id) cannot be trusted to continue a trimmed list.
2. **The cursor is the last message id.** The screen polls every 5 seconds only while it is focused, the thread is open, and the server has not answered 404. It stops on a read-only thread and when the app is in the background: TanStack's `focusManager` follows `AppState` (`useAppFocus`, called once in `AppProviders`), because the library's own focus signal is the browser's and never fires in React Native.
3. **A person's own messages that have not arrived come from the mutation cache,** through `useMutationState`, not from a second list. Sending, queued (paused offline) and failed show under the line. The list is de-duplicated by `clientId`, and a sent message hides the earlier failed tries of the same one.
4. **A send waits for the thread to reload instead of writing the POST result into it.** One path writes to the cache, so a poll that lands in between cannot show a message twice or out of order. The person's own entry (sending, queued or failed) is also left out of the list as soon as the list holds a message from the person (`isYou`) with the same text and a `createdAt` at or after the moment the send began (`sentAt`). That covers the gap between the thread being read and the send being marked done, and a send whose answer was lost, so a message is never drawn twice. The same words sent twice still show twice, because the older stored copy is before `sentAt`. The contract is unchanged: the match is on text and time, not on `clientId`, which the list does not carry.
5. **Report on a message opens a bottom sheet,** not the design's inline menu, so the target is large and works the same on both platforms.
6. **`no_group` is learned from the server's 404 on the messages, and only from that.** A `no_group` plan has no group, so the app cannot tell from the plans list that a group was called off. A messages 404 with nothing held means the chat has closed; a messages 404 with messages held keeps them readable and read-only. A 404 on the group does not close the chat: the group gives the title and the photos only, so with no group the screen still reads the messages, shows a plain title ("Group chat") and no photos, and lets the server's answer decide. The screen reads no plans for this.
7. **No auto-linking.** A message is a plain `Text` with no data detectors, so an address in it is not tappable.
8. **A report's text is the reason's label, then the details.** The body is `reportBody(reason, details)`, with the details capped at 1800 characters so the whole stays inside the contract's limit.
9. **A report's `messageId` goes only with the person it came from.** If the person picks someone else on the form, the message is left out.
10. **`useBlockCapture` takes no arguments and is called in the route file, once per screen.** Each call makes its own key (`useId`) for `preventScreenCaptureAsync` and `allowScreenCaptureAsync`, because the library keeps capture blocked until every key has been allowed. A single shared key would let the first screen to close (the report form, pushed over the after screen) allow capture under a screen that is still showing faces. The thread, after and report routes all call it. It does nothing when `EXPO_PUBLIC_ALLOW_CAPTURE` is 1 (the e2e build). `useHoldThreadPushes` takes `null` for a route with no group.
11. **`thread_message` now opens the chat** (`/groups/<groupId>/thread`). `morning_after` opens the after screen (`/groups/<groupId>/after`, A20 item 9), and the plan when the notice names no group.
12. **The meet card has a Group chat row, and the Safety sheet has Report someone** after Call 112 and before Leave this plan.
13. **The composer and the report form check the contract before they send.** `postMessageRequestSchema` and `createReportRequestSchema` run on the phone first. A message or report they refuse (HTML in a message, text past `MESSAGE_MAX_CHARS` or `REPORT_MAX_CHARS`, which a paste can still bring past a field's `maxLength`) is not sent and not saved to be replayed. The words stay in the box and a line under it says why. The box's own limit comes from the contract (`MESSAGE_MAX_CHARS`, and `DETAILS_MAX_CHARS`, which is `REPORT_MAX_CHARS` less room for the reason's label), not a number typed again in the view. The message page size (`MESSAGE_PAGE`) is exported from the contract the same way, and the route and the app both import it.
14. **A 4xx on a send is final.** A refusal other than "sign in again" and "slow down" (403, 404, 422: the chat closed, the person is not in it, the text was refused) will get the same answer again, so the entry says "Couldn't send this message." and cannot be tapped to send again. A 5xx, an offline phone and a 429 stay "Didn't send. Tap to try again.".
15. **A report that is paused offline is kept on disk with its body,** so it can be sent when the phone is back online, even after a restart. This is a deliberate choice: the report is the one thing the person must not lose, and the body is what they wrote to the team, not a face or a name. It is removed from the queue when it is sent, and sign-out and account deletion clear it with the rest of the cache (A22 item 1).
16. **The operator sidecar has a `say` route,** so a flow can make another member of a group write. `thread.yaml` and `report.yaml` are tagged `needs-group-seed` like `loop-meet.yaml` and have not run on a device.

Evidence. `src/model/thread.test.ts`, `report.test.ts`, `src/api/persister.test.ts`, `src/screens/thread/ThreadScreen.test.tsx`, `src/screens/report/ReportScreen.test.tsx`, `src/screens/meet/*.test.tsx`, `src/ui/useBlockCapture.test.tsx`, `src/providers/useAppFocus.test.tsx`, `test/mobileServer.test.ts` (the `say` route).

## 2026-10-29: M4 app, A20 (after the show)

Where the build differs from the plan or fills a gap.

1. **The after screen has its own query key, `["after", groupId]`, and it is not on disk.** It holds faces, so it is left out of `PERSISTED_PREFIXES`, is read again after five minutes (`staleTime`) and is dropped from memory five minutes after the last screen using it has gone (`gcTime`, `AFTER_GC_MS`). The report form (A21) reads its people from this query too, not from the meet card's copy on disk, and keeps their photos out of the disk image cache with the same `memoryCacheKey`. The meet card's `["group", id]` stays on disk as before. A phone with no signal shows the error state, not old faces.
2. **Faces use the image cache in memory only.** `PersonAvatar` takes `memoryCacheKey`, which sets `cachePolicy="memory"` and a stable `cacheKey` of `<groupId>:<memberRef>`, so a renewed signed link does not load the photo again. There is no share, save or long-press on a face.
3. **The after screen uses the same `useBlockCapture` as the thread and report screens** (A19 item 10). The A20 branch had its own copy keyed `turnout-faces`; the merge kept one hook. Each screen that calls it gets its own key, so the report form pushed over the after screen and then closed does not let capture back on under the faces. The thread route calls it too.
4. **The server decides "not yet", the phone clock does not.** The screen shows its content only while `state` is `done`; before that it says the page opens the morning after. "Closed" is a 404 or `feedbackOpenUntil` passing (72 hours), the second by the phone clock, which only closes a page that the server would close a moment later.
5. **The person's own tile is left out.** Nobody is asked to mark themselves, and the server answers 404 for it.
6. **"I didn't feel comfortable" asks first (a Sheet), then posts to `/groups/:id/downvotes`.** It is a replayable mutation (`"feedback"`, already on the replay list), so a mark made offline is sent when the phone is back. The server answers 204 to a repeat, so a replay does no harm. The screen marks the person at once and puts it back on a failure. The copy says it is private and that the person is not told.
7. **The page says doing nothing is fine, first.** Nothing is sent and nobody is told unless the person acts. There is no count of marks and no guilt copy.
8. **Report is `router.push` to `/report` with `groupId` and `memberRef`.** It opens A21's report screen.
9. **Entries.** The plan page's dock gets "How did it go?" when the plan is done and has a group. The meet card, once the group is done, the card has closed and the latest read of the group succeeded, offers it in place of "Back to your plans". A copy the phone holds after a failed read may be stale, so it does not count. A `morning_after` push opens the after screen (`notificationRoute.ts`).
10. **The Maestro flow `after-show.yaml` runs last** (after `group-shrinks`) because it moves the server's clock to an hour past 10:00 IST the morning after, through a new operator route `POST /operator/after { eventId }`. The clock only goes forward. The flow has not run on a device.

Evidence. `src/ui/useBlockCapture.test.tsx`, `src/api/feedback.test.ts` (the five minutes), `src/screens/after/*.test.tsx`, `src/model/notificationRoute.test.ts`, `src/api/notifications.test.ts`, `src/screens/plan/PlanScreen.test.tsx`, `src/screens/meet/MeetScreen.test.tsx`, `src/ui/components.test.tsx`. The `after` operator route was called against `e2e/mobile-server.ts` and moved the clock to 11:00 IST on the morning after the seeded show.

## 2026-10-29: M4 app, A22 and A23 (settings, safety, deletion)

Where the build differs from the plan or fills a gap.

1. **One local wipe serves sign-out, a refused refresh and deletion** (`src/api/signOut.ts`). It stops telemetry, clears the query cache, the disk cache, MMKV, the image cache, the picked-file folders in the cache (`ImageManipulator`, `ImagePicker`, `DocumentPicker`, which hold the person's photo and ticket copies), and the delivered notifications and the badge, and runs through `session.onSignedOut`. Every step runs even when an earlier one fails, and the first failure is thrown at the end. The screens delete a prepared file as soon as its upload succeeds. Ordinary sign-out keeps the welcome cards seen (the plan sends it to the notice screen); deletion clears them too, so the app starts at Welcome. `KeyValueStore.clearAll()` and `Session.endLocal()` exist for this: after `DELETE /me` every token is dead, so the session ends on the phone only and makes no sign-out call.
   Sign-out ends the session on the phone first (wipe, then the keychain, then `signed_out`, in a `finally` so a throwing step cannot keep the person signed in) and revokes on the server afterwards, in the background, with the token it captured. If that token is missing or within 30 seconds of expiry, it is refreshed first. Offline sign-out therefore still forgets everything; the server session then lapses on its own. A refresh that lands after the session ended is ignored.
2. **Delete account is one route with three steps** (explain, confirm, code), not three routes. Back steps back inside the route and leaves from the first step. "Keep my account" is on both later steps, worded as a neutral choice.
3. **The data map is mirrored in `src/copy/deleteAccount.ts`.** The phone hash is named once, as kept only if the account was banned, and the consent record and reports as kept for one year under a number that does not name the person.
4. **The group is told someone left** when a plan with a group is not over and the show is within 3 hours or already started (`groupWillBeTold`, the same window as the meet card). Before the reveal a withdrawal is quiet.
5. **The privacy page shows the notice the app carries** (`NOTICE_PARAGRAPHS`), not the `GET /config` copy, so it opens offline and cannot differ from what was agreed. The version is the one on the account.
6. **`how-matching-works.md` is mirrored in `src/content/howMatchingWorks.ts`,** because Metro does not bundle Markdown. `howMatchingWorks.test.ts` fails when the two drift.
7. **The women-only switch saves at once** with the whole profile (`PATCH /me/profile` needs all three fields), through the same `saveSteps` and `runSave` the profile form uses, so the cached member follows the server. It is offered when `womenOnlyAvailable` is true (woman or non-binary). A refused save keeps the old value and says why in one line.
8. **Grievance details count as "not set"** when the name or address says "not set", the email is on example.com, org or net, or the phone is in the +1 202 555 01xx range (`grievanceNotSet`), which are the server's dev and staging placeholders. Only the production variant fails the start-up check, and only on details that were read. A config that cannot be read (offline, a server error) never blocks start. Preview builds point at staging, which only has placeholders, so they show "Details not set" like development.
9. **"Share usage data"** turns PostHog and Sentry off at once through `telemetry(prefs).setConsent`, and reads the saved choice when the page opens. The wipe removes the choice.
10. **The blocked list is read only and in memory only** (`queryKeys.blocked()`, not persisted), because it holds first names.
11. **The "Safety and 112" page is not built.** It is not in the A22 file list. The meet card keeps its Call 112 row.
12. **Both Maestro flows are written for CI and have not run on a device.** `settings.yaml` uses Chitra and puts her women-only choice back; `delete-account.yaml` uses Hari, who no other flow signs in as.

Why. Each keeps what the plan promises (a way out that is plain, nothing kept that the data map does not name, no guilt copy) and fills the gaps the contract left without a new package.

Evidence. `src/api/signOut.test.ts`, `src/model/deletion.test.ts`, `src/model/grievance.test.ts`, `src/content/howMatchingWorks.test.ts`, `src/screens/settings/*.test.tsx`, `src/screens/you/YouScreen.test.tsx` and `src/router.test.tsx`.

## 2026-10-29: M5, A17 (analytics funnel)

1. **The four funnel events are sent from the screens, not the views.** `ShowScreen` sends `show_viewed` once the show has loaded (a 404 or an error is not a view), `buy_tapped` before the ticket page opens, and `go_tapped` on every Go tap with `groups_enabled`, so the funnel also counts taps on a build where groups are off. `MeetScreen` sends `im_here_tapped` with the plan id when the person taps I'm here.
2. **`ShowView` gets `onBuy` and `onGoTapped`.** The ticket link no longer goes through `onOpenLink`, so the screen can tell a Buy tap from the listing link.
3. **The PostHog check from one Maestro run is an owner step.** It needs a PostHog test project key in the e2e build (`EXPO_PUBLIC_POSTHOG_KEY`) and the person's consent on, and CI has neither. Until then the unit tests show that each event is sent with its properties.

## 2026-10-29: device job re-run, timeouts and react-native 0.88.1

- **No re-run inside a device job.** `device-run.sh` ran the flows a second time after a failure. The second pass met the
  data the first pass changed: the seed resets members but not plans or groups, so `browse` found 0102 no longer pending
  and failed for a reason the first pass did not have. A failed device job is now re-run whole, which starts a fresh server.
  The budget's "one automatic re-run only" is a cap, so zero re-runs keeps to it.
- **Job limits are 60 minutes on Android and 75 on iOS.** Android took 38 and 43 minutes of the old 45. The large iOS
  simulator reached 45 minutes before its flows ended.
- **react-native follows Expo's patch, 0.88.1.** `expo install --check` in mobile-health asked for it, as the entry of
  2026-10-28 on Expo pins says. `@react-native/jest-preset` moves with it.
- **iOS joins a row's name.** An element marked `accessible` with text children is one element on iOS, named for example
  "Instagram or LinkedIn, Checked". Flows match these rows with a regex (`".*Checked"`, `"Seed comedy night.*"`), and
  `test/maestroFlows.test.ts` refuses a bare "Seed ..." match.
- **The "Open in" prompt wait is 10 s.** On the large iOS simulator `deeplink-show` failed with no prompt seen in 5 s.
