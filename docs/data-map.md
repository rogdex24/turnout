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

## Object store

| Prefix | What | Who sees it | How long |
| --- | --- | --- | --- |
| `photos/<opaque id>.jpg` | The member's profile photo, re-encoded to a 1080 px JPEG without EXIF. The key is a random id, never the member id, so a link to it names no one | See `profile.photo_key` | Until deletion or replacement |

## Third parties

| Party | What they get | Why |
| --- | --- | --- |
| Meta (WhatsApp Cloud API) | The phone number and the sign-in code | To deliver the code. The app's privacy notice says so |
