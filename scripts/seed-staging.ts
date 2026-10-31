/**
 * Seeds a staging database with shows and with members in every state the app has to cope with, so the end-to-end flows (Maestro on
 * `e2e/mobile-server.ts`, or a person on the staging host) can sign in as any of them without setting anything up by hand.
 *
 *   bun scripts/seed-staging.ts --db data/staging.db [--files data/staging-files]
 *
 * It refuses to run with `TURNOUT_ENV=production`. Every number is a fictional `+1 202 555-01xx` one. Running it again gives the
 * same members and shows under the same ids and puts each member back in the state below (their sessions end, so a signed-in
 * client signs in again). It prints the settings the server needs to accept these numbers: `TEST_PHONE_ALLOWLIST` and
 * `FAKE_UNDELIVERABLE_PHONES`. Real people never share a number with the seed because 555-01xx numbers are not assigned.
 *
 * M2 seeds every state that needs only the people tables. The five states that need a plan or a group (waiting, grouped before the
 * reveal, meet card live, group of 3 after a loss, done) are seeded here as matchable members with their numbers reserved, because
 * the Maestro flows build those states for them on a device.
 *
 * One live group is seeded in full: four more members (SEED_MEET_MEMBERS) hold approved tickets for a show that starts 75 minutes
 * after `now`, and their group is live with a cafe, so the meet card, check-in, the thread and reports can be opened at once. It is
 * built with the server's own functions at earlier times (plan and ticket three days out, the lock at T-24h, the reveal at T-3h),
 * so its rows are the ones the server would have written. A run deletes that show's plans and group first and builds them again.
 */
import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { NOTICE_VERSION } from "@turnout/contract/app/notice";
import type { Gender, GroupPref, HandleRejectReason } from "@turnout/contract/profile";
import { resolveVenueId } from "../src/catalog/venue.js";
import { migrate } from "../src/migrate.js";
import { lockGroups, revealGroups, runGroupingPass } from "../src/social/groups.js";
import { getMemberByPhone, type MemberStatus, recordConsent } from "../src/social/members.js";
import { approveTicket, setCafe } from "../src/social/operator.js";
import { createPlan } from "../src/social/plans.js";
import { addTicket } from "../src/social/tickets.js";
import { diskStore, type ObjectStore } from "../src/utils/objectStore.js";
import { openDb } from "../src/utils/openDb.js";
import { istCalendarDate } from "../src/utils/time.js";

export type SeedState =
  | "new"
  | "handle_pending"
  | "handle_rejected"
  | "matchable"
  | "waiting"
  | "grouped_before_reveal"
  | "meet_card_live"
  | "group_of_3"
  | "done"
  | "suspended"
  | "stopped"
  | "banned"
  | "undeliverable";

interface SeedMember {
  state: SeedState;
  /** The tail of the number: `+1202555` and these four digits. */
  line: string;
  firstName: string | null;
  gender: Gender | null;
  groupPref: GroupPref;
  photo: boolean;
  consent: boolean;
  handle: { status: "pending" | "approved" | "rejected"; reason?: HandleRejectReason } | null;
  status: MemberStatus;
  statusReason?: string;
  /** No member row at all: the number only exists as a sign-in the fake sender cannot deliver. */
  noRow?: boolean;
}

const approved = { status: "approved" } as const;
const full = { photo: true, consent: true, handle: approved, status: "active" } as const;

/** One entry per state, in the order the plan lists them. The number is `+1202555` plus `line`. */
export const SEED_MEMBERS: readonly SeedMember[] = [
  {
    state: "new",
    line: "0101",
    firstName: null,
    gender: null,
    groupPref: "open",
    photo: false,
    consent: false,
    handle: null,
    status: "active",
  },
  {
    state: "handle_pending",
    line: "0102",
    firstName: "Asha",
    gender: "woman",
    groupPref: "open",
    photo: true,
    consent: true,
    handle: { status: "pending" },
    status: "active",
  },
  {
    state: "handle_rejected",
    line: "0103",
    firstName: "Bala",
    gender: "man",
    groupPref: "open",
    photo: true,
    consent: true,
    handle: { status: "rejected", reason: "not_found" },
    status: "active",
  },
  { state: "matchable", line: "0104", firstName: "Chitra", gender: "woman", groupPref: "women_only", ...full },
  { state: "waiting", line: "0105", firstName: "Dev", gender: "man", groupPref: "open", ...full },
  { state: "grouped_before_reveal", line: "0106", firstName: "Esha", gender: "woman", groupPref: "open", ...full },
  { state: "meet_card_live", line: "0107", firstName: "Farid", gender: "man", groupPref: "open", ...full },
  { state: "group_of_3", line: "0108", firstName: "Gita", gender: "non_binary", groupPref: "open", ...full },
  { state: "done", line: "0109", firstName: "Hari", gender: "man", groupPref: "open", ...full },
  {
    state: "suspended",
    line: "0110",
    firstName: "Indu",
    gender: "woman",
    groupPref: "open",
    ...full,
    status: "suspended",
    statusReason: "report",
  },
  { state: "stopped", line: "0111", firstName: "Jai", gender: "man", groupPref: "open", ...full, status: "stopped" },
  {
    state: "banned",
    line: "0112",
    firstName: "Kavya",
    gender: "woman",
    groupPref: "open",
    ...full,
    status: "banned",
    statusReason: "report_upheld",
  },
  {
    state: "undeliverable",
    line: "0113",
    firstName: null,
    gender: null,
    groupPref: "open",
    photo: false,
    consent: false,
    handle: null,
    status: "active",
    noRow: true,
  },
];

/**
 * The live group's members, on top of the one per state above. Two women and two men, so the group is the smallest one the grouping
 * pass makes. They are kept apart from the members above, whose plans the flows make on the device and expect to be their only ones.
 */
export const SEED_MEET_MEMBERS: readonly SeedMember[] = [
  { state: "meet_card_live", line: "0114", firstName: "Lata", gender: "woman", groupPref: "open", ...full },
  { state: "meet_card_live", line: "0115", firstName: "Manu", gender: "man", groupPref: "open", ...full },
  { state: "meet_card_live", line: "0116", firstName: "Nisha", gender: "woman", groupPref: "open", ...full },
  { state: "meet_card_live", line: "0117", firstName: "Omar", gender: "man", groupPref: "open", ...full },
];

export const seedPhone = (member: SeedMember): string => `+1202555${member.line}`;
export const SEED_PHONES: readonly string[] = [...SEED_MEMBERS, ...SEED_MEET_MEMBERS].map(seedPhone);
/** The number the fake sender reports as unreachable on WhatsApp. */
export const UNDELIVERABLE_PHONE: string = SEED_MEMBERS.filter((member) => member.state === "undeliverable").map(seedPhone)[0] as string;

export const SEED_SHOW_IDS = {
  in2Days: "seed-show-t2d",
  in26Hours: "seed-show-t26h",
  in2Hours: "seed-show-t2h",
  meetLive: "seed-show-meet-live",
} as const;

/** Where the live group meets. The loop-meet flow moves the device here to check in. */
export const SEED_CAFE = { name: "Seed Cafe", address: "Road 2, Hitech City", lat: 17.4435, lng: 78.3772 } as const;

/** The member id for a seeded number: fixed, so a second run changes nothing about who is who. */
const seedMemberId = (index: number): string => `01seed${String(index + 1).padStart(20, "0")}`;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A flat-colour picture, a different colour per member, so a seeded group shows told-apart photos. */
async function seedPhoto(index: number): Promise<Uint8Array> {
  const side = 64;
  const colour = [(index * 53 + 40) % 256, (index * 97 + 90) % 256, (index * 29 + 150) % 256];
  const raw = Buffer.alloc((side * 3 + 1) * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) raw.set(colour, y * (side * 3 + 1) + 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return new Bun.Image(png).jpeg({ quality: 80 }).bytes();
}

export interface SeededMember {
  state: SeedState;
  phone: string;
  /** Null for the number that has no account until it first signs in. */
  id: string | null;
}

export interface SeededShow {
  id: string;
  title: string;
  startsAt: string;
}

export interface SeedResult {
  members: SeededMember[];
  shows: SeededShow[];
  meetGroup: { groupId: string; members: SeededMember[] };
}

const HOUR = 60 * 60 * 1000;

/**
 * Three shows a group can be made for, at T+2d, T+26h and T+2h: the last is already inside the 24-hour join cutoff. The fourth, at
 * T+75m, is the live group's: its check-in window (T-90m to T+60m) is open from the seed for about two hours.
 */
function seedShows(db: Database, now: Date): SeededShow[] {
  const venueId = resolveVenueId(db, { name: "Seed Hall", area: "other", latitude: 17.4216, longitude: 78.4482 });
  if (venueId === null) throw new Error("the seed venue could not be placed");
  const at = now.toISOString();
  const shows = [
    { id: SEED_SHOW_IDS.in2Days, title: "Seed comedy night", category: "comedy", hours: 48 },
    { id: SEED_SHOW_IDS.in26Hours, title: "Seed live music", category: "music", hours: 26 },
    { id: SEED_SHOW_IDS.in2Hours, title: "Seed theatre evening", category: "theatre", hours: 2 },
    { id: SEED_SHOW_IDS.meetLive, title: "Seed open mic", category: "comedy", hours: 1.25 },
  ];
  const upsert = db.query(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, venue_id, venue_name, category, is_free, price_min, source_url,
       content_hash, first_seen_at, last_seen_at, last_seen_run_id, updated_at)
     VALUES (?1, ?1, 's', ?2, ?3, ?4, 'Seed Hall', ?5, 0, 799, 'https://example.com/e', 'seed', ?6, ?6, 'seed', ?6)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, starts_at = excluded.starts_at, venue_id = excluded.venue_id, category = excluded.category,
       last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
  );
  return shows.map((show) => {
    const startsAt = new Date(now.getTime() + show.hours * HOUR).toISOString();
    upsert.run(show.id, show.title, startsAt, venueId, show.category, at);
    return { id: show.id, title: show.title, startsAt };
  });
}

/** Puts one member back in their state: the member row, the profile and photo, the handle, consent, and no sessions. */
async function upsertMember(
  db: Database,
  store: ObjectStore,
  entry: SeedMember,
  index: number,
  handle: string,
  now: Date,
): Promise<SeededMember> {
  const at = now.toISOString();
  const phone = seedPhone(entry);
  if (entry.noRow) return { state: entry.state, phone, id: null };
  const id = getMemberByPhone(db, phone)?.id ?? seedMemberId(index);
  const photoKey = entry.photo ? `photos/${id}/seed.jpg` : null;
  if (photoKey !== null) await store.put(photoKey, await seedPhoto(index), "image/jpeg");

  db.transaction(() => {
    db.query(
      `INSERT INTO member (id, phone_e164, status, status_reason, phone_verified_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET status = excluded.status, status_reason = excluded.status_reason, updated_at = excluded.updated_at`,
    ).run(id, phone, entry.status, entry.statusReason ?? null, at);
    db.query(
      `INSERT INTO profile (member_id, first_name, gender, group_pref, photo_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(member_id) DO UPDATE SET first_name = excluded.first_name, gender = excluded.gender, group_pref = excluded.group_pref,
         photo_key = excluded.photo_key, updated_at = excluded.updated_at`,
    ).run(id, entry.firstName, entry.gender, entry.groupPref, photoKey, at);
    db.query("DELETE FROM social_handle WHERE member_id = ?").run(id);
    if (entry.handle !== null) {
      const decided = entry.handle.status !== "pending";
      db.query(
        `INSERT INTO social_handle (member_id, kind, handle, status, reject_reason, submitted_at, reviewed_at, reviewed_by, submissions_today, submissions_day, updated_at)
         VALUES (?1, 'instagram', ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?5)`,
      ).run(
        id,
        handle,
        entry.handle.status,
        entry.handle.reason ?? null,
        at,
        decided ? at : null,
        decided ? "seed" : null,
        istCalendarDate(now),
      );
    }
    db.query("DELETE FROM consent_record WHERE member_id = ?").run(id);
    if (entry.consent) recordConsent(db, id, NOTICE_VERSION, now);
    db.query("DELETE FROM auth_session WHERE member_id = ?").run(id);
  })();
  return { state: entry.state, phone, id };
}

const fail = (step: string, error: string): never => {
  throw new Error(`the seed's live group could not be built: ${step} said ${error}`);
};

/** Deletes everything a previous run built for the live group's show, in the order the foreign keys need. */
function clearMeetShow(db: Database, eventId: string): void {
  db.transaction(() => {
    const groups = "SELECT id FROM show_group WHERE event_id = ?";
    for (const table of ["report", "message", "thread_presence", "downvote", "met_edge", "feedback_close"])
      db.query(`DELETE FROM ${table} WHERE group_id IN (${groups})`).run(eventId);
    // The plan's tickets, group places and notices go with it (ON DELETE CASCADE).
    db.query("DELETE FROM plan WHERE event_id = ?").run(eventId);
    db.query("DELETE FROM show_group WHERE event_id = ?").run(eventId);
  })();
}

/**
 * The live group: each member makes a plan and sends a ticket three days before the show, the operator approves it, one grouping
 * pass puts all four together, the operator names the cafe, and the group locks at T-24h and goes live at T-3h. Every step is the
 * server's own function at that time. The lock and the reveal act on every group whose time has come, which the ticker would have
 * done anyway.
 */
async function seedMeetGroup(db: Database, store: ObjectStore, members: SeededMember[], show: SeededShow): Promise<string> {
  clearMeetShow(db, show.id);
  const startsAt = Date.parse(show.startsAt);
  const booked = new Date(startsAt - 72 * HOUR);
  for (const member of members) {
    const memberId = member.id ?? fail("a member", "it has no row");
    const made = createPlan(db, { memberId, eventId: show.id, groupType: "open", now: booked });
    const plan = made.ok ? made.plan : fail("createPlan", made.error);
    const bytes = new TextEncoder().encode(`seed ticket ${plan.id}`);
    const key = `tickets/seed-${plan.id.toLowerCase()}.pdf`;
    await store.put(key, bytes, "application/pdf");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const added = addTicket(db, { plan, objectKey: key, mime: "application/pdf", bytes: bytes.length, sha256, now: booked });
    const ticket = added.ok ? added.ticket : fail("addTicket", added.error);
    const approved = approveTicket(db, ticket.id, booked);
    if (!approved.ok) fail("approveTicket", approved.error);
  }
  const grouped = runGroupingPass(db, show.id, booked);
  if (grouped.created !== 1) fail("runGroupingPass", `${grouped.created} groups`);
  const group = db.query("SELECT id FROM show_group WHERE event_id = ?").get(show.id) as { id: string };
  const cafe = setCafe(db, group.id, { ...SEED_CAFE }, booked);
  if (!cafe.ok) fail("setCafe", cafe.error);
  lockGroups(db, new Date(startsAt - 24 * HOUR));
  revealGroups(db, new Date(startsAt - 3 * HOUR));
  const state = (db.query("SELECT state FROM show_group WHERE id = ?").get(group.id) as { state: string }).state;
  if (state !== "live") fail("revealGroups", `the group is ${state}`);
  return group.id;
}

/**
 * Writes the shows, the members and the live group. Safe to run again: members are matched by number and put back in their state,
 * shows by id and moved to the new offsets from `now`, and the live group is built again for the moved show.
 */
export async function seedStaging(db: Database, store: ObjectStore, now: Date): Promise<SeedResult> {
  const shows = seedShows(db, now);
  const members: SeededMember[] = [];
  for (const [index, entry] of SEED_MEMBERS.entries())
    members.push(await upsertMember(db, store, entry, index, `seed_${entry.state}`, now));
  const meetMembers: SeededMember[] = [];
  for (const [offset, entry] of SEED_MEET_MEMBERS.entries())
    meetMembers.push(await upsertMember(db, store, entry, SEED_MEMBERS.length + offset, `seed_meet_${entry.line}`, now));
  const meetShow = shows.find((show) => show.id === SEED_SHOW_IDS.meetLive) as SeededShow;
  const groupId = await seedMeetGroup(db, store, meetMembers, meetShow);
  return { members, shows, meetGroup: { groupId, members: meetMembers } };
}

if (import.meta.main) {
  const flag = (name: string): string | undefined => {
    const at = process.argv.indexOf(name);
    return at === -1 ? undefined : process.argv[at + 1];
  };
  if (process.env.TURNOUT_ENV === "production") {
    console.error("The staging seed does not run with TURNOUT_ENV=production.");
    process.exit(1);
  }
  const dbPath = flag("--db");
  if (dbPath === undefined) {
    console.error("usage: bun scripts/seed-staging.ts --db <file> [--files <dir>]");
    process.exit(1);
  }
  const db = openDb(dbPath);
  migrate(db);
  const store = diskStore({ dir: flag("--files") ?? process.env.FILES_DIR ?? "data/files", link: () => "" });
  const result = await seedStaging(db, store, new Date());
  db.close();
  console.log(
    `Seeded ${result.shows.length} shows, ${result.members.filter((m) => m.id !== null).length + result.meetGroup.members.length} members and a live group.`,
  );
  console.log(`TEST_PHONE_ALLOWLIST=${SEED_PHONES.join(",")}`);
  console.log(`FAKE_UNDELIVERABLE_PHONES=${UNDELIVERABLE_PHONE}`);
}
