import type { Database } from "bun:sqlite";
import { NOTICE_KINDS } from "@turnout/contract/app/notices";
import { PLAN_REASONS, PLAN_STATES } from "@turnout/contract/app/plans";
import { TICKET_REJECT_REASONS } from "@turnout/contract/ticket";
import { HYDERABAD_BOX, PLACED_GEOCODE_STATES } from "../catalog/venue.js";
import { DEFAULT_TUNABLES } from "./model/tunables.js";

export const MEMBER_STATUSES = ["active", "suspended", "stopped", "banned", "deleted"] as const;
export const OTP_PURPOSES = ["sign_in", "delete_account"] as const;
/** `pending` and `reviewer` never leave the server: the API reports them as `sent` and `delivered`. */
export const DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed", "undeliverable", "reviewer"] as const;
export const HANDLE_ROW_STATUSES = ["pending", "approved", "rejected"] as const;
export const CONSENT_PURPOSES = ["service"] as const;
export const GROUP_ROW_STATES = ["confirmed", "locked", "live", "done", "called_off", "dissolved"] as const;
export const TICKET_STATUSES = ["pending", "approved", "rejected"] as const;
export const NOTICE_PUSH_STATES = ["pending", "sending", "sent", "stale", "no_device", "not_sent"] as const;
export const PUSH_DELIVERY_STATUSES = ["ticketed", "delivered", "failed", "device_gone"] as const;
export const DEVICE_PLATFORMS = ["android", "ios"] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

const M3_SQL = `-- M3: plans, tickets, groups, notices. A plan keeps snapshots of the show, so a later catalog change never moves a member's plan.
CREATE TABLE IF NOT EXISTS start_override (
  event_id TEXT PRIMARY KEY REFERENCES event(id),
  starts_at TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL
);

-- No personal data: who is in a group is group_member.
CREATE TABLE IF NOT EXISTS show_group (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id),
  starts_at TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('open', 'women_only')),
  state TEXT NOT NULL DEFAULT 'confirmed' CHECK (state IN (${list(GROUP_ROW_STATES)})),
  cafe_name TEXT,
  cafe_address TEXT,
  cafe_lat REAL,
  cafe_lng REAL,
  meet_at TEXT,
  created_at TEXT NOT NULL,
  locked_at TEXT,
  live_at TEXT,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK ((cafe_lat IS NULL) = (cafe_lng IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_show_group_event ON show_group(event_id, state);
CREATE INDEX IF NOT EXISTS idx_show_group_state ON show_group(state, starts_at);

CREATE TABLE IF NOT EXISTS plan (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES event(id),
  -- The event's dedupe group, or the event id when it has none: one live plan per member per run of the same show.
  dedupe_key TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('open', 'women_only')),
  state TEXT NOT NULL DEFAULT 'needs_ticket' CHECK (state IN (${list(PLAN_STATES)})),
  reason TEXT CHECK (reason IS NULL OR reason IN (${list(PLAN_REASONS)})),
  show_title TEXT NOT NULL,
  show_starts_at TEXT NOT NULL,
  venue_name TEXT NOT NULL,
  venue_lat REAL,
  venue_lng REAL,
  group_id TEXT REFERENCES show_group(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Only a plan that ended without a show carries a reason.
  CHECK ((state IN ('no_group', 'withdrawn')) = (reason IS NOT NULL))
);
-- At most one live plan per member and dedupe group.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_live ON plan(member_id, dedupe_key) WHERE state NOT IN ('no_group', 'withdrawn', 'done');
CREATE INDEX IF NOT EXISTS idx_plan_event_state ON plan(event_id, state);
CREATE INDEX IF NOT EXISTS idx_plan_member ON plan(member_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plan_group ON plan(group_id);

-- Plan rows are deleted before their ticket rows by cascade; the file itself is deleted by code (never left behind): see tickets.ts.
CREATE TABLE IF NOT EXISTS ticket_proof (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  -- Null once the file is deleted, with sha256.
  object_key TEXT,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (${list(TICKET_STATUSES)})),
  reject_reason TEXT CHECK (reject_reason IS NULL OR reject_reason IN (${list(TICKET_REJECT_REASONS)})),
  uploaded_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  file_deleted_at TEXT,
  CHECK (status = 'rejected' OR reject_reason IS NULL),
  CHECK (status != 'rejected' OR reject_reason IS NOT NULL),
  CHECK (file_deleted_at IS NULL OR (object_key IS NULL AND sha256 IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_ticket_proof_plan ON ticket_proof(plan_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_ticket_proof_sha ON ticket_proof(sha256) WHERE sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_proof_status ON ticket_proof(status, uploaded_at);

CREATE TABLE IF NOT EXISTS group_member (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES show_group(id),
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
  -- Opaque and unique inside the group: the only name another member's app ever sees.
  member_ref TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  checked_in_at TEXT,
  UNIQUE (group_id, member_ref)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_member_current ON group_member(group_id, member_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_group_member_member ON group_member(member_id);
CREATE INDEX IF NOT EXISTS idx_group_member_plan ON group_member(plan_id);

CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  -- The session that registered it, so sign-out can remove it. Moves to the new session on a refresh.
  session_id TEXT REFERENCES auth_session(id) ON DELETE SET NULL,
  expo_token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN (${list(DEVICE_PLATFORMS)})),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  disabled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_device_member ON device(member_id);
CREATE INDEX IF NOT EXISTS idx_device_session ON device(session_id);

-- Ids are ULIDs, so id order is time order and GET /notices?after= pages on it.
CREATE TABLE IF NOT EXISTS notice (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (${list(NOTICE_KINDS)})),
  plan_id TEXT REFERENCES plan(id) ON DELETE CASCADE,
  group_id TEXT REFERENCES show_group(id) ON DELETE SET NULL,
  -- Inserted in the same transaction as the change it reports; a second insert for the same milestone is ignored.
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  read_at TEXT,
  -- After this instant the notice is listed but no longer pushed.
  stale_after TEXT NOT NULL,
  push_state TEXT NOT NULL DEFAULT 'pending' CHECK (push_state IN (${list(NOTICE_PUSH_STATES)})),
  claimed_at TEXT,
  pushed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notice_member ON notice(member_id, id);
CREATE INDEX IF NOT EXISTS idx_notice_push ON notice(push_state, created_at);

CREATE TABLE IF NOT EXISTS push_delivery (
  id TEXT PRIMARY KEY,
  notice_id TEXT NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES device(id) ON DELETE CASCADE,
  expo_ticket_id TEXT,
  status TEXT NOT NULL CHECK (status IN (${list(PUSH_DELIVERY_STATUSES)})),
  error_code TEXT,
  created_at TEXT NOT NULL,
  receipt_checked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_notice ON push_delivery(notice_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_receipt ON push_delivery(status, created_at);

-- Every write the operator makes. subject_id is a member, plan, group, event or notice id; detail holds codes, never free text about a person.
CREATE TABLE IF NOT EXISTS operator_action (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_action_subject ON operator_action(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_operator_action_created ON operator_action(created_at);

-- One row: which process runs the ticker now and when it last finished a pass.
CREATE TABLE IF NOT EXISTS scheduler_lease (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_tick_at TEXT
);

-- An operator alert that has been sent, so a milestone alerts once however many ticks see it.
CREATE TABLE IF NOT EXISTS alert_sent (
  alert_key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);
`;

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
${M3_SQL}`;

/**
 * The shows a group can be made for, before the clock: `listable_event` with the operator's start time applied, the venue's
 * point beside it, and every rule of `isEligible` that a WHERE clause can say. It never leaves out a show `isEligible` accepts.
 * What it cannot say is the closing time (it needs `now`) and the city-centre placeholder radius (it needs a haversine), so a
 * caller still runs `isEligible` over the row. Recreated on every migrate, with the defaults of `tunables.ts`.
 */
function eligibleShowSql(): string {
  const t = DEFAULT_TUNABLES;
  const categories = t.eligibleCategories.map((c) => `'${c}'`).join(", ");
  return `
DROP VIEW IF EXISTS eligible_show;
CREATE VIEW eligible_show AS
SELECT e.*,
  v.lat AS venue_lat,
  v.lng AS venue_lng,
  v.geocode_state AS venue_geocode_state,
  o.starts_at AS override_starts_at,
  COALESCE(o.starts_at, e.starts_at) AS effective_starts_at
FROM listable_event e
JOIN venue v ON v.id = e.venue_id
LEFT JOIN start_override o ON o.event_id = e.id
WHERE e.category IN (${categories})
  AND e.is_free = 0
  AND e.price_min IS NOT NULL AND e.price_min >= ${t.minPriceInr}
  AND (e.time_kind = 'timed' OR o.event_id IS NOT NULL)
  AND v.geocode_state IN (${PLACED_GEOCODE_STATES.map((s) => `'${s}'`).join(", ")})
  AND v.lat BETWEEN ${HYDERABAD_BOX.minLat} AND ${HYDERABAD_BOX.maxLat}
  AND v.lng BETWEEN ${HYDERABAD_BOX.minLng} AND ${HYDERABAD_BOX.maxLng};
`;
}

export function migrate(db: Database): void {
  db.exec(SCHEMA_SQL);
  db.exec(eligibleShowSql());
}
