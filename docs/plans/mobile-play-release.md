# Turnout mobile: Google Play release schedule

Status: Week 1 draft, 2026-10-27. Plan F25. This file holds the dated schedule and the closed
test tester count. It never holds tester names, emails or phone numbers; the roster lives with
the user, outside the repo.

## The rule

Quoted from https://support.google.com/googleplay/android-developer/answer/14151465:

> "At least 12 testers must be opted in to your closed test when you apply for production access, and they must have been opted in continuously for the preceding 14 days."

Consequences for the plan:
- The 14 days run per tester. A tester who opts out and back in restarts their own 14 days.
- Turnout starts the closed test with 15 or more testers (target 20) so a few drop-outs do not
  break the 12.
- If the opted-in count falls below 13 at any point, recruit at once.

## Schedule

| Date | Step | Latest | Status |
|---|---|---|---|
| Mon 10-26 | Play account created, identity verification submitted | | pending: user |
| Fri 11-06 | App created; first `production` AAB uploaded by hand to internal testing (https://docs.expo.dev/submit/android/); Play App Signing on. Its SHA-256 goes to `APP_LINKS_ANDROID_SHA256`, its SHA-1 to the Maps key | | planned |
| Mon 11-09 | User gives the grievance officer details (`GRIEVANCE_*`) | Tue 11-10 | planned |
| Wed 11-11 | Closed track with a Google Group; listing draft; content rating; Data safety; privacy URL `https://<domain>/privacy`; app access with `REVIEWER_PHONE` and `REVIEWER_OTP` | | planned |
| Mon 11-16 | Closed test starts with 15 or more testers opted in (target 20) | Wed 11-18 | planned |
| Weekly from 11-16 | A new closed build or an EAS Update | | planned |
| Mon 11-30 | 14 days complete; apply for production access | Wed 12-02 | planned |
| Wed 12-09 | Production access granted | | planned |
| Fri 12-18 | Production release after the A28 gate, staged rollout at 20 percent | | planned |

The "latest" dates are the slack. If the closed test starts on 11-18, the 14 days end on 12-02,
and the release still fits. Past that, the release moves past 12-18.

## Checks before the first upload

- `targetSdkVersion` meets Play's target API rule: https://developer.android.com/google/play/requirements/target-sdk.
  Read the current requirement on the day of the upload, because the required level changes
  once a year; do not rely on the number the scaffold produced.
- The map renders on the first Play install. The Play App Signing SHA-1 must be on the Maps key
  first (`docs/plans/mobile-accounts.md`), or the map is blank on installs from Play.
- The app link file uses the Play App Signing SHA-256, not the upload key's.

## Tester roster

Count only. Update the numbers; do not add names.

| Date | Opted in | Opted in 14 days or more | Action |
|---|---|---|---|
| 2026-11-16 (planned start) | | | Need 15 or more |

Weekly check from 11-16: if "opted in" is below 13, recruit that day. On Mon 11-30, "opted in 14
days or more" must be 12 or more before applying.
