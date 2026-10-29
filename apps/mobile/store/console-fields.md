# Play Console fields

Plan A27. What goes into each Play Console field that is not the listing text, and what the owner still has to fill in.
Anything in angle brackets is a placeholder. Nothing here is a secret. The reviewer sign-in values are held in the
owner's password manager and pasted into Play Console only.

## Links

| Field | Value | State |
| --- | --- | --- |
| Privacy policy URL | `https://<domain>/privacy` | Placeholder. The server serves `/privacy` (A28 requires it live, see `docs/release-gate.md`). The owner pastes the real domain. |
| Account deletion URL (Data safety, "Delete account URL") | `https://<domain>/delete-account` | The page is built (`src/web/site/DeleteAccount.tsx`, tested by `test/deleteAccountPage.test.ts`). It gives the in-app steps (the You tab, Delete account, a code on WhatsApp), the lists of what is deleted and what is kept (the same lists the app shows, from `@turnout/contract/app/deletion`), and the grievance contact for someone who cannot open the app. Owner step: replace `<domain>` once production is deployed and check the page loads there. |
| Website (optional) | `https://<domain>` | Placeholder. |
| Support email | `<support email>` | Placeholder. Use the same address `GET /config` returns for grievance contact. |

## Reviewer access note (Play "App access")

The app needs a sign-in, so Play asks for working credentials. The note below is what goes in the field. The two
placeholders are filled from the owner's password manager.

```text
Turnout needs a phone number and a 6-digit code to sign in. Use this test account.

Phone number: <REVIEWER_PHONE>
Sign-in code: <REVIEWER_OTP> (this number always accepts this code, no WhatsApp message is sent)

The account already has a profile and a ticket, so no steps are needed to reach Home.
Pick the show on the Home screen to see the plan, the meet card, the group chat and the after screen.
Camera and location are optional. Location is used on the phone only and never sent to us.
```

Owner steps for this to be true (listed in `docs/release-gate.md` as the "reviewer login" item):

1. Create the reviewer account on **production**, not staging, with a phone number the owner controls.
2. Set the reviewer phone and fixed code on the production server through its environment (`REVIEWER_PHONE` and `REVIEWER_OTP`, production only, listed in
   `docs/deploy.md`; do not put the values in the repo). Confirm sign-in works from a clean install of the release build.
3. Give the reviewer a first name, one photo, and a handle. **A person on the team must approve the handle and the
   ticket in the operator tool first**, because the app holds a new member at "waiting for approval" until then. Without
   this the reviewer sees a waiting screen and rejects the build.
4. Add a show and a confirmed group for the reviewer so the plan, chat and after screens are reachable.
5. Re-check all of it on the day of the production submit, and again after any server reset.

## Content rating (IARC questionnaire)

Owner step. Answers that follow from the app, to be confirmed by the owner when they fill the form:

- The app lets people talk to each other (group chat), so answer yes to user interaction and to sharing of personal
  information, and say the chat is private to the group and can be reported.
- No violence, no sexual content, no gambling, no controlled substances, no location sharing with others, no
  purchases.
- It is not a dating app. Do not pick a dating category.

## Target audience

Owner step. The product rules say 18 and over (`docs/design/mobile-board/sources.md`). Pick "18 and over" only, so it
is not a Designed for Families app. The app has no age question at sign-in, so the listing must not say the age is
checked. If the owner wants a stated age on sign-in, that is a product change, not a store field.

## Other forms

| Form | Answer or source |
| --- | --- |
| Data safety | `store/data-safety.md`, line by line from `docs/data-map.md`. |
| Permissions | `store/permissions.md`. The owner dumps the merged manifest from the signed bundle (`bundletool dump manifest`) and compares it to the list there. |
| App category | Social. |
| Ads | No ads. |
| News app, COVID app, government app, financial features, health features | No. |
| Advertising ID | Not used. Answer no. |
| Target API level | Owner step. Play Console shows whether the target meets the current rule on the day. See `docs/release-gate.md`. |
| Closed testing | Owner step. A new personal developer account must run a closed test with at least 12 testers for 14 days before it can apply for production. Start the clock as soon as a build is signed and uploaded. |
| App signing | Owner step. Use Play App Signing, then copy its SHA-256 and SHA-1 into the app link file and the Maps key restriction (see `docs/release-gate.md`). |

## Release plan

Release on a Friday from 12:00 to 18:00 with a 20 percent staged rollout. If the host slot is not open, do not release
(this is a gate item, not a preference).
