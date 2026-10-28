import type { Database } from "bun:sqlite";

export const MEMBER_STATUSES = ["active", "suspended", "stopped", "banned", "deleted"] as const;
export const OTP_PURPOSES = ["sign_in", "delete_account"] as const;
/** `pending` and `reviewer` never leave the server: the API reports them as `sent` and `delivered`. */
export const DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed", "undeliverable", "reviewer"] as const;
export const HANDLE_ROW_STATUSES = ["pending", "approved", "rejected"] as const;
export const CONSENT_PURPOSES = ["service"] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

/**
 * The people tables. All times are ISO UTC text. Foreign keys are enforced (openDb turns them on), so a row can
 * never point at a member that is gone: erasing a member reduces `member` to a tombstone and deletes the rest.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  phone_e164 TEXT UNIQUE CHECK (phone_e164 IS NULL OR phone_e164 GLOB '+[0-9]*'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (${list(MEMBER_STATUSES)})),
  status_reason TEXT,
  phone_verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  -- Only a tombstone has no phone.
  CHECK (status = 'deleted' OR phone_e164 IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS auth_session (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  refresh_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  -- Set when this row's refresh token was exchanged for a new one. Presenting it again is reuse.
  replaced_by TEXT REFERENCES auth_session(id) ON DELETE SET NULL,
  replaced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_session_member ON auth_session(member_id);
CREATE INDEX IF NOT EXISTS idx_auth_session_expires ON auth_session(expires_at);

CREATE TABLE IF NOT EXISTS otp_challenge (
  id TEXT PRIMARY KEY,
  -- HMAC of the phone: the number itself is never stored here.
  phone_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (${list(OTP_PURPOSES)})),
  -- HMAC(OTP_PEPPER, id + code): the code itself is never stored.
  code_hmac TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  voided_at TEXT,
  wamid TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN (${list(DELIVERY_STATUSES)})),
  delivery_error_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp_challenge_phone ON otp_challenge(phone_hash, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_challenge_wamid ON otp_challenge(wamid) WHERE wamid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_otp_challenge_expires ON otp_challenge(expires_at);

CREATE TABLE IF NOT EXISTS profile (
  member_id TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  first_name TEXT CHECK (first_name IS NULL OR length(first_name) BETWEEN 1 AND 40),
  gender TEXT CHECK (gender IS NULL OR gender IN ('woman', 'man', 'non_binary')),
  group_pref TEXT NOT NULL DEFAULT 'open' CHECK (group_pref IN ('open', 'women_only')),
  -- The key in the object store. Never put in a response: the app gets a signed link.
  photo_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_handle (
  member_id TEXT PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('instagram', 'linkedin')),
  handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${list(HANDLE_ROW_STATUSES)})),
  reject_reason TEXT CHECK (reject_reason IS NULL OR reject_reason IN ('not_found', 'private_or_empty', 'not_matching_photo', 'not_a_person')),
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  -- Handle submits so far on submissions_day (an IST date). The daily limit reads these two columns.
  submissions_today INTEGER NOT NULL DEFAULT 0 CHECK (submissions_today >= 0),
  submissions_day TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status = 'rejected' OR reject_reason IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_social_handle_status ON social_handle(status, submitted_at);

-- No cascade: the row outlives the member, under a tombstone id, for a year after the account ends.
CREATE TABLE IF NOT EXISTS consent_record (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member(id),
  notice_version TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN (${list(CONSENT_PURPOSES)})),
  given_at TEXT NOT NULL,
  withdrawn_at TEXT,
  UNIQUE (member_id, notice_version, purpose)
);

-- Fixed-window counters. bucket_key is a keyed hash of scope and subject, never a phone or an IP.
CREATE TABLE IF NOT EXISTS rate_bucket (
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL, -- epoch seconds
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (bucket_key, window_start)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_rate_bucket_window ON rate_bucket(window_start);
`;

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
}
