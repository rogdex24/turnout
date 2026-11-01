# Mobile app: OWASP MASVS L1 and L2 evidence

Plan A26. Date 2026-10-29. Covers the Expo app in `apps/mobile`. The server side is in `docs/security/masvs-server.md`.

This is a self-assessment against the OWASP MASVS control groups (https://mas.owasp.org/MASVS/). MASVS 2 no longer
numbers levels, so "L1" here means the baseline controls every app must meet and "L2" means the defense-in-depth
controls the plan asks for because the app holds a phone number, a face photo and chat messages. Each row says what the
app does, the file that does it, and the test that fails if it stops. A row marked **owner step** needs a person, a
device or a production setting that cannot be checked from this repo. A row marked **accepted gap** is a known limit
with the reason it stays in v1.

How to read the status column: **Met** means the code and a test are in the repo. **Met (config)** means the setting is
in `app.config.ts` or CI and a test pins it. **Owner step** and **Accepted gap** are as above.

## Summary

| Group | L1 | L2 | Open items |
| --- | --- | --- | --- |
| STORAGE | Met | Met, one accepted gap (photos in the image cache are not encrypted) | none high |
| CRYPTO | Met | Met | none |
| AUTH | Met | Met | none |
| NETWORK | Met | Pinning decided: not in v1 | none |
| PLATFORM | Met | Met | dump the merged production manifest (owner step) |
| CODE | Met | Met | none |
| RESILIENCE | Met (L1 only, as planned) | Not claimed | none |
| PRIVACY | Met | Met | Data safety form (owner step, `apps/mobile/store/data-safety.md`) |

Findings fixed while writing this file:

1. On the branch this review started from, the group chat route (`src/app/(app)/groups/[groupId]/thread.tsx`) did not block
   screen capture. The M4 work fixed the route in parallel, so the merged code has one `useBlockCapture()` call there. `src/ui/captureRoutes.test.ts` fails if the chat, the
   report or the after route stops calling it.
2. Android backup was left at the Expo default. `allowBackup` is now `false` in every variant, and data extraction rules
   also exclude the device-to-device transfer (see STORAGE-1).
3. Release builds carried `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and `SYSTEM_ALERT_WINDOW` from library and
   template defaults. They are blocked (see PLATFORM-1).

No finding is open at high severity.

## MASVS-STORAGE

### STORAGE-1: the app securely stores sensitive data (L1)

Everything the app keeps on the phone, where, and what removes it:

| Data | Where | Protection | Removed by |
| --- | --- | --- | --- |
| Refresh token (`turnout.refreshToken`) | `expo-secure-store`: iOS Keychain, Android Keystore-backed storage | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it never moves to another phone in a backup | Sign-out, deletion, a refresh the server refuses |
| Cache key (`turnout.cacheKey`) | Same | 24 random bytes from `expo-crypto`, kept as 32 base64 characters, made once | Stays until uninstall; the file it protects is deleted at sign-out |
| Access token | Memory only (`src/api/auth.ts`) | Never written to disk | Sign-out, process death |
| Query cache (`turnout-query-cache` in the `turnout-cache` MMKV file) | MMKV, AES-256 | Key above | Sign-out, deletion |
| Small facts (`turnout-prefs` MMKV, plain): `welcomeSeen`, `acceptedNotice`, `userId` (the member id), `analyticsConsent`, `goExplained`, `ticketAsked`, `pushDevice` (push token and device id) | MMKV, not encrypted | Nothing in it names or locates a person beyond the random member id; no phone, no handle, no photo, no message | Sign-out clears all but `welcomeSeen`; deletion clears everything |
| Image cache | `expo-image` disk cache | Not encrypted (accepted gap below) | Sign-out, deletion |

What is in the encrypted query cache is decided by an allowlist, `PERSISTED_PREFIXES` in `src/api/keys.ts`: the person's
own profile (`me`, which holds the last four digits of the phone and never the full number), `config`, `areas`, the
first page of the shows list, the person's own plans, the group (cafe and members' first names and photo links) and the
newest messages of a thread (clipped by `clipForDisk`). A key that is not on the list is never written. The after-show
screen, the blocked list and the member view of a show are not persisted. Paused replayable mutations (`checkin`,
`thread-send`, `feedback`, `report`) are written with their variables so a restart can send them again; that means a
queued message or report body is in the same encrypted file until it sends.

The phone number, the handle and the ticket file are never stored by the app. The number is typed, sent, and dropped
from memory when the screen closes. The ticket and the photo go from the system picker to the server and are not copied
into app storage.

What sign-out and deletion wipe (`src/api/signOut.ts`, `createLocalWipe`), in this order: stop Sentry and PostHog;
`queryClient.clear()`; `persister.removeClient()` (deletes the encrypted cache entry); `prefs.clearAll()`, then the
welcome flag is put back unless this is a deletion; `flags.refresh()` so the router leaves the signed-in screens; the
image cache (memory and disk). Then the session removes the refresh token from the keychain and the member id from
prefs. Sign-out also deletes the push device on the server and revokes the session first, then wipes (`src/api/auth.ts`
`endSession`). A failure to clear images does not keep the person signed in.

Tests: `src/api/signOut.test.ts` (empties the caches, the small facts, the images and the usage-data choice, and keeps
the welcome cards seen; forgets the welcome cards once after deletion; does not stay signed in because the images would
not clear; sign-out order; after deletion the session ends on the phone only), `src/api/secureStorage.test.ts` (32
character key, kept, replaced when the wrong size), `src/api/persister.test.ts` (allowlist, thread clipping, failed
queries dropped, removeClient cancels a pending write, replayable mutations only, buster per version and person),
`src/api/auth.test.ts` (refresh token in the keychain and the access token in memory; a refused refresh empties the
keychain).

Android backup: `app.config.ts` sets `android.allowBackup: false` in every variant, which stops cloud backup. From
Android 12 that flag does not stop a device-to-device transfer, so the `withNoDataExtraction` plugin
(`config/noDataExtraction.ts`) also sets `android:dataExtractionRules` to a rules file that excludes every domain under
both `<cloud-backup>` and `<device-transfer>`. No file in the app's data directory goes to Google Drive or to a new phone.
The cache key lives in the Keystore and cannot follow a restore, so a restored cache would only be noise. Tests:
`config/appConfig.test.ts` "Android does not back up the app, in every variant" and "Android also excludes everything
from a device-to-device transfer, in every variant". Status: **Met (config)**. iOS excludes Keychain items marked `THIS_DEVICE_ONLY` from backups by definition.

### STORAGE-2: the app prevents leakage of sensitive data (L1, L2)

- Logs: the app has no `console.log` calls in `src`, `config` or `modules`, so nothing the person types reaches logcat.
  The Kotlin receiver for the WhatsApp code logs nothing (stated in its header comment).
- Screenshots and the app switcher: chat, report and after screens block capture (PLATFORM-3).
- Clipboard: the app never writes to it. It reads it once, only when the person taps "paste" on the code screen
  (`src/screens/signin/CodeScreen.tsx`), and keeps only the digits.
- Keyboard cache: the handle field turns off autocorrect and autocomplete (`SocialView.tsx`, `ProfileView.tsx`); the
  phone and name fields use the matching `autoComplete` and `textContentType` so the system can fill them.
- Analytics and crash reports: nothing is sent before "Share usage data" is on. Events carry ids only (`src/analytics/events.ts`
  drops an event whose property name looks like a place, handle or person). Sentry runs with `sendDefaultPii: false`, no
  traces, no replay, `attachScreenshot: false`, and scrubs events and breadcrumbs (`src/analytics/scrub.ts`). PostHog
  runs with no autocapture, no lifecycle events, no recordings, `disableGeoip`, and in-memory persistence, so it has no
  stable id across launches. Tests: `src/analytics/scrub.test.ts`, `sentry.test.ts`, `posthog.test.ts`,
  `telemetry.test.ts` (builds no client and sends nothing without consent; opts out and stops Sentry when sharing is
  turned off; drops an event that carries a location, handle or person), `events.test.ts`.
- Accepted gap (L2): photos of other members are kept in the `expo-image` disk cache, which is not encrypted. They are
  shown only from three hours before the show, the cache is emptied at sign-out and deletion, and encrypting it would
  mean replacing the image library. The photos are 1080 px JPEGs the person's group already sees.
- Accepted gap (L2): the iOS Keychain keeps items across an uninstall. A reinstalled iOS app could find an old refresh
  token. It is revoked on the server after 30 days of no use, a rotated token cannot be used twice, and iOS is on the
  simulator only in v1 (no Apple account yet). Revisit when iOS ships: clear the keychain on the first launch of a new
  install.

## MASVS-CRYPTO

### CRYPTO-1: the app uses strong cryptography (L1)

The app does not implement its own cryptography. It relies on: TLS for every request; AES-256 in MMKV for the cache;
the platform Keychain and Keystore for secrets; `expo-crypto` `getRandomBytes` (the platform CSPRNG) for the cache key
and for the client ids on retried sends (`src/api/mutations.ts`). There are no hard-coded keys. `Math.random` is not used
for anything that protects data. The bundle scan (CODE-1) fails the build when a key, token or private key appears in the
release bundle. Tests: `src/api/secureStorage.test.ts` (key length and reuse), `config/bundleScan.test.ts`.

### CRYPTO-2: the app performs key management according to industry best practices (L1, L2)

- One app-made key, the cache key. Made once from the CSPRNG with 192 bits of entropy, kept only in the Keychain or
  Keystore, never logged, never in the bundle, never sent. A key of the wrong length is replaced
  (`ensureCacheKey`, tested).
- The cache key is not rotated at sign-out. The file it protects is deleted at sign-out, and a new person gets a new file
  stamped for them (`cacheBuster` adds the member id). Reusing the key adds nothing for an attacker who cannot read the
  Keystore. Accepted.
- Access and refresh tokens are issued by our server and are not keys the app creates. The refresh token is stored as a
  hash on the server (`docs/data-map.md`, `auth_session.refresh_hash`).
- Third-party keys in the app are public by design: the Google Maps key (restricted on the Google side to the package
  name and the Play App Signing SHA-1; `docs/plans/mobile-accounts.md`) and the Sentry and PostHog public ingest keys.
  The scan treats a Google API key as a finding in the JS bundle, because the Maps key is injected into the manifest at
  build time and does not belong in JavaScript.

## MASVS-AUTH

### AUTH-1: the app uses secure authentication and authorization protocols (L1)

Sign-in is a WhatsApp code sent and checked by our server (`src/api/auth.ts`, `src/api/whatsappOtp.ts`). The code is
short-lived (10 minutes), single use and limited to 5 guesses (`docs/data-map.md`, `otp_challenge`). The server issues a
short-lived access token and a rotating refresh token. The app:

- keeps the access token in memory and the refresh token in the keychain (test "sign in keeps the access token in memory
  and the refresh token in the keychain");
- shares one refresh between parallel callers, because the server rotates the token and forgives a retry for 30 seconds
  only (test "parallel callers share one refresh");
- refreshes before a token expires and does not rotate again for a 401 about a token another request already replaced;
- signs the person out and empties the keychain when the server refuses the refresh; treats no network as offline, not
  as a sign-out; keeps the session through a server error (tests in `src/api/auth.test.ts`);
- retries a 401 once with a new token and signs out on a second 401 (`src/api/client.test.ts`: "a 401 refreshes once and
  retries with the new token", "a second 401 signs the person out and fails as unauthorised", "a 401 when the refresh was
  refused stops without a second request");
- sends no token on public routes (test "public routes send no token and never ask the session for one").

Authorization is on the server and is not trusted to the app. The S19 matrix (`test/appAuthz.test.ts`) runs every route as
no token, another member, a non-member, a removed member and a suspended member. The app only hides screens that the
server would refuse anyway.

### AUTH-2: the app performs local authentication securely (L2)

The app has no local PIN, passcode or biometric lock of its own, so there is no local authentication to bypass. The
refresh token sits behind the device lock because of `AFTER_FIRST_UNLOCK`. A biometric gate in front of the app was not
in the plan. Not applicable in v1.

### AUTH-3: the app secures sensitive operations with additional authentication (L2)

Deleting an account needs a fresh code: the server issues a challenge with purpose `delete_account`, and a sign-in code
cannot delete an account (`docs/data-map.md`, `otp_challenge.purpose`). The app flow is
`src/screens/settings/DeleteAccountScreen.tsx` (send a code on WhatsApp, then `DELETE /me` with the right code; a wrong
code leaves the account as it was), tested in `src/screens/settings/DeleteAccountScreen.test.tsx`. Changing the handle is rate
limited by the server (3 submits a day).

## MASVS-NETWORK

### NETWORK-1: the app secures all network traffic according to the current best practices (L1)

- Cleartext is off. Android `usesCleartextTraffic` is `true` only for the `development` and `e2e` variants, which reach
  a host at `10.0.2.2`; it is `false` for `preview` and `production`. The production manifest from `expo prebuild` shows
  `usesCleartextTraffic="false"`. iOS keeps the App Transport Security default, and no variant sets `NSAppTransportSecurity`
  or `NSAllowsArbitraryLoads`. Test: `config/appConfig.test.ts` ("cleartext traffic is allowed in the development and
  e2e variants only", "release variants point at an https server and no variant overrides the iOS transport security
  default").
- A preview or production build refuses to build without `EXPO_PUBLIC_API_URL`, and the CI export scan checks that the
  release bundle carries no `10.0.2.2` and no dev or e2e scheme (`config/variants.test.ts`: "preview and production
  throw without one"; `config/bundleScan.ts` `DEV_ONLY_STRINGS`).
- Every API call goes through one client, `src/api/client.ts`, with a timeout and an error mapping (tests in
  `src/api/client.test.ts`). The app loads no web page inside itself (PLATFORM-2).
- The only other hosts the release app talks to are Expo Updates, Sentry and PostHog (both only after consent), the Expo
  push service (through our server), and Google Maps tiles through the Maps SDK. All use TLS.
- Server TLS settings (version, HSTS, certificate renewal) are in `docs/security/masvs-server.md` and `docs/deploy.md`.

### NETWORK-2: the app performs identity pinning for all remote endpoints under the developer's control (L2)

**Decision: no certificate or public-key pinning in v1.** Reasons:

1. Pinning can brick the app. The API sits on a host slot that is not final, behind a certificate authority that renews
   every 60 to 90 days. A pinned leaf breaks at each renewal. A pinned CA or intermediate breaks when the CA changes its
   chain, which Let's Encrypt has done. We have one operator and no 24-hour on-call.
2. The recovery path is slow. A broken pin needs a new store build (Play review) or an EAS Update, and an EAS Update itself
   would be fetched over the same TLS connection to a different host, which works, but a bad pin that ships in the native
   layer cannot be fixed by JavaScript alone.
3. The threat the pin adds against is a rogue or compromised certificate authority, or a user-installed root on a
   hostile phone. Our data on the wire is the person's phone number, profile and chat, over TLS with a short-lived token.
   An attacker who has installed a root on the phone can also read the screen and the keychain with that same access.
   On Android 7 and later the app does not trust user-installed roots by default (the target SDK is above 24 and the
   manifest has no `networkSecurityConfig` that adds them), which removes the most common case.
4. The server can limit the damage without pinning: refresh tokens rotate and reuse revokes the session, access tokens are
   short-lived, and no response carries a co-member's phone or handle.
5. Expo has no pinning in the managed workflow. It needs a native module and a config plugin we would own and test on
   both platforms, for a risk that is low here.

Revisit when any of these change: the hosting settles on a fixed certificate with a reviewed renewal process; the app
starts to carry payments or identity documents; a security review finds a real interception case. Then pin the public
key of two certificates (current and backup) with a report-only period first. Status: **Accepted gap, decided**. It is a
written decision, not an omission.

## MASVS-PLATFORM

### PLATFORM-1: the app uses IPC mechanisms securely (L1)

- Exported components: the only exported component the app adds is `WhatsAppOtpReceiverActivity`, which WhatsApp
  starts with the sign-in code (`modules/whatsapp-otp/plugin/manifest.js`). It accepts a code only when the intent carries
  the handshake id this app generated and it logs nothing. `noHistory` and `excludeFromRecents` are set. Test:
  `modules/whatsapp-otp/plugin/manifest.test.ts`. Beyond that, the activity from the launcher and the intent filter for
  the app link are the only entries.
- Permissions: the production manifest from `expo prebuild` asks for `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`,
  `INTERNET` and `VIBRATE`. Camera, microphone, background location, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and
  `SYSTEM_ALERT_WINDOW` are blocked (`blockedPermissions` in `app.config.ts`). The photo and the ticket come from system
  pickers, which need no storage permission. Test: `config/appConfig.test.ts` ("release builds drop the storage and
  overlay permissions, and the app asks for no other sensitive one"). The permission strings are plain and accurate (see
  `apps/mobile/store/permissions.md`).
- Libraries add some permissions at the Gradle merge step (for example `POST_NOTIFICATIONS` from `expo-notifications`).
  **Owner step:** dump the merged manifest of the production AAB with `bundletool dump manifest` and compare it with
  `apps/mobile/store/permissions.md` and the Data safety form before the first upload.
- The `queries` block names only `com.whatsapp` and `com.whatsapp.w4b`, so the installed check works without the broad
  package visibility permission.

### PLATFORM-2: the app uses WebViews securely (L1)

The app has no WebView. `react-native-webview` is not a dependency. The privacy notice and the grievance details are native
screens. A link that leaves the app opens in the system browser and only after `safeWebUrl` (`src/model/externalLink.ts`)
accepts it as http or https, so a bad catalogue row cannot open a script or another app's scheme
(`src/model/externalLink.test.ts`).

### PLATFORM-3: the app uses the user interface securely (L1, L2)

Deep link allowlist. Every link the system gives the app goes through `src/app/+native-intent.tsx`, then
`src/api/nativeIntent.ts`, then `resolveSystemPath` in `src/model/linking.ts`. It returns an app route or Home and passes on
nothing the link says except a checked show id:

- `https://go.<domain>/e/<show id>` and `/e/<show id>/go`, only on the exact link host the build was given, with no user,
  no port and no look-alike suffix; with no link host configured, no https link is accepted;
- the build's own scheme (`turnout://show/<id>`, `turnout://e/<id>`, with `/go`); another scheme is refused;
- show ids match `[A-Za-z0-9][A-Za-z0-9_-]{0,127}` (no dots, no `..`); links over 2048 characters are refused;
- everything else opens Home. The Storybook link works only in builds that include Storybook, and the dev client
  launcher link only in a development build. The `push` link that stands in for a tapped notification exists only in the
  e2e build and carries three validated fields.

Android App Links (`autoVerify`) are on for the production package only, so the dev, e2e and preview builds never claim
the real host (`config/appLinks.ts`). iOS has no associated domains in v1. Tests: `src/model/linking.test.ts` (refuses
every https link when the build has no link host; keeps the scheme exact; opens Storybook with a plain story id; lets the
dev client launcher through only in a development build; e2e push link with three fields; Home for an unknown kind or a
bad id), `src/api/nativeIntent.test.ts`, `config/appLinks.test.ts` ("never adds a filter to the dev, e2e or preview
builds", "keeps the production package the one assetlinks.json names").

Screen capture blocking. `useBlockCapture` (`src/ui/useBlockCapture.ts`) calls `preventScreenCaptureAsync` while the
screen is focused, which sets `FLAG_SECURE` on Android (no screenshots, no screen recording, blank thumbnail in the
recents list) and hides the content in the iOS app switcher snapshot, and allows capture again when the screen blurs.
It is used on:

- the group chat: `src/app/(app)/groups/[groupId]/thread.tsx` (added in this review);
- the report screen: `src/app/(app)/report.tsx`;
- the after screen: `src/app/(app)/groups/[groupId]/after.tsx`.

Only the e2e build sets `EXPO_PUBLIC_ALLOW_CAPTURE=1` so Maestro can take screenshots; `assertReleaseEnv` makes a preview
or production build refuse to start with it set. The bundle scan cannot see it, because Metro replaces the variable with
its value at build time. Tests:
`src/ui/captureRoutes.test.ts` (each of the three routes calls the hook), `src/ui/useBlockCapture.test.tsx` (blocks while
open, allows again after; leaves capture alone in the e2e build), `config/variants.test.ts` ("release variants refuse the
capture and Storybook switches"), `config/eas.test.ts` ("only the e2e profile allows screen capture").

Limit to state plainly: FLAG_SECURE stops the system screenshot and recording, not a second phone pointed at the
screen. Other screens (home, show, plan) hold no co-member words and are not blocked.

### Notification content (L2)

Pushes carry a generic title and body with the notice kind and two ids, no name, cafe, show title or reason
(`docs/data-map.md`, third parties). Lock-screen content therefore reveals nothing about a person or a group.

## MASVS-CODE

### CODE-1: the app requires an up-to-date platform version (L1)

`minSdkVersion` is 24 and `deploymentTarget` is 16.4 (`app.config.ts`). `targetSdkVersion` follows the Expo SDK; the
owner reads the current Play requirement on the upload day (`docs/plans/mobile-play-release.md`, "Checks before the first
upload"). **Owner step.**

### CODE-2: the app has a mechanism for enforcing app updates (L2)

EAS Update is configured with `runtimeVersion` policy `fingerprint` and `checkAutomatically: ON_LOAD`, so a JavaScript fix
reaches a phone on the next launch without a store review. A forced native update is not built; the server's `GET /config`
is the place to add one if a break needs it. Status: JavaScript fixes are Met (config). Forced native update is not in
v1.

### CODE-3: the app only uses software components without known vulnerabilities (L1)

Dependencies are pinned by `bun.lock` and renovate (`renovate.json`). `expo-doctor` runs in the `mobile-health` CI job and
checks that the SDK packages match the Expo version. The pre-commit hook runs `gitleaks` on every staged change. **Owner step:** run
`bun audit` (or the GitHub advisory view) on the release commit and record the result in `docs/release-gate.md`.

### CODE-4: the app validates and sanitises all untrusted inputs (L1)

Every server response is parsed with a Zod schema from `@turnout/contract`, and a response that does not match is a
server error (`src/api/client.test.ts`: "a response that does not match the schema is a server error"). Deep links go
through the allowlist above. The phone, handle, message and report text are checked on the phone for fast feedback
(`src/model/phone.ts`, `handle.ts`, `report.ts`) and again on the server. Push payloads are validated field by field
(`parsePushData` in `src/model/notificationRoute.ts`, used by `src/api/notifications.ts`). The copy lint (`src/copy/copy.test.ts`) keeps banned words out of screen text.

### Release bundle secret scan (L1, L2)

`apps/mobile/scripts/scan-bundle.ts` scans an `npx expo export` directory. It reads every JS bundle, including Hermes
bytecode, where strings sit as plain text, so it pulls out runs of printable characters and applies the rules in
`apps/mobile/config/bundleScan.ts`: Google API key, AWS access key, private key block, Slack token, GitHub token, Stripe
secret key, Meta access token, JWT, URL with a password, private network URL, and an inline `secret`, `token`, `password`
or `apiKey` assignment. With `--release` it also fails on strings that mean a development or e2e build leaked into the
release (`10.0.2.2`, `com.turnout.app.dev`, `com.turnout.app.e2e`, `turnout-dev://`, `turnout-e2e://`);
`--forbid <text>` adds more. A finding prints the rule, the file, the first four
characters and the length, never the value. Exit code 0 is clean, 1 is a finding, 2 is a usage error or no bundle found.
Images and fonts are skipped.

Wired in two places:

- `bun run scan-bundle <export dir> --release` in `apps/mobile`;
- the `mobile-health` job in `.github/workflows/ci.yml`, step "Export the production bundle and scan it", which exports
  the production Android bundle with placeholder environment values and runs the scan with `--release`. `ci-gate`
  requires it.

Run once, 2026-10-29, on a real export:

```
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_STORYBOOK=0 EXPO_PUBLIC_API_URL=https://api.turnout.example \
  GOOGLE_MAPS_ANDROID_API_KEY=ci-placeholder bunx expo export --platform android --output-dir /tmp/m5-export
bun scripts/scan-bundle.ts /tmp/m5-export --release
scanned 29 files (1 bundle), 0 findings
```

The export took about 37 seconds. To prove the scan can fail, a planted Google-key-shaped string and `10.0.2.2` were
added to a copy of the bundle and both were reported. The strings in the clean bundle that an attacker could read are the
placeholder API URL, and public library strings (`localhost:8081` from React Native, `w3.org` namespaces, the Sentry
ingest host). The first version of the Meta token rule flagged base64 runs in the bytecode (5 false findings); the rule now
needs a token boundary and 100 or more characters. Tests: `config/bundleScan.test.ts` (finds each rule and names it;
shows four characters and a length; passes ordinary bundle text; reports a forbidden string; splits printable runs;
finds a secret in binary and in text).

The scan covers the JavaScript bundle. It does not read the compiled native code or the merged manifest, which is why the
manifest dump in PLATFORM-1 is an owner step. A production build made by EAS uses the real environment values; the scan
in CI uses placeholders, so run the same command once on the real production export before the release
(`docs/release-gate.md`).

## MASVS-RESILIENCE (L1 only)

The plan asks for L1 here, and no R-level controls (root detection, anti-debugging, obfuscation, integrity checks) are
claimed.

### RESILIENCE-1: the app validates the integrity of the platform (not claimed)

No root or jailbreak detection. The data on the phone is a cache that is encrypted and wiped on sign-out, and authorization
is on the server, so a rooted phone gains only what the person on it can already see.

### RESILIENCE-2: the app implements anti-tampering mechanisms (L1 baseline)

Play App Signing signs the release, and Play Protect checks installed apps. The app link file names the Play App Signing
SHA-256 (`docs/plans/mobile-play-release.md`). The app ships Hermes bytecode, not readable JavaScript. The release profiles build the
Gradle release type, with no dev client; only `development` and `e2e` have one, and `config/eas.test.ts` checks the
release profiles pass `assertReleaseEnv`. Source maps are uploaded to Sentry and are
not in the app. Test: the bundle scan with `--release`.

### RESILIENCE-3: the app implements anti-static analysis mechanisms (not claimed)

No obfuscation beyond Hermes bytecode. The bundle holds no secret to protect (CODE-1 scan). The code of
a social app with a public API reveals the API shape, which the server protects with authorization (S19).

### RESILIENCE-4: the app implements anti-dynamic analysis techniques (not claimed)

No debugger or hook detection. Out of scope for the L1 profile.

## MASVS-PRIVACY (supporting)

- Data minimisation and the consent record: `docs/data-map.md` lists every column and why it is kept.
  `docs/privacy-policy.md` is the notice the app shows. The code screen sends the notice version with the
  code (`noticeVersion` in `src/screens/signin/CodeScreen.tsx`), and the server keeps the `consent_record`.
- Location: the walk time on the meet card is computed on the phone from the cafe's coordinates. The phone's position
  is never sent (`group_member.checked_in_at` records the tap only; "No coordinates are sent or kept"). Foreground
  permission only; background location is off in both platforms.
- Telemetry is off until the person turns it on, and turning it off stops Sentry and opts PostHog out (see
  STORAGE-2).
- Delete account in Settings, and by URL for the store (`apps/mobile/store/data-safety.md`).
- Store disclosures: `apps/mobile/store/data-safety.md` traces each Data safety answer to a line of `docs/data-map.md`.

## Owner steps from this review

1. Dump the merged production AAB manifest with `bundletool dump manifest` and compare with
   `apps/mobile/store/permissions.md`.
2. Run the bundle scan on the real production export on the release commit (`docs/release-gate.md`).
3. Read the current Play target API rule on the upload day.
4. Run a dependency audit on the release commit and record it.
5. On a real Android phone, open the chat, report and after screens and confirm the screenshot is blocked and the recents
   thumbnail is blank. The unit tests prove the call; only a device proves the flag.
6. Revisit pinning and the iOS keychain clean-up before iOS ships.
