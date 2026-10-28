# Meta setup: WhatsApp sign-in codes

Status: written 2026-10-27 for plan task S28. Every step below that needs a Meta login is
**needs owner**: the engineer cannot open the account. The code side (the sender, the webhook,
the cap and the spend alerts) is built and tested against a fake sender and recorded Cloud API
payloads. This file holds no token, no PIN and no phone number. Status values are `pending: user`,
`submitted`, `active`. Dates are filled in by the owner as each step is confirmed.

Why WhatsApp: sign-in needs WhatsApp on the number, and there is no SMS fallback in v1, so there is
no SMS vendor and no DLT registration. One authentication message costs about 0.115 INR delivered,
0.136 INR with GST (https://developers.facebook.com/docs/whatsapp/pricing/). At the 200 a day cap
the worst case is about 820 INR a month.

## Steps

| # | Step | Who | Status | Date |
|---|---|---|---|---|
| 1 | Meta Business portfolio, India as the primary location, owned by the `owner` login in `docs/plans/mobile-accounts.md` | owner | pending: user | |
| 2 | Start business verification. Indian documents such as GST, Udyam or a business PAN (https://faq.whatsapp.com/3872729742954601). Verification lifts the limit from 250 to 2,000 people a day (https://developers.facebook.com/docs/whatsapp/messaging-limits/). It takes days, so start it first | owner | pending: user | |
| 3 | Meta Business app with the WhatsApp product. Use the free test number for up to 5 team phones while the real number is pending (https://developers.facebook.com/docs/whatsapp/cloud-api/get-started) | owner | pending: user | |
| 4 | A dedicated number the owner holds, not registered on WhatsApp, with a display name that matches the brand (https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers). Set the two-step PIN and keep it in the password manager only | owner | pending: user | |
| 5 | Billing in INR, prepaid by UPI. First top-up 500 INR (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/prepaid-billing/). The `billing` role holds the payment method | billing | pending: user | |
| 6 | The authentication template (below) | owner | pending: user | |
| 7 | A system user with WhatsApp messaging permission only, and its token. The token goes into `WHATSAPP_ACCESS_TOKEN` on the host and nowhere else | owner | pending: user | |
| 8 | The webhook, once the host exists (below) | owner | blocked: host slot | |
| 9 | One-tap check on a build signed with the Play signing key | owner | blocked: Play upload (F25) | |

## The authentication template

- Language `en`, category Authentication.
- Body: the security line Meta supplies ("<code> is your verification code. For your security, do not
  share it.") with the 10 minute expiry footer. Use Meta's authentication wording as is; it is not our
  user-facing copy and the copy lint does not apply to it.
- `message_send_ttl_seconds`: 600, so a code that cannot be delivered within 10 minutes is dropped
  and not delivered late.
- Button: one-tap autofill. `supported_apps` lists the Android package and the 11-character app hash
  of each signing key, up to 5 pairs: the debug or e2e key, the EAS key, the upload key and the Play
  signing key. No zero-tap.
- The app hash is Google's SMS Retriever hash per signing key
  (https://developers.google.com/identity/sms-retriever/verify#computing_your_apps_hash_string). It is
  computed from the key's certificate and the package name. It is not secret.
- The template name goes into `WHATSAPP_TEMPLATE_NAME`.

## Settings the server reads

Names only. Values live in the host environment (see `.env.example` and `docs/deploy.md`).

| Name | What it is |
|---|---|
| `OTP_SENDER` | `whatsapp` in production. `fake` is refused there |
| `WHATSAPP_ACCESS_TOKEN` | The system user token |
| `WHATSAPP_PHONE_NUMBER_ID` | The id of the dedicated number in the Meta app |
| `WHATSAPP_TEMPLATE_NAME` | The approved authentication template |
| `WHATSAPP_APP_SECRET` | Checks the `X-Hub-Signature-256` header on webhook posts |
| `WHATSAPP_VERIFY_TOKEN` | The token Meta sends once, when the webhook is registered. The owner picks a random string and types it in both places |
| `OTP_DAILY_CAP` | Optional. Sends per IST day across everyone; the default is 200 |

## The webhook

URL: `https://<domain>/api/app/v1/webhooks/whatsapp`, subscribed to `messages` (status updates and
the "I didn't request it" button). `GET` answers Meta's verify challenge when the verify token
matches. `POST` checks the body signature against `WHATSAPP_APP_SECRET` and answers 401 on a bad
one and 200 after a good one. It moves a challenge's delivery status up (`sent`, `delivered`,
`read`), records `failed` and `undeliverable`, and blocks codes for a number whose owner pressed
"I didn't request it". Register it only after the deploy; until then the app shows `sent` and the
server logs, and sign-in still works.

## Acceptance (needs the accounts, so not run here)

- A code from the production number reaches a team phone, and one-tap fills it on a build signed
  with the Play signing key.
- The webhook receives `delivered` after the deploy.
- This file records each step's status and date, with no token and no PIN.

What is checked without the accounts: `test/whatsappWebhook.test.ts` (signature check, status
ordering, the blocked-number rule) and `test/auth.test.ts` (request shape, cap, spend alerts,
reviewer login).

## Spend and the cap

The server counts sends in `rate_bucket` (key `otp:sends`, kept 62 days) and alerts the operator
at 500, 1,000 and 1,500 INR of estimated monthly spend, using `tunables.otp.priceInr`. At the
daily cap new sends get 503 `otp_cap_reached` and an alert is raised. See `docs/runbook.md`.
