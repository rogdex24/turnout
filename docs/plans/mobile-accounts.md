# Turnout mobile: accounts and secrets

Status: Week 1 draft, 2026-10-27. Plan F1. The user opens every account; the engineer fills in
the status column as each one is confirmed. This file holds no personal emails, no names, no
phone numbers and no secret values. Where an account needs a login, the table names the role
that holds it.

## Roles

| Role | What it is |
|---|---|
| `owner` | The project owner login: a shared project mailbox on the Turnout domain, not a personal address. Holds account ownership and recovery, with two-factor sign-in |
| `billing` | The role that holds payment methods (Google Cloud billing, Meta prepaid balance). May be the same person as `owner`; the login is still separate from any personal account |
| `ci` | The GitHub Actions identity. It holds only the secrets listed below and never a personal token |
| `operator` | The person who runs the admin queue and the host. Receives alert mail and the Maps budget alert |

Status values: `pending: user` (not confirmed yet), `submitted` (waiting on the vendor),
`active` (confirmed by the user), `n/a`. Every row starts at `pending: user` because nothing
below has been confirmed to the engineer yet.

## Accounts

| Account | Plan or setting | Login held by | Status | Needed for |
|---|---|---|---|---|
| Google Play Console | Individual developer account, $25 once. Identity verification submitted on day 1 (Mon 10-26) | `owner` | pending: user | F25, Play internal by Fri 11-06 |
| Expo organisation `turnout` | Free plan: 15 builds per platform a month, EAS Update to 1,000 MAU | `owner` | pending: user | F18, EAS builds and updates |
| Google Cloud project `turnout-maps` | Billing account used for Maps only; a Maps budget alert at 500 INR, alerts only (S27) | `owner` for the project, `billing` for the billing account | pending: user | The Maps key, F1 acceptance |
| Firebase project `turnout-push` | Spark plan, never linked to billing. Opened when push work starts in M3 | `owner` | n/a until M3 | FCM V1 for Android push |
| Sentry | Developer plan, free, 5,000 errors a month | `owner` | pending: user | Error reports, decided in M2 |
| PostHog | Free tier, 1M events a month, no card | `owner` | pending: user | Analytics, decided in M2 |
| Renovate GitHub app | Installed on the repo, config in `renovate.json` | `owner` (GitHub organisation or repository admin) | pending: user | F23 |
| GitHub repository settings | After the public flip: ruleset with required check `ci-gate`, fork-PR approval, secret scanning, push protection | `owner` | pending: user | F21, F27 |
| Meta Business portfolio | Business verification requested on day 1 (Mon 10-26); the dedicated number, the authentication template, the first UPI top-up and the system user token follow (S28) | `owner` for the portfolio, `billing` for the prepaid balance | pending: user | Real sign-in codes |
| Google Group for the closed test | A group the testers join, created before the closed track on Wed 11-11 | `owner` | pending: user | F25 |
| Apple Developer Program | No account in v1. Trigger: the user decides to launch on iOS; enroll at least 3 weeks before that release (F26) | n/a | n/a | Not needed in v1 |

## Where each secret lives

No secret is committed. `.env.example` holds names only. No pull request job has a secret, fork
PRs need approval to run, and nothing runs `pull_request_target` with PR code.

| Secret or key | Lives in | Not in | Notes |
|---|---|---|---|
| `GOOGLE_MAPS_ANDROID_API_KEY` | EAS sensitive variable, set for the development, preview and production environments; and git-ignored `apps/mobile/.env.local` for local runs | The repo, CI logs, the `.e2e` build | Restricted key, see the table below. The `.e2e` variant gets no key and shows the "map unavailable" card |
| `EXPO_TOKEN` | GitHub Actions secret | Any other workflow | Used only by `eas-update.yml` and `eas-build.yml` |
| `google-services.json` | EAS file variable | The repo (git-ignored) | Opened in M3 with the Firebase project `turnout-push` |
| FCM V1 service account key | EAS credentials for the Android app | The repo, the host | Uploaded to EAS in M3 |
| Android upload keystore, development and preview keystores | EAS credentials | The repo | Their SHA-1 values go to the Maps key restriction; the values themselves are not secret |
| Play service account key for `eas submit` | Open: the plan does not say where it lives. Proposed: EAS credentials | The repo | Not needed for the first upload, which is done by hand (F25). Decide before the first `eas submit` |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_TEMPLATE_NAME` | Host environment | The repo, EAS, CI | The system user token comes from the Meta business portfolio (S28) |
| `BAN_PEPPER`, `FILE_LINK_SECRET`, the ES256 key pair that signs access tokens | Host environment | The repo, EAS, CI | Server only |
| `STAGING_TEST_TOKEN` | Staging host environment only | The production route table | Guards `POST /__test/otp` and `POST /__test/clock` |
| `OPERATOR_ALERT_WEBHOOK_URL`, `GRIEVANCE_*` | Host environment | The repo | Production refuses to start without `GRIEVANCE_*` |
| `REVIEWER_PHONE`, `REVIEWER_OTP` | Host environment, and Play Console app access | The repo | For Google's review; values are given by the user on Wed 11-11 |
| `APP_LINKS_ANDROID_SHA256` | Host environment | n/a | The Play App Signing SHA-256; not secret, set after the first Play upload |
| `SENTRY_DSN` | Host environment for the server; the app key is decided in M2 | The repo | |
| PostHog project key | Decided in M2 | The repo | |

## Maps key restriction

The key is named `turnout-android-maps`, in the Google Cloud project `turnout-maps`. The API
restriction is one API: Maps SDK for Android. The application restriction is Android apps, with
one row per package and SHA-1 pair. Fingerprints are placeholders until the user adds them;
this file never holds a real value.

| Package | SHA-1 slot | Fingerprint | Status | Due |
|---|---|---|---|---|
| `com.turnout.app.dev` | EAS development keystore | `<sha1: eas development keystore>` | pending: user | Fri 10-30, from the first EAS build (F18) |
| `com.turnout.app.dev` | Local debug keystore | `<sha1: local debug keystore>` | pending: user | Fri 10-30 |
| `com.turnout.app.preview` | EAS preview keystore | `<sha1: eas preview keystore>` | pending: user | Fri 10-30 |
| `com.turnout.app` | Upload key | `<sha1: play upload key>` | pending: user | Fri 10-30 |
| `com.turnout.app` | Play App Signing key | `<sha1: play app signing key>` | pending: user | Fri 11-06, after the first Play upload (F25) |
| `com.turnout.app.e2e` | none | none | n/a | The `.e2e` variant gets no key |

Get an EAS keystore SHA-1 with `eas credentials` (Android, then the build profile). Get the Play
App Signing SHA-1 and SHA-256 from Play Console, App integrity, App signing. A wrong SHA-1 shows
a blank map and an authorization error in `adb logcat`; the F8 spike checks that on purpose.

## Budget alerts

The plan sets the alerts; the numbers here follow the plan.

| Alert | Threshold | Where | Status |
|---|---|---|---|
| Google Cloud budget, Maps | 500 INR | Google Cloud billing budget on `turnout-maps` | pending: user |
| Total paid spend | 500, 1,000 and 1,500 INR a month, against the 2,000 INR cap in SPEC 9.1 | Alert mail to `operator` | pending: user |

A budget alert is not a spending cap. Acceptance for F1 includes the alert test email arriving at
the `operator` role.

## Needs owner: server side (M2)

Added 2026-10-27 with the M2 server work. The code runs against fakes until each row is done.
Names only; no value is written here.

| Item | What the owner does | Where the steps are | Status |
|---|---|---|---|
| Host slot | Say which host runs the server (and its replica type for Litestream). Blocks S21, the webhook and HTTPS | `docs/deploy.md` | pending: user |
| DNS | Point the domain and `staging.<domain>` at the host. Later, `go.<domain>` for the share link | `docs/deploy.md` | pending: user |
| Meta business portfolio, verification, dedicated number, prepaid top-up, authentication template, system user token | Do steps 1 to 7 in the table; put the token in `WHATSAPP_ACCESS_TOKEN` on the host only | `docs/meta-setup.md` | pending: user |
| WhatsApp webhook registration | Register `https://<domain>/api/app/v1/webhooks/whatsapp` once the host serves HTTPS; choose `WHATSAPP_VERIFY_TOKEN` | `docs/meta-setup.md` | blocked: host slot |
| Server secrets | Generate `OTP_PEPPER`, `BAN_PEPPER`, `FILE_LINK_SECRET` and the ES256 pair on the host | `docs/deploy.md`, `.env.example` | blocked: host slot |
| Grievance officer details | Set `GRIEVANCE_NAME`, `GRIEVANCE_ADDRESS`, `GRIEVANCE_EMAIL`, `GRIEVANCE_PHONE` on the host. Production will not start without them. They are published through `/privacy`, not in the repository | `docs/open-questions.md` Q10 | pending: user |
| Privacy policy review | Read `docs/privacy-policy.md` (the `/privacy` page) and confirm it with whoever advises on the DPDP Act before launch | `docs/privacy-policy.md` | pending: user |
| Alert destination | Pick a chat webhook or a mailbox for `OPERATOR_ALERT_WEBHOOK_URL` | `docs/runbook.md` | pending: user |
| Google Cloud, Firebase, Maps key, budget | Steps 1 to 7 | `docs/google-setup.md` | pending: user |
| Reviewer login | Choose `REVIEWER_PHONE` and `REVIEWER_OTP` for Google's review and enter them in Play app access | `docs/deploy.md` | pending: user |
| Staging token | Generate `STAGING_TEST_TOKEN` on the staging host only | `docs/deploy.md` | blocked: host slot |
| Photo backup choice | Decide whether to back up the files directory, since photos are outside the Litestream backup | `docs/deploy.md` | pending: user |
| HEIC check on a real phone | Upload an iPhone HEIC photo through the app. The server sniffs it and decodes with `Bun.Image`, which could not be exercised on the Linux build machine | `DECISIONS.md` | pending: user |

## Needs owner: what the scaffold (F12 to F21) left open

The mobile scaffold builds and tests without any account. Each item below is something only the
owner can do, and what stays off until it is done. Status values are as above.

| Item | What to do | Unlocks | Status |
|---|---|---|---|
| Expo organisation and project | Create the `turnout` organisation and an EAS project for `apps/mobile`. Run `eas init` once, from `apps/mobile`, as the `owner` login | `eas-update.yml` and `eas-build.yml` | needs owner |
| `EAS_PROJECT_ID` | Add the project id as a GitHub repository variable (not a secret). `app.config.ts` reads it into `extra.eas.projectId`, and both EAS workflows are skipped while it is empty | The same two workflows | needs owner |
| `EXPO_TOKEN` | Create an access token in the Expo account (a robot token for the organisation) and add it as a GitHub repository secret. Only `eas-update.yml` and `eas-build.yml` read it. No pull request job has it | The same two workflows | needs owner |
| EAS environment variables | In the EAS project, set `EXPO_PUBLIC_API_URL` (plain text) and `GOOGLE_MAPS_ANDROID_API_KEY` (sensitive) for the `preview` and `production` environments, and `EXPO_PUBLIC_API_URL` for `development` | `preview` and `production` builds. The config throws without both | needs owner |
| API host | Decide the API host name. It is the value of `EXPO_PUBLIC_API_URL`. The plan leaves it open until the host slot is found (S21) | The variable above | needs owner |
| Maps key and SHA-1s | Create the restricted key as in "Maps key restriction", then add the SHA-1 rows after the first EAS build | A working map on the `dev`, `preview` and production builds | needs owner |
| `google-services.json` | Create the Firebase project `turnout-push` when M3 starts and add the file as an EAS file variable | Android push | needs owner (M3) |
| Sentry and PostHog | Open both accounts and give the engineer the project keys through EAS variables. The packages are installed and not initialised | Error reports and analytics | needs owner (M2) |
| Icons and store assets | Provide the app icon, the adaptive icon foreground and the splash mark. The scaffold has none, so `expo prebuild` uses the Expo defaults | Preview and store builds. Play listing assets are F25 | needs owner |
| Git LFS on the repository | Confirm Git LFS is enabled for the GitHub repository and that its bandwidth allowance covers the visual baselines | `visual-compare.sh` once baselines exist | needs owner |

### First CI run

The CI jobs for the device matrix, the repack step and the three new workflows were written
against the documentation and checked with `actionlint` and `maestro check-syntax`. None of them
has run on a GitHub runner, because the scaffold was built in a session with no GitHub runner. Expect the first run
to need fixes. Do these in order, on a branch, and fix what fails before relying on the gate:

1. Open a pull request that touches `apps/mobile`. `mobile-health`, `build-android` and `build-ios` should pass. `build-ios` is the longest and the likeliest to need an Xcode or runtime change; the runner image is `macos-26` and the simulator runtime is pinned as iOS 26.2.
2. The four device jobs (`android-small`, `android-large`, `ios-small`, `ios-large`) then run the launch and smoke flows. The Android jobs need KVM; GitHub's standard Linux runners provide it.
3. Run the visual capture once and read the artifact `visual-shots-<target>`. Accept the first set with `bun scripts/visual-accept.ts <run-id>` and commit the Git LFS files it writes. Until then `visual-compare.sh` prints a notice and passes. No baseline exists, and none could be made without an emulator.
4. Start `mobile-canary.yml` by hand once (it also runs on Mondays at 03:00 UTC) and check that it passes.
5. After the first green run, record the wall time of each job in `docs/plans/mobile-ci-budget.md`.

## Needs owner: server side (M3)

Added 2026-10-28 with the M3 server work. The code runs against fakes until each row is done.
Names only; no value is written here.

| Item | What the owner does | Where the steps are | Status |
|---|---|---|---|
| Expo account and project | Create an Expo account and project so the app can get push tokens. Blocks real push | `docs/plans/mobile-stack.md` | needs owner |
| Firebase project `turnout-push` | Create the Firebase project and the FCM V1 server credential for the Android app and upload it to Expo. Blocks real push on Android | `docs/google-setup.md` | needs owner |
| Expo access token | Only if enhanced push security is turned on: put the token in `EXPO_ACCESS_TOKEN` on the host | `docs/deploy.md` | needs owner |
| Push sender | Set `PUSH_SENDER=expo` on staging when the items above are done. Production always uses `expo` | `docs/deploy.md` | blocked: Expo account |
| Admin file links | Put the same `FILE_LINK_SECRET`, `OBJECT_STORE` and `FILES_DIR` on the admin process as on the server | `docs/deploy.md` | blocked: host slot |
| Ticket and handle review | Someone opens the admin queues at least twice a day and inside the 12 hour handle alert | `docs/runbook.md` | needs owner |
