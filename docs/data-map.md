# Data map

What Turnout stores about people, why, where, who can see it and for how long. One row per column of every
table in `src/social/schema.ts`. `test/socialSchema.test.ts` reads `PRAGMA table_info` for each social table
and fails when a column is missing from this file or listed here but gone from the schema. It covers the
tables below; each later milestone adds its tables here in the same commit.

"Where" is the SQLite file on the server host (`DB_PATH`), or the object store (`FILES_DIR` or the S3 bucket).
"Who sees it" lists people and systems. The operator is the single owner of the service. Co-members are the
other people in a group.

## Tables

### `member`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `member.id` | Random sortable id | Names the person in every other row | Server only; never in a response about someone else | Until deletion, then it stays as the tombstone id |
| `member.phone_e164` | Phone number, E.164 | The sign-in identity and where the code is sent | The member, the operator. Never a co-member | Until deletion; nulled on the tombstone |
| `member.status` | `active`, `suspended`, `stopped`, `banned` or `deleted` | Decides whether the person can sign in and be grouped | The member (their own state), the operator | Until deletion |
| `member.status_reason` | Short operator reason code | Audit of why a status changed | The operator | Until deletion |
| `member.phone_verified_at` | When a code last proved the phone | Matching needs a verified phone | The member, the operator | Until deletion |
| `member.created_at` | Row creation time | Audit | Operator | Until deletion |
| `member.updated_at` | Last change | Audit | Operator | Until deletion |
| `member.deleted_at` | When the account was erased | Marks the tombstone | Operator | Kept on the tombstone |

### `auth_session`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `auth_session.id` | Session id, carried in the access token as `sid` | Names one signed-in device | Server | Until expiry or sign-out, plus 7 days if revoked or rotated |
| `auth_session.member_id` | Owner | Links the session to a member | Server | Same |
| `auth_session.refresh_hash` | SHA-256 of the refresh token | Lets a refresh token be checked without storing it | Server only | Same |
| `auth_session.created_at` | Sign-in time | Audit | Server | Same |
| `auth_session.last_used_at` | Last refresh | Sliding 30-day expiry | Server | Same |
| `auth_session.expires_at` | When the refresh token stops working | Sliding expiry | Server | Same |
| `auth_session.revoked_at` | Sign-out or reuse revocation time | Stops the session at once | Server | Same |
| `auth_session.replaced_by` | The session that took over on rotation | Recognises reuse of an old token | Server | Same |
| `auth_session.replaced_at` | When it was rotated | Reuse detection and the sweep | Server | Same |

### `otp_challenge`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `otp_challenge.id` | Challenge id | The app names the challenge when it verifies | The requester | 1 day |
| `otp_challenge.phone_hash` | Keyed hash of the phone | Ties a code to a number without storing the number | Server only | 1 day |
| `otp_challenge.purpose` | `sign_in` or `delete_account` | A sign-in code cannot delete an account | Server | 1 day |
| `otp_challenge.code_hmac` | Keyed hash of challenge id plus code | Checks the code without storing it | Server only | 1 day |
| `otp_challenge.attempts` | Wrong guesses so far | Stops guessing (5 allowed) | Server | 1 day |
| `otp_challenge.created_at` | Request time | Expiry and rate limits | Server | 1 day |
| `otp_challenge.expires_at` | Ten minutes after creation | Codes are short lived | Server | 1 day |
| `otp_challenge.consumed_at` | When a code was used | A code works once | Server | 1 day |
| `otp_challenge.voided_at` | When a newer request replaced it, or attempts ran out | Only the latest code works | Server | 1 day |
| `otp_challenge.wamid` | WhatsApp message id | Matches the delivery webhook to the challenge | Server, Meta | 1 day |
| `otp_challenge.delivery_status` | Where the message got to | Shows the person whether the code arrived | The requester (mapped), operator | 1 day |
| `otp_challenge.delivery_error_code` | Meta error code on failure | Spend and delivery alerts | Operator | 1 day |

### `profile`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `profile.member_id` | Owner | Links the profile to a member | Server | Until deletion |
| `profile.first_name` | First name | Shown to a group from three hours before the show | The member; co-members from T-3h; operator | Until deletion |
| `profile.gender` | `woman`, `man` or `non_binary` | Women-only groups and the mix cap | The member, operator. Never shown to co-members | Until deletion |
| `profile.group_pref` | `open` or `women_only` | Which groups the person can join | The member, operator | Until deletion |
| `profile.photo_key` | Key of the photo in the object store | Co-members see a face from T-3h | Server; the file goes only to the owner, the operator and co-members from T-3h through a 5 minute link | Until deletion or replacement |
| `profile.created_at` | Row creation | Audit | Operator | Until deletion |
| `profile.updated_at` | Last change | Audit | Operator | Until deletion |

### `social_handle`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `social_handle.member_id` | Owner | Links the handle to a member | Server | Until deletion or ban |
| `social_handle.kind` | `instagram` or `linkedin` | Which site the operator checks | The member, operator | Until deletion or ban |
| `social_handle.handle` | The normalised handle | The operator looks the person up before they are grouped | The member, operator only. Never a co-member | Until deletion or ban |
| `social_handle.status` | `pending`, `approved` or `rejected` | Only an approved handle can be grouped | The member, operator | Until deletion or ban |
| `social_handle.reject_reason` | Why it was turned down | The app tells the person kindly what to fix | The member, operator | Until deletion or ban |
| `social_handle.submitted_at` | When it was sent | Review order | Operator | Until deletion or ban |
| `social_handle.reviewed_at` | When it was decided | Audit | Operator | Until deletion or ban |
| `social_handle.reviewed_by` | Operator label | Audit | Operator | Until deletion or ban |
| `social_handle.submissions_today` | Submits on `submissions_day` | Limits submits to 3 a day | Server | Until deletion or ban |
| `social_handle.submissions_day` | The IST date the count is for | Resets the count at midnight IST | Server | Until deletion or ban |
| `social_handle.updated_at` | Last change | Audit | Operator | Until deletion or ban |

### `consent_record`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `consent_record.id` | Row id | Primary key | Server | 1 year after the account ends |
| `consent_record.member_id` | Owner, or the tombstone id after deletion | Proof of what was agreed | Server, operator | 1 year after the account ends |
| `consent_record.notice_version` | Version of the privacy notice accepted | Proves which text the person saw | The member, operator | 1 year after the account ends |
| `consent_record.purpose` | What the consent is for | Separates consents if more are added | Operator | 1 year after the account ends |
| `consent_record.given_at` | When it was given | Proof | The member, operator | 1 year after the account ends |
| `consent_record.withdrawn_at` | When it was withdrawn | Proof | The member, operator | 1 year after the account ends |

### `rate_bucket`

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `rate_bucket.bucket_key` | Keyed hash of a scope and a subject (a phone, an IP, a member) | Counts requests without storing the subject | Server only | One window |
| `rate_bucket.window_start` | Start of the window, epoch seconds | Fixed-window counting | Server | One window |
| `rate_bucket.window_seconds` | Length of the window | Tells the sweep when the row is dead | Server | One window; the `otp:sends` counter rows are kept 62 days for the monthly spend alert |
| `rate_bucket.count` | Requests in the window | The limit check | Server | One window |

### `plan`

A member's plan to go to one show. It keeps snapshots of the show, so a catalog change never moves it.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `plan.id` | Plan id (ULID) | Names the plan in the app and the admin | The member, operator | Until deletion |
| `plan.member_id` | Owner | Links the plan to a member | Server; never in a response about someone else | Until deletion |
| `plan.event_id` | The show (the catalog event id, which is also its public id) | Which show the plan is for | The member, operator | Until deletion |
| `plan.dedupe_key` | The event's dedupe group, or the event id when it has none | One live plan per person per run of the same show | Server | Until deletion |
| `plan.group_type` | `open` or `women_only` | Which kind of group the person wants | The member, operator | Until deletion |
| `plan.state` | Where the plan is in its life | Drives every screen and every ticker step | The member, operator | Until deletion |
| `plan.reason` | Why a plan ended without a show | The app tells the person kindly what happened | The member, operator | Until deletion |
| `plan.show_title` | Show title at the time of the plan | Shows the plan after the catalog row changes | The member, operator; co-members see it in the group | Until deletion |
| `plan.show_starts_at` | Show start (ISO UTC) at the time of the plan | Every time rule counts from it | The member, operator, co-members | Until deletion |
| `plan.venue_name` | Venue name at the time of the plan | The meet card and the fallback meeting place | The member, operator, co-members | Until deletion |
| `plan.venue_lat` | Venue latitude (the venue, not a person) | The venue entrance is the fallback meeting place | The member, operator, co-members from T-3h | Until deletion |
| `plan.venue_lng` | Venue longitude | Same | Same | Until deletion |
| `plan.group_id` | The group the member is placed in | Links the plan to its group | The member, operator | Until deletion |
| `plan.created_at` | Row creation | Audit and daily limit | Operator | Until deletion |
| `plan.updated_at` | Last change | Audit | Operator | Until deletion |

### `ticket_proof`

The ticket a member sends to show they are going. The file is deleted at the latest 24 hours after the show starts; then the key and hash go too.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `ticket_proof.id` | Ticket row id (ULID) | Names the upload | Operator | Until the plan is deleted |
| `ticket_proof.plan_id` | The plan it was sent for | Links the upload to a plan | Server, operator | Until the plan is deleted |
| `ticket_proof.object_key` | Key of the file in the object store | The operator opens it through a short link | Server, operator. Never in an app response | Until the file is deleted (at most 24 h after the show starts), then null |
| `ticket_proof.mime` | File type (JPEG, PNG, HEIC or PDF) | Decides how the operator opens it | Operator | Until the plan is deleted |
| `ticket_proof.bytes` | File size | Limit check and audit | Operator | Until the plan is deleted |
| `ticket_proof.sha256` | Hash of the stored file | Flags the same ticket sent by two people for one show | Operator | Until the file is deleted, then null |
| `ticket_proof.status` | `pending`, `approved` or `rejected` | Only an approved ticket lets the person be grouped | The member, operator | Until the plan is deleted |
| `ticket_proof.reject_reason` | One of a fixed list of reasons | The app tells the person what to fix | The member, operator | Until the plan is deleted |
| `ticket_proof.uploaded_at` | When the file arrived | Review order and the 24 h rule for rejected files | Operator | Until the plan is deleted |
| `ticket_proof.reviewed_at` | When the operator decided | Audit and the 24 h rule for rejected files | Operator | Until the plan is deleted |
| `ticket_proof.reviewed_by` | Operator label | Audit | Operator | Until the plan is deleted |
| `ticket_proof.file_deleted_at` | When the file was removed | Proves the retention rule ran | Operator | Until the plan is deleted |

### `show_group`

A group for one show. It holds no personal data; who is in it is `group_member`.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `show_group.id` | Group id (ULID) | Names the group in the app and the admin | Members, operator | Until the show's data is swept |
| `show_group.event_id` | The show | Which show the group goes to | Members, operator | Same |
| `show_group.starts_at` | Show start (ISO UTC) | Every time rule counts from it | Members, operator | Same |
| `show_group.group_type` | `open` or `women_only` | Open and women-only groups never mix | Members, operator | Same |
| `show_group.state` | `confirmed`, `locked`, `live`, `done`, `called_off` or `dissolved` | Drives who can see whom and when | Members (mapped), operator | Same |
| `show_group.cafe_name` | Name of the meeting cafe | Where the group meets, shown from T-3h | Members from T-3h, operator | Same |
| `show_group.cafe_address` | Address of the cafe | Same | Same | Same |
| `show_group.cafe_lat` | Latitude of the cafe (a place, not a person) | The app computes the distance on the device | Same | Same |
| `show_group.cafe_lng` | Longitude of the cafe | Same | Same | Same |
| `show_group.meet_at` | When the group meets | Shown on the meet card from T-3h | Same | Same |
| `show_group.created_at` | Row creation | Audit | Operator | Same |
| `show_group.locked_at` | When the group locked (T-24h) | Audit | Operator | Same |
| `show_group.live_at` | When the meet card went live (T-3h) | Audit | Operator | Same |
| `show_group.ended_at` | When the group dissolved, was called off or finished | Audit | Operator | Same |
| `show_group.updated_at` | Last change | Audit | Operator | Same |

### `group_member`

Who is in a group, and who has left it.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `group_member.id` | Row id (ULID) | Primary key | Server | Until the member is deleted |
| `group_member.group_id` | The group | Links the person to a group | Server | Until the member is deleted |
| `group_member.member_id` | The person | Links the group to a member | Server; never in a response about someone else | Until the member is deleted |
| `group_member.plan_id` | The person's plan | Links the place to a plan | Server | Until the member is deleted |
| `group_member.member_ref` | A random name for the person that is only good inside this group | Co-members are named by it, never by the member id | Members of the group from T-3h | Until the member is deleted |
| `group_member.joined_at` | When the person was placed | Audit | Operator | Until the member is deleted |
| `group_member.left_at` | When the person left or was removed | A left person disappears from the group | Operator | Until the member is deleted |
| `group_member.checked_in_at` | When the person tapped "I'm here" | Shows the group who has arrived. No coordinates are sent or kept | Members of the group, operator | Until the member is deleted |

### `device`

A phone that can get push notices.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `device.id` | Device id (ULID) | Names the device when the app removes it | The member | Until sign-out, deletion or `DeviceNotRegistered` |
| `device.member_id` | Owner | Where a push goes | Server | Same |
| `device.session_id` | The sign-in that registered it | Sign-out removes the device | Server | Same |
| `device.expo_token` | The Expo push token | The address Expo sends a push to | Server, Expo | Same |
| `device.platform` | `android` or `ios` | Only platforms in `PUSH_PLATFORMS` are sent to | Server | Same |
| `device.created_at` | When it was registered | Audit | Server | Same |
| `device.last_seen_at` | When the app last registered it | Drops stale tokens | Server | Same |
| `device.disabled_at` | When Expo said the token is gone | Stops sends to it | Server | Same |

### `notice`

An in-app notice. The push, if any, carries only the kind and two ids.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `notice.id` | Notice id (ULID) | The app pages on it | The member | 30 days |
| `notice.member_id` | Who it is for | Lists the person's notices | The member | 30 days |
| `notice.kind` | What happened, from a fixed list | The app picks the screen and the text from it | The member | 30 days |
| `notice.plan_id` | The plan it is about | The app opens the plan | The member | 30 days |
| `notice.group_id` | The group it is about | Loss notices name the group and the kind only | The member | 30 days |
| `notice.dedupe_key` | One key per milestone | The same milestone never makes a second notice | Server | 30 days |
| `notice.created_at` | When it was made | Ordering and the stale rule | The member | 30 days |
| `notice.read_at` | When the app marked it read | Unread badge | The member | 30 days |
| `notice.stale_after` | When a push for it stops being useful | Past it the notice is listed but not pushed | Server | 30 days |
| `notice.push_state` | `pending`, `sending`, `sent`, `stale`, `no_device` or `not_sent` | Sends each push once | Server, operator | 30 days |
| `notice.claimed_at` | When a ticker pass took the notice to send it | Stops a second pass sending it again while the first is still at it | Server | 30 days |
| `notice.pushed_at` | When the push was handed to Expo | Audit | Server | 30 days |

### `push_delivery`

One push to one device: the Expo ticket and, later, its receipt.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `push_delivery.id` | Row id (ULID) | Primary key | Server | 30 days |
| `push_delivery.notice_id` | The notice sent | Links the push to a notice | Server | 30 days |
| `push_delivery.device_id` | The device sent to | Links the push to a device | Server | 30 days |
| `push_delivery.expo_ticket_id` | Expo's ticket id | Asks Expo for the receipt about 15 minutes later | Server, Expo | 30 days |
| `push_delivery.status` | `ticketed`, `delivered`, `failed` or `device_gone` | Tracks the send | Server, operator | 30 days |
| `push_delivery.error_code` | Expo's error code | Failed notices in the admin | Operator | 30 days |
| `push_delivery.created_at` | When the push was sent | Waits for the receipt delay | Server | 30 days |
| `push_delivery.receipt_checked_at` | When the receipt was read | Reads each receipt once | Server | 30 days |

### `start_override`

A start time the operator confirmed, which wins over the source's and turns a date-only show into a timed one.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `start_override.event_id` | The show | Which show the time is for | Operator, and the show's start time everywhere | Kept |
| `start_override.starts_at` | The confirmed start (ISO UTC) | Groups and the T-24h and T-3h rules count from it | Everyone who sees the show | Kept |
| `start_override.set_by` | Operator label | Audit | Operator | Kept |
| `start_override.set_at` | When it was set | Audit | Operator | Kept |

### `operator_action`

Every write the operator makes. `detail` holds codes and ids, never free text about a person.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `operator_action.id` | Row id (ULID) | Primary key | Operator | 1 year |
| `operator_action.action` | What was done, for example `handle_approved` | Audit | Operator | 1 year |
| `operator_action.subject_type` | What kind of thing it was done to | Audit | Operator | 1 year |
| `operator_action.subject_id` | The id of that thing | Audit | Operator | 1 year |
| `operator_action.detail` | A small JSON object of codes | Audit | Operator | 1 year |
| `operator_action.created_at` | When | Audit | Operator | 1 year |

### `scheduler_lease`

Which process runs the ticker.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `scheduler_lease.name` | Lease name (`ticker`) | One lease per job | Server, `/health` | Overwritten each tick |
| `scheduler_lease.holder` | Process that holds it | Only one process ticks | Server | Overwritten each tick |
| `scheduler_lease.expires_at` | When the lease lapses | Another process can take over after it | Server, `/health` | Overwritten each tick |
| `scheduler_lease.last_tick_at` | When a pass last finished | `/health` shows the age | Server, `/health` | Overwritten each tick |

### `alert_sent`

An operator alert already sent, so each fires once.

| Column | What | Why | Who sees it | How long |
| --- | --- | --- | --- | --- |
| `alert_sent.alert_key` | What the alert was about, for example `handle:<member id>` | Stops a repeat | Server | 30 days |
| `alert_sent.sent_at` | When it was sent | Audit and the sweep | Server | 30 days |

## Object store

| Prefix | What | Who sees it | How long |
| --- | --- | --- | --- |
| `tickets/<plan id>/<ulid>.<ext>` | A ticket the member sent: an image re-encoded to a 2,000 px long edge without metadata, or a PDF that passed the checks. No app route returns it; the operator opens it through a signed link and PDFs download as attachments | The operator only | 24 h after the show starts at the latest, 24 h after an unanswered rejection, at once on withdrawal or deletion |
| `photos/<opaque id>.jpg` | The member's profile photo, re-encoded to a 1080 px JPEG without EXIF. The key is a random id, never the member id, so a link to it names no one | See `profile.photo_key` | Until deletion or replacement |

## Third parties

| Party | What they get | Why |
| --- | --- | --- |
| Meta (WhatsApp Cloud API) | The phone number and the sign-in code | To deliver the code. The app's privacy notice says so |
| Expo (push service) and Google FCM behind it | The device's push token and a generic title and body with the notice kind and two ids. No name, cafe, show title or reason | To wake the app. Only sent to platforms in `PUSH_PLATFORMS` |
