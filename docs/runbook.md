# Runbook

Short steps for the operator. Written 2026-10-27 with the M2 server work. Sections for the host
(restore drill, uptime monitor) are added when the host slot exists (plan task S21). This file holds
no secret and no personal data. Names of settings are in `.env.example`.

## Where alerts come from

The server sends an alert to `OPERATOR_ALERT_WEBHOOK_URL` (a chat webhook that takes
`{"text": "..."}`), or to the process log when none is set. Each kind of alert is sent at most once
an hour, so a loop of failures is one message. Read the log with the host's service manager.

## Sign-in codes: daily cap reached

Symptom: an alert `otp_daily_cap` and members seeing "sign in is paused for today" (503 `otp_cap_reached`).
The cap protects the WhatsApp prepaid balance.

1. Look at the day's sends in the log and the Meta billing page. A sudden jump from few numbers is
   abuse; a spread over many numbers is real demand.
2. If it is real demand and the balance allows it, raise `OTP_DAILY_CAP` in the host environment and
   restart. Raise it by small steps.
3. If it is abuse, leave the cap in place. The per-number and per-address limits still apply.
4. The count resets at midnight IST.

## Sign-in codes: spend alert

Alerts fire at 500, 1,000 and 1,500 INR of estimated spend in a month (sends times the price in
`src/social/model/tunables.ts`). Compare with the Meta billing page. The SPEC 9.1 cap is 2,000 INR
a month for everything. To stop spend at once, set `OTP_DAILY_CAP` to a small number and restart.

## Sign-in codes: not arriving

1. Check the challenge status the app reports (`sent`, `delivered`, `read`, `failed`,
   `undeliverable`). `undeliverable` usually means the number is not on WhatsApp.
2. Check the Meta business portfolio for a quality or messaging-limit warning, and the prepaid
   balance (https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/prepaid-billing/).
3. Check the webhook is registered and the signature secret matches `WHATSAPP_APP_SECRET`. A wrong
   secret shows as 401 answers in the log and statuses stuck at `sent`.
4. Members blocked after "I didn't request a code" get no code for 24 hours by design.

## Rotate the access token signing key

1. Generate a new ES256 key pair offline. Do not paste it in chat or a ticket.
2. Set `AUTH_JWT_PREVIOUS_PUBLIC_KEY` to the current public key, then set the new pair in
   `AUTH_JWT_PRIVATE_KEY` and `AUTH_JWT_PUBLIC_KEY`, and restart. Tokens signed by the old key stay
   valid until they expire (15 minutes), so nobody is signed out.
3. After the access token lifetime has passed, remove `AUTH_JWT_PREVIOUS_PUBLIC_KEY`.
4. Changing `OTP_PEPPER` ends all pending codes and resets the rate limits. Changing `BAN_PEPPER`
   makes the existing ban list match no one, so do not change it without rebuilding the list.
   Changing `FILE_LINK_SECRET` only invalidates links already handed out (5 minutes).

## Maps: spend alert or a strange key

Follow in order: (1) disable Maps SDK for Android in the `turnout-maps` project; (2) read usage in
the Cloud console, by credential; (3) check the key's API and Android app restrictions are still
the ones in `docs/plans/mobile-accounts.md`; (4) rotate the key and update the EAS variable if the
restrictions were off. A budget alert does not stop spend, so step 1 comes first. See
`docs/google-setup.md`.

## The host

- Logs: `journalctl -u turnout@production -f` (or `turnout@staging`, `turnout-admin`, `turnout-sync`, `litestream`, `caddy`).
- Admin: `ssh -L 3001:127.0.0.1:3001 <user>@<host>`, then open `http://localhost:3001`.
- Roll back: `sudo ln -sfn /srv/turnout/releases/<older sha> /srv/turnout/current && sudo systemctl restart turnout@production turnout-admin`.
  The five newest releases are kept.
- Backups: `sudo litestream ltx -config /etc/litestream.yml /data/production.db` lists what the bucket holds.
  To restore by hand, stop `litestream` and `turnout@production`, move the database away, and start
  `turnout@production`; `deploy/prestart.sh` restores it. Then start `litestream`.

## Photos and files

Photos and ticket files are not in the Litestream backup. A lost disk means members upload again.
A nightly sweep deletes files that no row points to. To check the sweep, look for its marker row
`sweep:files` in `rate_bucket` (its window start is the last run).

## Tickets, handles, start times and cafes

The admin has Tickets, Handles and Shows pages. Open Tickets and Handles at least twice a day. A ticket
has to be decided before the show's T-24h lock, and the page shows the minutes left; past the lock
the plan ends without a group. A handle still pending within 12 hours of its show's lock sends
one alert (once per submission). A group that has locked with no cafe sends one alert, and one more
when the show is under the cafe alert window; set the cafe on the Shows page. If a ticket or photo
link does not show, check that the admin has the same `FILE_LINK_SECRET` and file store settings as
the server. Every decision here writes an `operator_action` row.

## Deleting an account on request

A person without the app writes to the grievance officer (the `/delete-account` page promises an answer and the deletion within 7
days). Confirm the request with them first: the message has to come from the number on the account, or the operator asks them
through that number. Then open the admin Accounts page, type the number (or the member id), and use Erase on request and confirm.
This is the same erasure as the in-app deletion: the tombstone, consent records and reports stay, the files are deleted, open plans
leave through the loss rule, and nothing goes on the ban list, so the person can sign up again. It writes a `member_erase_request`
`operator_action` row and does not need `BAN_PEPPER`. Never use Ban for this: it blocks the number.

## Staging

`TURNOUT_ENV=staging` uses the fake sender and the seed in `scripts/seed-staging.ts`. Re-running the
seed resets seeded sessions. `POST /__test/otp` and `POST /__test/clock` need `STAGING_TEST_TOKEN`
and do not exist in production. The token must be at least 32 characters.
