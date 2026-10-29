# Release gate

Plan A28. The release goes to production on a Friday from 12:00 to 18:00 at a 20 percent staged rollout
(`docs/plans/mobile-play-release.md`). It goes only when every line below is **Done** with its evidence, or is an
**Owner step** that the owner has done and signed with the date and the commit. One open line blocks the release.

How to read the table: "Done" means the work is in the repo and a test or a file shows it. It does not mean the
check ran on the release commit. Lines that must be re-run on the release commit say so. "Owner step" means it needs a
person, a phone, a Play Console login or a production secret that this repo does not have.

State on 2026-10-29: the repo-side items are done or have a test. The owner steps, the baselines and the production
checks are open. The release is not ready.

## The gate

| # | Item | Status | Evidence, or what the owner does |
| --- | --- | --- | --- |
| 1 | Every required check is green on the release commit, including the iOS simulator run | Owner step (re-run on the release commit) | `.github/workflows/ci.yml`. The `ci-gate` job needs `check`, `secrets`, `e2e-web`, `mobile-health`, `build-android`, `build-ios`, `android-device` and `ios-device`. Read the run for the release commit and confirm each of those is `success`. `ci-gate` also accepts `skipped`, so open the run and confirm the device jobs were not skipped by the path filter. The iOS run is a simulator run only (`ios-device`); there is no real iPhone in the loop. |
| 2 | Visual baselines complete for every screen and state | **Open. Not done.** | No baseline is committed. `apps/mobile/.maestro/visual/stories.json` lists 10 stories: the 8 listing screens and the two sign-in error states (`src/visualStories.test.tsx` checks each one renders). Run `android-device` and `ios-device`, accept with `scripts/visual-accept.ts <run-id>`, and check that every target (`android-small`, `android-large`, `ios-small`, `ios-large`), theme (light, dark) and text size (default, largest) has a file. `store/screenshots.md` lists the extra stories the listing needs. |
| 3 | `expo-doctor` is clean | Done in CI, re-run on the release commit | The `expo-doctor` step of `mobile-health` in `.github/workflows/ci.yml`. Locally `bun run doctor` in `apps/mobile`. `DECISIONS.md` records the 20 of 20 pass and the two packages kept in `expo.install.exclude`. |
| 4 | No open high-severity S23 or A26 finding | A26 done. S23 owner step | A26: `docs/security/masvs-app.md`. It found one high gap, the group chat could be screenshotted, and fixed it (`apps/mobile/src/ui/captureRoutes.test.ts`). It also fixed `allowBackup` and three unused permissions (`apps/mobile/config/appConfig.test.ts`). No A26 finding is left open at high. The S23 findings list is not in this repo, so the owner confirms none is open at high. The server side of A26 is `docs/security/masvs-server.md`. |
| 5 | The full loop by hand on a real mid-range Android phone in light, dark and the largest text size | Owner step | The loop is: install the production build from the closed track, sign in with a code, finish the profile, join a show, get a group, check in, chat, report, after screen, delete the account. Run it three times (light, dark, largest text). Also run it on the iOS simulator. Use `apps/mobile/A11Y.md` for TalkBack, VoiceOver, Reduce Motion and Reduce Transparency, and `apps/mobile/PERF.md` for the cold start and time to Home numbers on the reference phone. Write the result and the phone model in the table at the end of this file. |
| 6 | The chat, report and after screens block screenshots on a real phone | Owner step | Unit proof: `apps/mobile/src/ui/captureRoutes.test.ts`. Only a phone proves the flag works, so try a screenshot and open the recents list on each of the three screens. |
| 7 | Every route traces to the board | Done, runs in CI | `apps/mobile/src/boardTrace.test.ts` reads the step ids in `docs/design/mobile-board/board.html` and fails when a route file in `src/app` has no `// Board: B<step>` line or names an unknown step. Runs in `bun run check`. |
| 8 | Production `GET /config` returns the real grievance officer details | Owner step | The owner sets `GRIEVANCE_*` on production (`docs/deploy.md`, due Mon 11-09 in the plan). Then `curl https://<api-domain>/config` and read the grievance fields. Placeholder or empty values block the release. The app shows these on the grievance screen. |
| 9 | `/privacy` is live on the production domain | Owner step | The page is served by `src/web/site/Privacy.tsx`. After deploy, `curl -I https://<domain>/privacy` answers 200, and the text matches the version the app shows in Settings, Privacy. Put the URL in `store/console-fields.md`. |
| 10 | The public account deletion page exists and is live | Done in the repo; going live is an owner step | `/delete-account` is served next to `/privacy` (`src/web/site/DeleteAccount.tsx`, `test/deleteAccountPage.test.ts`). Owner step: deploy, open `https://<domain>/delete-account`, check the grievance details show, and enter the URL in Data safety. Deleting from inside the app works and is tested. |
| 11 | The Data safety form matches `docs/data-map.md` | Done in the repo. Form entry is an owner step | `apps/mobile/store/data-safety.md` traces each answer to a `table.column` in `docs/data-map.md`. `apps/mobile/config/storeListing.test.ts` fails if a cited column is not in the data map. The owner enters the answers in Play Console and reads the form back against the file. If `docs/data-map.md` changes, the form changes with it. |
| 12 | The listing text makes no claim the product does not keep | Done | `apps/mobile/store/listing/en-IN/*.txt`. `storeListing.test.ts` checks the Play length limits (30, 80, 4000) and rejects "verified", "ID check" and "KYC". |
| 13 | The permission strings and the production permission list are right | Done in the repo. Merged manifest is an owner step | `apps/mobile/store/permissions.md` and `apps/mobile/config/appConfig.test.ts`. The owner dumps the merged manifest from the signed bundle (`bundletool dump manifest`) and compares it to the list. Any permission not on the list blocks the release. |
| 14 | The reviewer login works on production and is entered in Play "App access" | Owner step | `store/console-fields.md` has the note and the steps: set `REVIEWER_PHONE` and `REVIEWER_OTP` on production (`docs/deploy.md`), approve the reviewer's handle and ticket in the operator tool, give the account a show and a group, and sign in from a clean release install. Do it again on the submit day. |
| 15 | The release bundle has no secret in it | Done once. Owner step on the release commit | `apps/mobile/scripts/scan-bundle.ts` (rules in `apps/mobile/config/bundleScan.ts`, tests in `bundleScan.test.ts`). CI runs it on every push in `mobile-health`. On 2026-10-29 it scanned an `expo export` of the production variant: 29 files, 1 bundle, 0 findings, and a planted key was caught. For the gate, run `cd apps/mobile && APP_VARIANT=production bunx expo export --platform android --output-dir /tmp/turnout-export && bun scripts/scan-bundle.ts /tmp/turnout-export --release` on the release commit, with the production values for `EXPO_PUBLIC_API_URL` and the Maps key (the CI step uses placeholders), and attach the line it prints. |
| 16 | The dependency audit is clean at high severity | Owner step | Run `bun audit` on the release commit and record the result below. Fix or write down each high finding. |
| 17 | `targetSdkVersion` meets Play's current rule | Owner step | Read the rule on the upload day (https://developer.android.com/google/play/requirements/target-sdk) and compare it to the merged manifest. Play Console shows the same check on upload. |
| 18 | Play App Signing keys are on the app link file and the Maps key | Owner step | After the first upload (plan date Fri 11-06), copy the Play App Signing SHA-256 to `APP_LINKS_ANDROID_SHA256` and the SHA-1 to the Maps key restriction. Install a build from the Play track and confirm a link opens the app and the map draws. The upload key's hashes are not the ones to use. |
| 19 | The closed test rule is met | Owner step | At least 12 testers opted in for 14 days (the plan targets 15 to 20, start Mon 11-16). Count only, no names, in the roster table in `docs/plans/mobile-play-release.md`. Then apply for production access (plan date Mon 11-30). |
| 20 | The content rating, target age and app category are filled | Owner step | `store/console-fields.md`. |
| 21 | The screenshots, the icon and the feature graphic are uploaded | Owner step | `store/screenshots.md`. The screenshots come from accepted baselines (item 2). The 512 by 512 icon and the 1024 by 500 feature graphic are made by the owner. |
| 22 | The host slot is open: Friday 12:00 to 18:00 | Owner step. **Blocks the release if not open** | Confirm with the host before starting the rollout. If the slot is not open the release waits for the next one. Do not release outside it. |
| 23 | Staged rollout set to 20 percent, with a way back | Owner step | In Play Console, create the production release at 20 percent. Watch crashes (Sentry) and the sign-in rate for the first day before raising it. If something is wrong, halt the rollout in Play Console; a fix goes out as a new build or an EAS Update. |

## Things this gate does not claim

- No test here proves the app works on a real phone. Items 5, 6 and 18 are the real-device checks.
- Resilience is at MASVS L1 only (`docs/security/masvs-app.md`). There is no root check, no anti-debug and no
  obfuscation claim.
- There is no certificate pinning in v1. The reasons are in `docs/security/masvs-app.md` under NETWORK-2.
- Nothing here checks the age, the identity or the safety of a member. The listing and the app do not claim it.

## Sign-off

Fill in at release time. One row per owner step, with the date, the commit and who did it.

| Item | Date | Commit or build | Result | Who |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 5 (phone model, light, dark, largest text) | | | | |
| 15 (scan line) | | | | |
| 16 (audit result) | | | | |
