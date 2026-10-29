# MASVS server-side controls

What the server does for each control the mobile security review (M5 S23) asks about, with the evidence for it: a test
file and test name, a code path, or a plain reason. A control that needs the production host or a vendor dashboard is
marked **owner step**. Nothing here was checked against production, because there is no production yet.

Test names are the strings after `test(`. Run one with `bun test <file> -t "<part of the name>"`.

## Controls

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Auth: every member route needs a valid access token, and the member is read again on each request | Done | `test/appAuthz.test.ts`: "a caller with no credentials gets the row's answer, and a member route never runs its handler", "a made-up, malformed or foreign-signed token is 401 on every member route", "an expired access token is 401 on every member route", "a suspended member is 403 account_suspended on every member route; a banned member is 401". `test/auth.test.ts`: "the access token is an ES256 JWT with sub and sid that lasts 15 minutes", "sign-out ends the session at once, even with a good access token", "requireMember checks the member every request: suspended 403, banned 401, stopped fine". The route table in `src/app-api/routes/index.ts` marks each route `auth: "member"` or `"none"`, and the first appAuthz test fails when a route has no row. |
| 2 | TLS only | Owner step | The app server speaks plain HTTP behind the reverse proxy (`deploy/Caddyfile`, written when the host is known; `docs/deploy.md` step list). The proxy terminates TLS and sets HSTS. The app side is covered: `apps/mobile/app.config.ts:100` allows cleartext Android traffic only in the `development` and `e2e` variants, and the preview and production variants have no default API URL (`apps/mobile/config/variants.ts`). Still to do on the host: HTTPS only, HSTS, no plain-HTTP listener on the public address, and an SSL Labs or `curl -I` check. |
| 3 | No PII in logs | Done in code, staging grep is an owner step | One log line per request holds `at`, `method`, `route` (the pattern, not the URL), `status`, `ms`, a short SHA-256 of the member id and an error class name (`LogEntry` in `src/app-api/context.ts`). `test/auth.test.ts`: "no log line, alert or error body holds a code, token, phone or secret". `test/appAudit.test.ts`: "at every point from before the reveal to after the thread is gone, no response or log line names another member by id, phone, handle or gender" (it reads every log line the run wrote). The ticker's failure line is the same shape (`logFailure` in `src/app-api/ticker.ts`). `test/noRealPhones.test.ts` keeps real numbers out of tracked files. The grep of real staging logs is an owner step below. |
| 4 | Signed links | Done | Photo links are HMAC signed with `FILE_LINK_SECRET` and last 5 minutes. `test/objectStore.test.ts`: "a changed key, a changed expiry, a bad signature or another secret gives false". `test/appProfile.test.ts`: "a good link works; a tampered signature, key or expiry and an expired link are all the same 404", "a path trying to leave the folder is 404". `test/appTickets.test.ts`: "even a correctly signed link to a ticket key is the same 404 from the files route". `test/adminSocial.test.ts`: "a signature made for an app file link is no admin link, even over the same text", "a bad, expired or borrowed signature is a 401, and a missing file a 404". |
| 5 | Rate limits | Done | Sign-in: `test/auth.test.ts` "per phone: the 4th request in 15 minutes is a 429 with Retry-After, and it resets", "per phone: the 11th request in an IST day is a 429", "per address: the 6th request in a minute and the 31st in a day are 429s, whatever the number", "the 201st send of the day is refused with otp_cap_reached and an alert; the reviewer still gets in", "a wrong code 5 times kills the challenge, even for the right code afterwards". Member routes: `test/appPlans.test.ts` "ten plans a day, then 429 with a retry time"; `test/appThread.test.ts` "31 messages in a minute is a 429 with Retry-After, and the minute after is open again"; `test/reports.test.ts` "it is limited to five a day, and the sixth is a 429 that stores nothing"; `test/appTickets.test.ts` "five files an hour for a plan, then 429; bad files do not count", "sixty attempts an hour for a member of any kind, then 429 before the body is read", "twenty files a day for a member across plans, then 429"; `test/appProfile.test.ts` "the 4th change in an IST day is 429", "the limit is 10 uploads per member per IST day, then 429 with Retry-After, and a new day starts fresh"; `test/appNotices.test.ts` "twenty registrations an hour for a member, then 429; another member is not held up". The keys are keyed hashes (`rate_bucket`), so a counter names no one. |
| 6 | Refresh token reuse | Done | `test/auth.test.ts`: "the refresh token is stored only as a hash", "refresh rotates, slides the 30 days, and the old token is reuse: it signs every session out", "a repeat after the window is reuse and signs every session out", "a repeat inside the window is still reuse once the replacement has been used", plus the short retry window cases ("a repeat of the just-rotated token inside the window rotates the chain again and keeps every session", "the retry leaves the other device and the fresh pair signed in"). |
| 7 | Webhook signature | Done | `src/app-api/routes/whatsappWebhook.ts` checks `X-Hub-Signature-256` over the raw body with a constant-time compare. `test/whatsappWebhook.test.ts`: "a missing, wrong or malformed signature is 401 and changes nothing", "a good signature is always 200, even for junk", "GET echoes the challenge only for the right token", "without WhatsApp configured the routes are 404". |
| 8 | Reviewer number | Done | The one number the store reviewer signs in with. `src/app-api/env.ts` accepts only a `+1 <area> 555-01xx` number and a 6 digit code, requires both together, and in production lets `TEST_PHONE_ALLOWLIST` hold nothing else. `test/appApi.test.ts`: "production lets the one reviewer number in and no other test phone, and refuses a reviewer that is real-shaped or half set" (checked: it fails when the production allowlist rule is removed). `test/auth.test.ts`: "the reviewer number gets the fixed code, no message, and status delivered", "the reviewer number's wrong tries are capped at 20 a day; after that even the right code is refused until the next IST day". The code itself is an owner step: pick it on the host and keep it out of the repo. |
| 9 | Fake sender absent in production | Done | `test/appApi.test.ts`: "production refuses the fake sender and the memory store", "createAppContext refuses a production start when the settings ask for the fake sender", "createAppContext refuses a fake sender passed in code with a production config, and takes a real one", "serve needs TURNOUT_ENV: without it the settings are refused, not read as development", "production leaves the staging test routes out of the route table, even with a token set", "a full production setup loads, with no ephemeral secrets and no staging token". `test/appAuthz.test.ts`: "a production app has no staging route in its table, so each answers the generic 404". Staging routes also need a token of 32 or more characters ("a STAGING_TEST_TOKEN shorter than 32 characters is refused, and 32 is fine") and compare it in constant time (`tokenMatches` in `src/app-api/routes/testOnly.ts`). |
| 10 | WhatsApp token scope | Owner step | The system user must hold WhatsApp messaging permission only, and its token goes into `WHATSAPP_ACCESS_TOKEN` on the host and nowhere else (`docs/meta-setup.md` item 7). The server reads the token only to send the template message (`src/app-api/vendors`); nothing in the repo can show the scope. Check it in Meta Business Settings, System users, and note the date in `docs/meta-setup.md`. |
| 11 | Key restrictions | Owner step | The Google Maps key (restricted to the app's package name and signing fingerprint, and to the Maps SDK only), the FCM credential, and the Expo access token. See `docs/google-setup.md` and `docs/plans/mobile-accounts.md`. The server holds no Maps or FCM key: the FCM service account goes to EAS credentials, and the server sends pushes through Expo with an optional `EXPO_ACCESS_TOKEN` (turn on Expo's push access token requirement so that token is needed). Verify each restriction in the console and record the date. |
| 12 | No co-member identity, foreign ids refused | Done (S19 audit) | See "S19 audit" below. |

## S19 audit

Two properties of the member routes, in `test/appAudit.test.ts` (19 tests) and `test/appAuthz.test.ts` (26 tests), with a
shared fixture in `test/helpers/groupWorld.ts`.

1. **A foreign id is the same 404 as an id that is nowhere.** Every member route that takes an id from the caller has a
   row with three calls: the caller's own id, another member's id and an id that does not exist. The own id must not be a
   404. The foreign and missing ids must give the identical 404 body. A test checks the table against the route table, so a
   new route with an id and no row fails. Not-yours, not-a-group, left, dissolved and called-off are all that one 404.
2. **No response carries a co-member's identity.** From before the reveal to after the thread is gone, no response and no
   log line holds a co-member's member id, phone, handle or gender. Co-members are named only by a per-group random
   `member_ref`, plus first name and a signed photo link from T-3h.

The test for each guard was checked by hand: remove the guard in the source, run the two files, and see a test fail. The
harness was a throwaway script that edits one guard, runs the tests and restores the file with `git checkout`. All 22 were
caught:

| Mutation | Failing tests |
| --- | --- |
| `GET /plans/:planId` loses its owner check | 6 |
| `POST /plans/:planId/withdraw` loses it | 6 |
| `PUT /plans/:planId/ticket` loses it | 6 |
| `GET /plans` lists every member's plans | 2 |
| `GET /groups/:groupId` loses its membership check | 14 |
| photo route loses the group check | 10 |
| photo route looks the ref up in any group | 4 |
| `POST /groups/:groupId/checkin` loses it | 14 |
| `GET /groups/:groupId/messages` loses it | 4 |
| `POST /groups/:groupId/messages` loses it | 8 |
| downvote loses the group check | 6 |
| downvote looks the ref up in any group | 4 |
| `DELETE /devices/:deviceId` loses the owner check | 4 |
| report loses the group check | 4 |
| report looks the ref up in any group | 2 |
| report accepts a message by someone else | 2 |
| report accepts a message from another group | 2 |
| `GET /notices` lists every member's notices | 2 |
| `POST /notices/read` marks every member's notices | 2 |
| a thread message carries the author's member id | 2 |
| a group member carries the photo key | 2 |
| the group answer before T-3h lists members | 4 |

What this does not cover: the admin panel (token protected, its own routes), and a leak through a field no test reads. The
audit reads every key of every response for the member ids and handles of the fixture world, so a new field that carries
one fails; a new field that carries something else about a person needs a person to look at it.

## Load smoke

`bun run load-smoke [--members 300] [--seconds 120] [--interval 5] [--tick-every 5]` (`scripts/load-smoke.ts`).

It builds a temp SQLite file with one group of six per show (300 members is 50 shows), starts the real `serve` command on
it as a staging server with the ticker on, and has each member read the group thread every `--interval` seconds. A thread
read also writes the member's presence, so this is 300 writers behind one lock. It also forces a ticker pass over all the
shows every `--tick-every` seconds, and runs a second writer handle that stands in for sync and the operator panel. The bar
is p95 of the polls under 150 ms and no SQLITE_BUSY (from the writer handle, the server log, or a 5xx). The exit code is 1
on a miss. The first fix for a miss is a longer poll interval in the app, not a bigger pool.

Result on 2026-10-29, local, 4 CPUs, other work running on the same machine, load generator and server on that machine:

| Run | Polls | p50 | p95 | p99 | max | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 300 members, 50 shows, every 5 s, 60 s | 3,600 | 5.0 ms | 34.7 ms | 370.8 ms | 749.4 ms | PASS |
| 60 members, every 5 s, 30 s | n/a | n/a | 9.6 ms | n/a | n/a | PASS |

Ticker passes (12 in the full run): p50 18.7 ms, p95 and max 952.9 ms. The slow one is the first pass, which locks and
reveals 50 groups at once. All responses were 200. SQLITE_BUSY: 0 from the writer handle, 0 in the server log, 0 5xx.

Caveats: this is one run, not a series. The numbers are a floor on a real host only if its disk is no slower than this
one. The p99 and max are the first-pass lock and reveal, which hold the write lock longest. A run on the production slot
is an owner step.

## Owner steps

None of these can be done or checked without a host, an account or a console.

1. **Sentry free tier.** Create the project and keep to the free tier (under 5,000 errors a month; add no payment method
   unless a spend cap is set). The mobile app has `@sentry/react-native`; the server has none by design, so server errors
   stay in the process log as a class name (`SENTRY_DSN` in `docs/deploy.md` is "later"). Scrub check: send one test error
   and confirm the event holds no phone, handle or name.
2. **Dependency bump.** Move each dependency to the newest version that is at least two weeks old (`minimumReleaseAge` in
   `bunfig.toml` enforces 14 days; `docs/plans/mobile-stack.md` lists the ones that did not qualify). Start with `jose` and
   `expo-server-sdk` on the server, then the app. Run `bun run check` after each group, and commit on its own.
3. **Budget alerts.** A monthly budget with alerts on the host account, the Meta WhatsApp account, Google Cloud (Maps and
   FCM), Expo and the object bucket if used. The server's own WhatsApp spend alerts (500, 1,000, 1,500 INR; `test/auth.test.ts`
   "500, 1000 and 1500 INR each alert once a month") reach the operator only through `OPERATOR_ALERT_WEBHOOK_URL`, so set it.
4. **Staging log grep.** After the staging end-to-end run, grep the server log for the test phone numbers, the test
   handles, first names and the sign-in code. Expect no matches. Record the date and the command.
5. **WhatsApp token scope** (control 10), **Maps, FCM and Expo key restrictions** (control 11), and the **app hash list** in the
   authentication template (`docs/meta-setup.md`) matching every signing key, along with `APP_LINKS_ANDROID_SHA256`.
6. **TLS and HSTS at the proxy** (control 2), done with S21 when the host is known.
7. **Reviewer code** (control 8): choose `REVIEWER_PHONE` and `REVIEWER_OTP` on the host and put them in the Play and App
   Store review notes, never in the repo.
8. **Litestream restore drill** from `docs/deploy.md`: restore the replica to a scratch path and open it. Photos and tickets
   are not in the backup (see the file storage section there).
9. **A load smoke on the production slot** after the first deploy, at 300 members.
