# MASVS server-side controls

Plan S23 (server hardening) and the S19 audit. Date 2026-10-31. Covers the server in `src/app-api` and `src/social`. The
app side is in `docs/security/masvs-app.md`.

This file says what the server does for each control the mobile security review asks about, with the evidence for it: a
code path, and a test file and test name. Every test name below was checked to exist, and the guard tests were checked by
hand (see "Mutation checks"). A row marked **owner step** needs the production host or a vendor dashboard, and there is no
production yet. A row marked **finding** points to the findings list.

Status words: **Met** means the code and a test are in the repo. **Met (config)** means a file in `deploy/` sets it and a
test pins it. **Owner step** means a person has to do or check it. **Accepted gap** is a known limit and the reason it
stays in v1.

Test names are the strings after `test(`. Run one with `bun test <file> -t "<part of the name>"`.

## Summary

| Group | Status | Open items |
| --- | --- | --- |
| Sign-in codes and sessions | Met | none |
| Authorization (S19 audit) | Met | none |
| Transport (TLS, HSTS) | Met (config), live host is an owner step | F1 (medium, config pinned by a test) |
| Logs and PII | Met in code, staging grep is an owner step | none |
| Rate limits | Met | F1 |
| Files | Met | none |
| Dependencies | Met | none |
| Keys and spend | Owner step | none |
| Load | Met at 300 members on one machine, production run is an owner step | none |

No finding is open at high. See "Findings".

## Controls

### Sign-in codes

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The code comes from the system random source, with rejection sampling | Met | `generateCode` in `src/app-api/otp.ts` draws a `Uint32` with `crypto.getRandomValues` and throws away any value at or past the last whole multiple of 10^6, so no digit is likelier. `test/auth.test.ts`: "the code is 6 digits and spread over all digits", "a random value past the last whole multiple of a million is thrown away, not folded onto a digit" (it feeds the limit, the largest `Uint32` and then a good value, and expects the third). |
| 2 | The code is stored as an HMAC with `OTP_PEPPER`, never in clear | Met | `codeHmac` in `src/app-api/otp.ts` is HMAC-SHA256 of the challenge id and the code, keyed with `OTP_PEPPER`. The phone is stored as a keyed hash (`phoneHash`). Compares use `timingSafeEqual` (`sameHash`). `test/auth.test.ts`: "a good request makes a challenge, sends once and stores no code or raw phone" (it recomputes the HMAC and greps the table and the `rate_bucket` keys for the code and the number). Production refuses to start without `OTP_PEPPER` ("production refuses to start without the grievance block, and says which part" in `test/appApi.test.ts`). |
| 3 | A code expires, works once, and is good for one number and one purpose | Met | 10 minutes for sign-in, 5 for a delete code (`otp` in `src/social/model/tunables.ts`). `test/auth.test.ts`: "a code works once, expires after 10 minutes, and is not good for another number", "an earlier code stops working when a new one is asked for". `test/deletion.test.ts`: "a wrong, used, expired, unknown or someone else's code is a 400". `test/appAuthz.test.ts`: "a sign-in challenge cannot confirm a deletion: 403 for its owner, 400 for anyone else, and both accounts stay" |
| 4 | Wrong tries are limited | Met | 5 wrong tries kill the challenge. The counter is one `UPDATE ... WHERE attempts < ?` in `verifyOtp`, so two parallel tries cannot both pass the limit. `test/auth.test.ts`: "a wrong code 5 times kills the challenge, even for the right code afterwards". |
| 5 | Reviewer number | Met | The one number the store reviewer signs in with. `src/app-api/env.ts` accepts only a `+1 <area> 555-01xx` number and a 6 digit code, requires both together, and in production lets `TEST_PHONE_ALLOWLIST` hold nothing else. The reviewer gets no message, and wrong tries are capped at 20 a day. `test/appApi.test.ts`: "production lets the one reviewer number in and no other test phone, and refuses a reviewer that is real-shaped or half set". `test/auth.test.ts`: "the reviewer number gets the fixed code, no message, and status delivered", "the reviewer number's wrong tries are capped at 20 a day; after that even the right code is refused until the next IST day". Choosing the code is an owner step (owner step 7). |
| 6 | The fake sender is absent in production | Met | `src/app-api/env.ts` refuses `OTP_SENDER=fake`, `PUSH_SENDER=fake` and `OBJECT_STORE=memory` in production, and `createAppContext` refuses a fake sender passed in code. `test/appApi.test.ts`: "production refuses the fake sender and the memory store", "createAppContext refuses a production start when the settings ask for the fake sender", "createAppContext refuses a fake sender passed in code with a production config, and takes a real one", "serve needs TURNOUT_ENV: without it the settings are refused, not read as development", "a full production setup loads, with no ephemeral secrets and no staging token". `test/appPush.test.ts` covers the push sender. |
| 7 | The staging routes are absent in production | Met | The `/__test/*` routes are in the route table only outside production and with a token of 32 or more characters, compared in constant time (`tokenMatches` in `src/app-api/routes/testOnly.ts`). `test/appApi.test.ts`: "production leaves the staging test routes out of the route table, even with a token set", "a STAGING_TEST_TOKEN shorter than 32 characters is refused, and 32 is fine". `test/appAuthz.test.ts`: "a production app has no staging route in its table, so each answers the generic 404". |
| 8 | Webhook signature | Met | `src/app-api/routes/whatsappWebhook.ts` checks `X-Hub-Signature-256` over the raw body with a constant-time compare, and the GET check compares the verify token. `test/whatsappWebhook.test.ts`: "a missing, wrong or malformed signature is 401 and changes nothing", "a good signature is always 200, even for junk", "GET echoes the challenge only for the right token", "without WhatsApp configured the routes are 404". |

### Sessions and tokens

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 9 | Every member route needs a valid access token, and the member is read again on each request | Met | `requireMember` in `src/app-api/auth.ts` runs before every route marked `auth: "member"`. The token must verify, its session must be open and be that member's, and the member must not be banned or deleted (401). A suspended member is 403 and a stopped member is fine. A ban or a sign-out works at once, not when the token expires. `test/appAuthz.test.ts`: "a caller with no credentials gets the row's answer, and a member route never runs its handler", "a made-up, malformed or foreign-signed token is 401 on every member route", "an expired access token is 401 on every member route", "a suspended member is 403 account_suspended on every member route; a banned member is 401". `test/auth.test.ts`: "sign-out ends the session at once, even with a good access token", "requireMember checks the member every request: suspended 403, banned 401, stopped fine". |
| 10 | The access token is a short ES256 JWT with fixed issuer and audience | Met | `src/app-api/tokens.ts`: 15 minutes, `iss` turnout, `aud` turnout-app, `alg` ES256 only, checked against the clock the app uses. A key change keeps the old public key while it is configured. `test/auth.test.ts`: "the access token is an ES256 JWT with sub and sid that lasts 15 minutes", "a token signed with another key, or none, is 401", "a token with the right key but the wrong issuer, audience or algorithm is 401", "the previous public key still verifies tokens until it is removed". |
| 11 | The refresh token is random, stored as a hash, rotated, and reuse signs everyone out | Met | 32 random bytes, stored as SHA-256 (`newRefreshToken` in `src/app-api/tokens.ts`). `refreshSession` in `src/app-api/sessions.ts` rotates in one `UPDATE`, so two parallel refreshes cannot both win. A repeat of an old token after the 30 second retry window, or once the replacement was used, revokes every session of that member. A banned member cannot refresh. `test/auth.test.ts`: "the refresh token is stored only as a hash", "refresh rotates, slides the 30 days, and the old token is reuse: it signs every session out", "a repeat of the just-rotated token inside the window rotates the chain again and keeps every session", "the retry leaves the other device and the fresh pair signed in", "a repeat after the window is reuse and signs every session out", "a repeat inside the window is still reuse once the replacement has been used", "an unknown, expired or malformed refresh token is 401 or 400", "a banned member cannot refresh, and the session is closed". |

### Transport, logs and files

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 12 | TLS only, and HSTS | Met (config), live host is an owner step | The app server speaks plain HTTP on the host's own port. `deploy/Caddyfile` is the only public listener: Caddy gets the certificates, sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` for production and staging, caps the body at 12 MB and replaces any `X-Forwarded-For` a client sends. `deploy/setup.sh` opens only SSH, 80 and 443 in `ufw`, and writes `TRUST_PROXY_HEADER=x-forwarded-for` into each env file. `docs/deploy.md` is the step list. `test/deployConfig.test.ts`: "every Caddy site sends HSTS for a year, so the app is reached over TLS only", "the app is behind the proxy: the server env files name the header the proxy writes", "the firewall opens SSH, 80 and 443 and nothing else". The mobile side: `usesCleartextTraffic` in `apps/mobile/app.config.ts` allows cleartext Android traffic only in the `development` and `e2e` variants, and the preview and production variants have no default API URL (`apps/mobile/config/variants.ts`). Not checkable here, because there is no host: that the DNS name points at it, that the certificate is issued, that port 3000 is closed from outside, and the `curl -I` and SSL Labs check (owner step 6). See F1 and F4. |
| 13 | No PII in logs | Met in code, staging grep is an owner step | One log line per request holds `at`, `method`, `route` (the pattern, not the URL), `status`, `ms`, a 12 character SHA-256 prefix of the member id and an error class name (`LogEntry` in `src/app-api/context.ts`, written in `handleRequest` in `src/app-api/http.ts`). The ticker's failure line has the same shape (`logFailure` in `src/app-api/ticker.ts`). `test/auth.test.ts`: "no log line, alert or error body holds a code, token, phone or secret". `test/appAudit.test.ts`: "at every point from before the reveal to after the thread is gone, no response or log line names another member by id, phone, handle or gender" (it reads every log line the run wrote). `bun run scripts/pii-scan.ts` and `test/noRealPhones.test.ts` keep real-looking numbers and addresses out of tracked files. Result on 2026-10-31: `pii-scan: no real-looking phone numbers or emails in tracked files`. The scan reads the repository, not a running server's output, so it does not apply to local or staging logs. The grep of real staging logs is owner step 4. |
| 14 | Signed file links | Met | `src/app-api/fileLinks.ts`: HMAC-SHA256 with `FILE_LINK_SECRET` over the key and the expiry, 5 minutes (`fileLinkMinutes`), constant-time compare. The files route (`src/app-api/routes/files.ts`) answers one 404 for a bad signature, an old link, a path that leaves the folder and any `tickets/` key, so a ticket file is never served by the app. `test/objectStore.test.ts`: "a changed key, a changed expiry, a bad signature or another secret gives false", "a link expires after five minutes, to the second". `test/appProfile.test.ts`: "a good link works; a tampered signature, key or expiry and an expired link are all the same 404", "a path trying to leave the folder is 404". `test/appTickets.test.ts`: "even a correctly signed link to a ticket key is the same 404 from the files route". `test/adminSocial.test.ts`: "a signature made for an app file link is no admin link, even over the same text", "a bad, expired or borrowed signature is a 401, and a missing file a 404". |
| 15 | Body size | Met | `Bun.serve` has `maxRequestBodySize` of 12 MB (`src/cli.ts`), a JSON body is read with a 16 KB limit (`MAX_JSON_BYTES` in `src/app-api/http.ts`), and a ticket or photo is checked by type and size before it is stored. Caddy caps the body at 12 MB too. `test/appApi.test.ts`: "a JSON body over 16 KB is 413 payload_too_large". `test/appTickets.test.ts`: "an empty body is 400, a file over the limit is 413 file_too_large, and a type that is not a picture is 400". |

### Rate limits

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 16 | Limits on the sign-in code, by number and by address | Met | 3 per phone in 15 minutes, 10 per phone per IST day, 5 per address a minute, 30 per address a day, and a daily send cap of 200 with an alert (`rate` and `otp` in `src/social/model/tunables.ts`). The keys are keyed hashes in `rate_bucket` (`rateKey` in `src/app-api/rateLimit.ts`), so a counter names no one. The address is the last entry of the configured proxy header, else the socket address (`clientIp` in `src/app-api/http.ts`). `test/auth.test.ts`: "per phone: the 4th request in 15 minutes is a 429 with Retry-After, and it resets", "per phone: the 11th request in an IST day is a 429", "per address: the 6th request in a minute and the 31st in a day are 429s, whatever the number", "a refused request does not use up the other limits", "the 201st send of the day is refused with otp_cap_reached and an alert; the reviewer still gets in", "the default cap is 200", and for the address: "behind a proxy the last entry counts, so a client cannot choose its own address", "with no proxy header configured, the header is ignored and the socket address is used", "a missing or empty header falls back to the socket address". |
| 17 | Limits on member routes | Met | `test/appPlans.test.ts` "ten plans a day, then 429 with a retry time"; `test/appThread.test.ts` "31 messages in a minute is a 429 with Retry-After, and the minute after is open again"; `test/reports.test.ts` "it is limited to five a day, and the sixth is a 429 that stores nothing"; `test/appTickets.test.ts` "five files an hour for a plan, then 429; bad files do not count", "sixty attempts an hour for a member of any kind, then 429 before the body is read", "twenty files a day for a member across plans, then 429"; `test/appProfile.test.ts` "the 4th change in an IST day is 429", "the limit is 10 uploads per member per IST day, then 429 with Retry-After, and a new day starts fresh"; `test/appNotices.test.ts` "twenty registrations an hour for a member, then 429; another member is not held up". The delete code is under the sign-in limits (`test/deletion.test.ts`, the test starting "the delete code is under the sign-in limits"). |

### Supply chain and keys

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 18 | Dependencies | Met | The server's runtime packages that touch security are pinned to exact versions in `package.json`: `jose` 6.2.12 (JWT), `expo-server-sdk` 7.2.0 (push), `libphonenumber-js` 1.13.15 (number checks). Hashing, HMAC, random bytes and SQLite come from Bun and `node:crypto`, not from packages. `bun outdated` on 2026-10-31 lists no newer version of these three. `bunfig.toml` sets `minimumReleaseAge` to 14 days, so a version published in the last two weeks is refused. `bun run deps` (dependency-cruiser) is part of `bun run check`. See owner step 2 for the last bump and what was not moved. |
| 19 | Keys and spend | Owner step | The Google Maps key (restricted to the app's package name and signing fingerprint, and to the Maps SDK), the FCM credential and the Expo access token. See `docs/google-setup.md` and `docs/plans/mobile-accounts.md`. The server holds no Maps or FCM key: the FCM service account goes to EAS credentials, and the server sends pushes through Expo with an optional `EXPO_ACCESS_TOKEN` (turn on Expo's push access token requirement so that token is needed). Sentry stays on the free tier, and the server has no Sentry package by design. Budget alerts are owner step 3. Verify each restriction in the console and record the date. |
| 20 | WhatsApp token scope | Owner step | The system user must hold WhatsApp messaging permission only, and its token goes into `WHATSAPP_ACCESS_TOKEN` on the host and nowhere else (`docs/meta-setup.md` item 7). The server reads the token only to send the template message (`src/app-api/vendors`). Nothing in the repo can show the scope. Check it in Meta Business Settings, System users, and note the date in `docs/meta-setup.md`. |

### Authorization

| # | Control | Status | Evidence |
| --- | --- | --- | --- |
| 21 | Each route has a guard, and a foreign id is the same 404 as a missing one | Met (S19 audit) | See "S19 audit" below. |
| 22 | No response or log line carries a co-member's identity | Met (S19 audit) | See "S19 audit" below. |

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
2. **Dependency bump.** Done on 2026-10-29 for every version at least two weeks old (`minimumReleaseAge` in `bunfig.toml`
   enforces 14 days). `jose` 6.2.12 and `expo-server-sdk` 7.2.0 were already the newest. The server moved to
   `libphonenumber-js` 1.13.15, `lucide-react` 1.57.0, `maplibre-gl` 6.14.0 and `radix-ui` 1.8.1, and the tools to
   `@playwright/test` 1.64.1, `@types/bun` 1.4.3, `dependency-cruiser` 18.6.0, `lefthook` 2.2.2 and `shadcn` 4.21.5. Not
   moved, with the reason: `react` and `react-dom` stay at 19.3.0 and `@sentry/react-native` and `@shopify/flash-list` at
   the Expo SDK's versions, because `expo-doctor` checks them against `expo/bundledNativeModules.json`; `typescript` 7 is a
   major version and waits for its own change. Repeat on the release commit with `bun outdated` in the root and in
   `apps/mobile`.
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
