import type { Database } from "bun:sqlite";
import type { Gender } from "@turnout/contract/profile";
import { submitHandle } from "../../src/social/handles.js";
import { createMember } from "../../src/social/members.js";
import { approveHandle, approveTicket } from "../../src/social/operator.js";
import { createPlan, type PlanRow } from "../../src/social/plans.js";
import { insertSession } from "../../src/social/sessions.js";
import { addTicket } from "../../src/social/tickets.js";
import { PHONES } from "../appHelpers.js";

export const SHOW_START = "2026-11-10T14:00:00.000Z";

export interface SeedShow {
  id: string;
  title?: string;
  startsAt?: string;
  category?: string;
  priceMin?: number | null;
  source?: string;
  dedupeGroupId?: string | null;
  timeKind?: "timed" | "date-only";
}

/** A show that can have a group: comedy, priced, at a placed venue. Rows go in directly so the sync's merging stays out of the way. */
export function seedShow(db: Database, show: SeedShow): string {
  const stamp = "2026-10-01T00:00:00.000Z";
  const venueId = `venue-${show.id}`;
  db.query(
    `INSERT OR IGNORE INTO venue (id, name, name_key, geocode_state, lat, lng, created_at, updated_at) VALUES (?, ?, ?, 'resolved', 17.4165, 78.4392, ?, ?)`,
  ).run(venueId, `Hall ${show.id}`, `hall-${show.id}`, stamp, stamp);
  db.query(
    `INSERT INTO event (id, source, source_event_id, source_slot_id, title, starts_at, time_kind, venue_id, venue_name, category, price_min, is_free,
       dedupe_group_id, source_url, content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
     VALUES (?, ?, ?, '0', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'h', ?, ?, 'run', ?)`,
  ).run(
    show.id,
    show.source ?? "communitie",
    show.id,
    show.title ?? `Show ${show.id}`,
    show.startsAt ?? SHOW_START,
    show.timeKind ?? "timed",
    venueId,
    `Hall ${show.id}`,
    show.category ?? "comedy",
    show.priceMin === undefined ? 999 : show.priceMin,
    show.dedupeGroupId ?? null,
    `https://example.test/${show.id}`,
    stamp,
    stamp,
    stamp,
  );
  return show.id;
}

export interface SeedMember {
  gender?: Gender;
  name?: string;
  /** `none` leaves the member without a handle. */
  handle?: "approved" | "pending" | "rejected" | "none";
  photo?: boolean;
}

let counter = 0;

/** A member with a profile, a photo and a handle in the state asked for. Phones are in the fictional 555-01xx range. */
export function seedMember(db: Database, now: Date, options: SeedMember = {}): string {
  const index = counter++ % PHONES.length;
  const phone = PHONES[index] as string;
  const existing = db.query("SELECT id FROM member WHERE phone_e164 = ?").get(phone) as { id: string } | null;
  const member = existing ?? createMember(db, phone, now);
  const gender = options.gender ?? "man";
  db.query("UPDATE profile SET first_name = ?, gender = ?, photo_key = ? WHERE member_id = ?").run(
    options.name ?? `Member${index}`,
    gender,
    options.photo === false ? null : `photos/${member.id}.jpg`,
    member.id,
  );
  const handle = options.handle ?? "approved";
  if (handle !== "none") {
    submitHandle(db, member.id, "instagram", `member_${index}`, now, 99);
    if (handle === "approved") approveHandle(db, member.id, now);
    if (handle === "rejected")
      db.query("UPDATE social_handle SET status = 'rejected', reject_reason = 'not_found' WHERE member_id = ?").run(member.id);
  }
  return member.id;
}

/** Makes the plan, sends a ticket and has the operator approve it: the member is waiting for a group. */
export function waitingPlan(
  db: Database,
  memberId: string,
  eventId: string,
  now: Date,
  groupType: "open" | "women_only" = "open",
): PlanRow {
  const made = createPlan(db, { memberId, eventId, groupType, now });
  if (!made.ok) throw new Error(`plan not made: ${made.error}`);
  const sent = addTicket(db, {
    plan: made.plan,
    objectKey: `tickets/${made.plan.id}/a.jpg`,
    mime: "image/jpeg",
    bytes: 1000,
    sha256: `sha-${made.plan.id}`,
    now,
  });
  if (!sent.ok) throw new Error(`ticket not added: ${sent.error}`);
  const reviewed = approveTicket(db, sent.ticket.id, now);
  if (!reviewed.ok) throw new Error(`ticket not approved: ${reviewed.error}`);
  return reviewed.plan;
}

let sessions = 0;

/** A session row for the member, so a device can point at it. */
export function seedSession(db: Database, memberId: string, now: Date): string {
  const id = `session-${sessions++}-${memberId}`;
  insertSession(db, { id, memberId, refreshHash: `hash-${id}`, now, refreshDays: 30 });
  return id;
}
