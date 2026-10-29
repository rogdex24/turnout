# Deploy

Status: the host is a VPS the owner already pays for, with backups to an S3-compatible bucket
(plan section 9). The deploy files are in `deploy/` and are tested on a local copy of the host layout;
nothing has run on the real VPS yet. The first deploy waits for the SSH access, the domain and the
bucket values listed below.

## What runs

One process: `bun src/cli.ts serve --db /data/production.db --port 3000`. It serves the public site,
the public JSON API and the app API under `/api/app/v1/`, and runs the ticker in the same process
(one lease holder; `--no-ticker` turns it off, which the end-to-end server uses). Staging is a
second service with its own DB, its own file directory and `TURNOUT_ENV=staging`, on
`staging.<domain>`. The admin console (`bun run admin`) stays on `127.0.0.1` behind an SSH tunnel.

Settings are environment variables. `.env.example` lists every name with an empty value. On the
host they go in a file outside the repository that the service manager reads. Nothing secret is in
the repository, in EAS, or in CI, except the items `docs/plans/mobile-accounts.md` puts there.

## Environments

| `TURNOUT_ENV` | Sender | Secrets and keys | Test routes | Notes |
|---|---|---|---|---|
| `production` | WhatsApp and Expo push only. `OTP_SENDER=fake` and `PUSH_SENDER=fake` are refused | All required; startup fails with the list of missing names | None. `/__test/*` is not in the route table | Needs the `GRIEVANCE_*` block |
| `staging` | Fake by default; never messages anyone | A missing secret is replaced by a random one for that run (sessions end at a restart) and the log says which | `POST /__test/otp` and `POST /__test/clock`, only with `STAGING_TEST_TOKEN` | Sign-in only for numbers in `TEST_PHONE_ALLOWLIST` |
| `development` | Fake unless `OTP_SENDER=whatsapp` | Same as staging | Same as staging | Must be set on purpose: `serve` refuses to start when `TURNOUT_ENV` is unset |
| `test` | Injected by the test | Fixed per test | In tests | In-memory object store |

## File storage

Photos and ticket files go through one `ObjectStore` (`src/utils/objectStore.ts`). Keys are lower
case. Members get signed, short-lived links (`FILE_LINK_SECRET`, 5 minutes) and never a bare path.

| `OBJECT_STORE` | Where | Use |
|---|---|---|
| `disk` (default) | `FILES_DIR` (default `data/files`). Writes a temp name then renames, mode 0600, `Cache-Control: private, no-store` | Production on a single host, staging, development |
| `s3` | `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` through Bun's `S3Client` | Only if the host slot comes with an object bucket |
| `memory` | The process | Tests only, the default when `TURNOUT_ENV=test` |

The admin process reads the same store, so it needs the same `FILE_LINK_SECRET`, `OBJECT_STORE` and
`FILES_DIR` (or `S3_*`) to show ticket files and handle photos. With the secret unset, or with `memory`,
the admin shows no file link and the queues still work. The admin signs its own 5 minute links and
serves them itself; the app's files route never serves a `tickets/` key.

A nightly sweep deletes files no row points to. **Photos and tickets are not in the Litestream
backup**, which covers the SQLite file only. A lost disk means members upload their photo again;
back up the files directory separately if that is not acceptable. Keep `FILES_DIR` on the same
volume as `/data` and outside the web root.

## Settings, by group

Names only. See `.env.example` for the full list and `docs/runbook.md` for what to do when one is
wrong.

- Identity of the service: `TURNOUT_ENV`, `GRIEVANCE_NAME`, `GRIEVANCE_ADDRESS`, `GRIEVANCE_EMAIL`,
  `GRIEVANCE_PHONE`, `SUPPORT_EMAIL`.
- Secrets: `OTP_PEPPER`, `BAN_PEPPER`, `FILE_LINK_SECRET`, `AUTH_JWT_PRIVATE_KEY`,
  `AUTH_JWT_PUBLIC_KEY` (and `AUTH_JWT_PREVIOUS_PUBLIC_KEY` while rotating). Generate each on the
  host; never copy a value from another environment. The admin process needs the same `BAN_PEPPER`
  as the app: the app leaves a fingerprint of its value in the database, and the admin answers 503 on
  ban, lift, reinstate and report close if its value differs or is missing.
- Sign-in codes: `OTP_SENDER`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `OTP_DAILY_CAP`,
  `OPERATOR_ALERT_WEBHOOK_URL`. Steps are in `docs/meta-setup.md`.
- Review account for the Play app access form: `REVIEWER_PHONE`, `REVIEWER_OTP` (production only).
- Staging only: `STAGING_TEST_TOKEN` (at least 32 characters), `TEST_PHONE_ALLOWLIST`, `FAKE_UNDELIVERABLE_PHONES`.
- Files: `OBJECT_STORE`, `FILES_DIR`, `S3_*`.
- Push: `PUSH_SENDER` (`expo` or `fake`; production always uses `expo` and refuses `fake`), `EXPO_ACCESS_TOKEN` (optional, needed
  only with Expo's enhanced push security), `PUSH_PLATFORMS` (Android only until the Apple account exists).
- Behaviour: `MIN_APP_VERSION`,
  `TRUST_PROXY_HEADER` (set to the proxy's header name only when a proxy you control sets it).
- App links (serve `/.well-known/assetlinks.json`; the route is a 404 until the package and a fingerprint are set): `APP_LINKS_ANDROID_PACKAGE`,
  `APP_LINKS_ANDROID_SHA256` (comma-separated SHA-256 fingerprints), `APP_LINKS_IOS_APP_IDS` (later, with the Apple account).
- Go with a group (the event page link and the `/e/<id>/go` fallback page): `APP_LINKS_HOST` (the host the app answers on; no link is shown while it is unset)
  and `PLAY_STORE_URL` (the Play listing; until it is set the fallback page says the app is in testing on Android).
- Later: `SENTRY_DSN`.

## Staging and the seed

```
bun scripts/seed-staging.ts --db /data/staging.db --files /data/staging-files
TURNOUT_ENV=staging FILES_DIR=/data/staging-files bun src/cli.ts serve --db /data/staging.db --port 3001
```

The seed makes shows at T+2d, T+26h and T+2h and members in the states the app has to handle (new,
handle pending, handle rejected, matchable, suspended, stopped, banned, one number the fake sender
marks `undeliverable`), all on fictional `+1 202 555-01xx` numbers. It prints the allowlist and the
undeliverable list to put in `TEST_PHONE_ALLOWLIST` and `FAKE_UNDELIVERABLE_PHONES`. It is repeatable:
the same ids every time, and a re-run puts each member back in their state and ends their sessions.
It refuses to run with `TURNOUT_ENV=production`. The states that need a plan or a group (waiting,
grouped before the reveal, meet card live, group of 3, done) arrive with M3.

Until the host exists, the mobile flows run against `e2e/mobile-server.ts` on the CI machine, which
starts the server in staging mode on a free port with this seed.

## The VPS (S21)

Layout on the host:

| What | Where |
|---|---|
| Code, one directory per release | `/srv/turnout/releases/<sha>`, `/srv/turnout/current` points at the live one |
| Databases and files | `/data/production.db`, `/data/production-files`, `/data/staging.db`, `/data/staging-files` |
| Settings (mode 0640, root:turnout) | `/etc/turnout/production.env`, `/etc/turnout/staging.env`, `/etc/turnout/litestream.env` |
| Units | `turnout@production` (port 3000), `turnout@staging` (port 3002), `turnout-admin` (127.0.0.1:3001), `turnout-sync.timer`, `litestream`, `caddy` |
| Proxy | Caddy: `<domain>` and `go.<domain>` to production, `staging.<domain>` to staging, HTTPS and HSTS |

Files in `deploy/`:

- `setup.sh` prepares a fresh Ubuntu 24.04 host as root and is safe to run again: Bun 1.4.3 and
  Litestream 0.5.17 checked against their release checksums, Caddy from its apt repository, the
  `turnout` user, the firewall (SSH, 80 and 443 only), and the env files. It generates every secret
  (`OTP_PEPPER`, `BAN_PEPPER`, `FILE_LINK_SECRET`, the ES256 key pair, `STAGING_TEST_TOKEN`) on the
  host and never overwrites an env file that exists.
- `deploy.sh` runs on an operator machine. `deploy/deploy.sh setup <ref>` runs `setup.sh` and
  uploads the Litestream values; `deploy/deploy.sh <ref>` ships a release. It reads
  `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY`, `TURNOUT_DOMAIN` and the
  `LITESTREAM_S3_*` values from the environment and sends secrets over stdin, not on a command line.
- `release.sh` runs on the host: installs dependencies, installs the units and configs from the
  release, switches `current`, restarts, and checks `/api/app/v1/health`. A failed check switches
  back to the previous release.
- `prestart.sh` runs before each app start. For production it restores the database from the
  bucket when the file is missing. Litestream starts after the production app, so the restore
  never races replication.
- `litestream.yml` backs up the production database only, with snapshots kept 7 days. Staging is
  the repeatable seed. Photos and tickets are still not backed up.
- `turnout-sync.timer` syncs the event sources four times a day (00:00, 06:00, 12:00, 18:00 IST).

Order:

1. Point the DNS A records for `<domain>`, `go.<domain>` and `staging.<domain>` at the VPS.
2. `deploy/deploy.sh setup <ref>`. Only staging starts: production refuses to start without its
   required values, and `release.sh` leaves it off until `GRIEVANCE_NAME` is set.
3. Seed staging: `sudo -u turnout bun scripts/seed-staging.ts --db /data/staging.db --files /data/staging-files`
   in `/srv/turnout/current`, then put the printed lists in `TEST_PHONE_ALLOWLIST` and
   `FAKE_UNDELIVERABLE_PHONES` in `staging.env` and restart `turnout@staging`. Check
   `https://staging.<domain>/api/app/v1/health`.
4. Add the production values to `/etc/turnout/production.env`: `GRIEVANCE_*`, `SUPPORT_EMAIL`,
   `WHATSAPP_*`, `REVIEWER_PHONE`, `REVIEWER_OTP`, and later `APP_LINKS_ANDROID_*` and
   `PLAY_STORE_URL`. Run `deploy/deploy.sh <ref>` again; production, the admin, Litestream and the
   sync timer start.
5. Register the WhatsApp webhook (`docs/meta-setup.md`) and send a code to a team phone.
6. The drill, recorded in `docs/runbook.md`: kill the app process and see it restart; stop
   `litestream` and `turnout@production`, move the database away, start `turnout@production` and see
   it restore, then start `litestream`; check that one ticker lease holder exists.

Acceptance: a fresh VM following this file serves the site and app API over HTTPS; a killed process
restarts; a deleted DB restores; one lease holder.
