# Data safety answers

Plan A27. For the Play Console "Data safety" form. Every answer cites the `table.column` rows of `docs/data-map.md` it
comes from, and `config/storeListing.test.ts` fails when a cited column is not in that file. If a column is added or
changes who sees it, the answer here changes in the same commit. Last traced 2026-10-29 against the data map and
`docs/privacy-policy.md` (notice version 2026-10-26).

Google's words, used below: "collected" means sent off the phone to us or a service we use. "Shared" means handed to
another party who is not only processing it on our behalf. Data used only on the phone is not collected.

## Form-level answers

| Question | Answer | Why |
| --- | --- | --- |
| Does the app collect or share any of the required user data types? | Yes | Table below |
| Is all of the user data collected by your app encrypted in transit? | Yes | TLS only; no cleartext in release builds (`docs/security/masvs-app.md`, NETWORK-1) |
| Do you provide a way for users to request that their data is deleted? | Yes | Delete account on the You tab (a code is sent on WhatsApp); and the account deletion URL in `console-fields.md` |
| Is the app designed for children? | No | Owner confirms the target age in Play Console; the notice does not state an age |
| Data from outside the app, or sold | No | "We do not sell your data and we do not show advertising" (`docs/privacy-policy.md`) |

## Data types collected

Required means the app cannot do its job without it and the person cannot turn it off. Optional means the person can use
the app without it.

| Play category and type | Collected | Shared | Required or optional | Purposes to tick | Cited rows in `docs/data-map.md` | How long (from the data map) |
| --- | --- | --- | --- | --- | --- | --- |
| Personal info > Phone number | Yes | Yes, with Meta (the WhatsApp message carries it) | Required | App functionality, Account management, Fraud prevention, security and compliance | `member.phone_e164` ("The sign-in identity and where the code is sent"); `otp_challenge.phone_hash` (keyed hash, 1 day); `otp_challenge.wamid`; Third parties: Meta (WhatsApp Cloud API) "The phone number and the sign-in code" | Until the account is deleted; `member.phone_e164` is nulled on the tombstone |
| Personal info > Phone number (the ban hash) | Yes, as a keyed hash only | No | Required for banned and stopped people only | Fraud prevention, security and compliance | `ban_list.phone_hash` ("HMAC-SHA256 of the E.164 number with `BAN_PEPPER`"; "the phone cannot be read back from it"); `ban_list.reason` | Until the operator lifts it |
| Personal info > Name | Yes (first name only) | No | Required | App functionality | `profile.first_name` ("Shown to a group from three hours before the show") | Until the account is deleted |
| Photos and videos > Photos (profile photo) | Yes | No | Required | App functionality, Fraud prevention, security and compliance | `profile.photo_key`; Object store `photos/<opaque id>.jpg` ("re-encoded to a 1080 px JPEG without EXIF") | Until deletion or replacement |
| Personal info > Other info (gender) | Yes | No | Required | App functionality (which groups the person can join) | `profile.gender` ("Never shown to co-members"); `profile.group_pref` | Until the account is deleted |
| Personal info > User IDs (Instagram or LinkedIn handle, and the member id) | Yes | No | Required | App functionality, Fraud prevention, security and compliance | `social_handle.handle` ("The member, operator only. Never a co-member"); `social_handle.kind`; `social_handle.status`; `member.id` | Until the account is deleted or banned (the handle); the member id stays as the tombstone id |
| Photos and videos > Photos, and Files and docs > Files and docs (ticket screenshot or PDF) | Yes | No | Required to join a group | App functionality, Fraud prevention, security and compliance | `ticket_proof.object_key` ("Never in an app response"); `ticket_proof.mime`; `ticket_proof.sha256`; `ticket_proof.status`; Object store `tickets/<ulid>.<ext>` ("The operator only") | The file is deleted at the latest 24 hours after the show starts, 24 hours after an unanswered rejection, and at once on withdrawal or deletion |
| Messages > Other in-app messages (group chat) | Yes | No | Optional (the person chooses to write) | App functionality | `message.body` ("The text, 1 to 1,000 characters"); `message.member_ref`; `message.client_id` | 30 days after the show; longer while a report on the group is open |
| Messages > Other in-app messages (reports and "I didn't feel comfortable") | Yes | No | Optional | App functionality, Fraud prevention, security and compliance | `report.body` ("What the reporter wrote"); `report.message_id`; `report.reporter_gender`; `report.subject_gender`; `downvote.voter_id`; `downvote.target_id` | A report: 1 year after it is closed. A downvote: until either person is deleted |
| App activity > App interactions (plans, check-in) | Yes | No | Required | App functionality | `plan.state`; `plan.event_id`; `plan.group_type`; `group_member.checked_in_at` ("No coordinates are sent or kept"); `thread_presence.seen_at`; `notice.kind` | Until the account is deleted (notices: 30 days) |
| App activity > App interactions (usage analytics) | Yes, only after the person turns on "Share usage data" | No (PostHog processes it for us) | Optional | Analytics | Not in the data map: the app sends five typed events (`app_opened`, `show_viewed`, `buy_tapped`, `go_tapped`, `im_here_tapped`) carrying show or plan ids only, no autocapture, no recordings, no person id (`src/analytics/events.ts`, `posthog.ts`) | Set by the PostHog project; owner records the retention |
| App info and performance > Crash logs, Diagnostics | Yes, only after "Share usage data" | No (Sentry processes it for us) | Optional | Analytics, App functionality | Not in the data map: Sentry with `sendDefaultPii: false`, scrubbed events, no screenshots, no replay (`src/analytics/sentry.ts`, `scrub.ts`) | Set by the Sentry project; owner records the retention |
| Device or other IDs (push token) | Yes, Android only until iOS push exists | Yes, with Expo (push service) and Google FCM behind it | Optional (the person can refuse the notification permission) | App functionality | `device.expo_token`; `device.platform`; `device.session_id`; `notice.push_state`; Third parties: Expo and Google FCM "The device's push token and a generic title and body with the notice kind and two ids" | Until sign-out, deletion or `DeviceNotRegistered` |
| Consent record | Yes | No | Required | Account management, Fraud prevention, security and compliance | `consent_record.notice_version`; `consent_record.given_at` | 1 year after the account ends, under a number that does not name the person |

## Data types not collected

| Play type | Answer | Why |
| --- | --- | --- |
| Location (approximate or precise) | Not collected | The app asks for foreground location only to show the walk time to the cafe. The position stays on the phone: the check-in records the tap, "No coordinates are sent or kept" (`group_member.checked_in_at`). The cafe and venue coordinates (`show_group.cafe_lat`, `show_group.cafe_lng`, `plan.venue_lat`) are places, not the person |
| Email address, Address, Race and ethnicity, Political or religious beliefs, Sexual orientation | Not collected | No column holds them |
| Financial info, Health and fitness | Not collected | Tickets are bought elsewhere (`buy_tapped` opens the seller's page) |
| Contacts, Calendar | Not collected | No permission asked |
| Audio, Camera, Videos | Not collected | Camera and microphone permissions are blocked (`permissions.md`) |
| Web browsing history, Search history | Not collected | No column holds them |
| Advertising ID | Not collected | No advertising SDK |

## Notes the owner needs

1. Phone, push token, handle and the retention answers are the ones Google reviewers look at. Each is a row above with its
   source line; if the data map changes, change this file first.
2. Meta, Expo and Google FCM are declared as sharing because the data map and the privacy notice name them as receiving
   the data. Google's definition excludes a service provider that only processes data for us, so a stricter reading could
   mark them "not shared". Declaring sharing is the safer answer, so it is the one written. The owner may choose the
   stricter reading; if so, change the notice wording and this file together.
3. Sentry and PostHog are marked "not shared" because they only process for us and run only after consent. Their
   retention is set in their own consoles and is not in the data map: the owner fills it in before submitting.
4. Data that stays after account deletion, as the privacy notice says: the consent record (1 year, under a number that
   does not name the person), reports and downvotes against other people (ids only), the ban hash, and Litestream
   copies of rows that age out within 7 days. Answer "Yes, users can request deletion" and describe these exceptions in
   the deletion page text.
5. The form is entered in Play Console by hand on Wed 11-11 (`docs/plans/mobile-play-release.md`). Nothing here submits it.
6. The `docs/release-gate.md` item "Data safety matches `docs/data-map.md`" is ticked only after the owner has entered
   this form and re-read it against the data map on the release commit.
