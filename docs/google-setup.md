# Google setup: Maps and push

Status: written 2026-10-27 for plan task S27. Every step that needs a Google login is **needs
owner**. `docs/plans/mobile-accounts.md` holds the account table, the key restriction table and the
budget alert rows; this file is the how-to and the checks. It holds no key, no fingerprint value
and no email. Status values are `pending: user`, `submitted`, `active`.

## Two projects, kept apart

| Project | Plan | Holds | Billing |
|---|---|---|---|
| `turnout-push` (Firebase) | Spark | FCM V1 for Android push, opened when push work starts in M3 | Never linked |
| `turnout-maps` (Google Cloud) | A billing account used for Maps only | The Maps SDK for Android key | Linked, with a budget |

They stay separate because linking a billing account to a Firebase project moves it to the Blaze
plan (https://firebase.google.com/docs/projects/billing/firebase-pricing-plans). Keeping billing
only on `turnout-maps` means push can never start costing money by accident.

## Steps

| # | Step | Who | Status |
|---|---|---|---|
| 1 | Create the Firebase project `turnout-push` on Spark. Do not add a billing account | owner | pending: user |
| 2 | Create the Google Cloud project `turnout-maps` and link the billing account to it only | owner, billing | pending: user |
| 3 | In `turnout-maps` enable one API: Maps SDK for Android. Leave every other API off | owner | pending: user |
| 4 | Create the key `turnout-android-maps` with the restrictions below (https://developers.google.com/maps/documentation/android-sdk/get-api-key) | owner | pending: user |
| 5 | Create a budget of 500 INR a month with email alerts at 50, 90 and 100 percent, sent to the `operator` role (https://cloud.google.com/billing/docs/how-to/budgets) | billing | pending: user |
| 6 | Put the key in EAS as a sensitive variable for development, preview and production, and in git-ignored `apps/mobile/.env.local` for local runs. Name: `GOOGLE_MAPS_ANDROID_API_KEY` | owner | pending: user |
| 7 | In M3, add the Android app to `turnout-push`, upload the FCM V1 service account key to EAS credentials, and keep `google-services.json` as an EAS file variable | owner | n/a until M3 |

## Key restrictions

- API restriction: Maps SDK for Android, and nothing else.
- Application restriction: Android apps, one row per package and SHA-1 pair. The pairs are in
  `docs/plans/mobile-accounts.md`. The `.e2e` build variant gets no key and shows the
  "map unavailable" card.
- Get an EAS keystore SHA-1 with `eas credentials`. Get the Play App Signing SHA-1 and SHA-256
  from Play Console, App integrity, App signing.

## The cafe link needs no key

The meet card's "open in Maps" action is a keyless URL the device hands to its maps app:
`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`
(https://developers.google.com/maps/documentation/urls/get-started). The server never stores a
member's location and never calls a Google API.

## A budget is not a cap

The alert emails do not stop spend. If an alert arrives, follow the Maps section of
`docs/runbook.md`: disable the API, read usage, check the key restrictions.

## Acceptance (needs the accounts, so not run here)

- The FCM project is on Spark with no billing account.
- A web service call made with the Android key is denied.
- Only Maps SDK for Android is enabled in `turnout-maps`.
- The budget thresholds and recipients are shown in the console.
- `docs/plans/mobile-accounts.md` rows for these accounts move to `active` with a date.
