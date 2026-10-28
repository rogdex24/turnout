import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate } from "../src/migrate.js";
import { isInLockedGroup } from "../src/social/handles.js";
import { openDb } from "../src/utils/openDb.js";
import { memoryDb } from "./helpers.js";

const SOCIAL_TABLES = [
  "member",
  "auth_session",
  "otp_challenge",
  "profile",
  "social_handle",
  "consent_record",
  "rate_bucket",
  "start_override",
  "show_group",
  "plan",
  "ticket_proof",
  "group_member",
  "device",
  "notice",
  "push_delivery",
  "operator_action",
  "scheduler_lease",
  "alert_sent",
  "message",
  "thread_presence",
  "downvote",
  "met_edge",
  "feedback_close",
  "report",
  "ban_list",
];
const NOW = "2026-01-01T00:00:00.000Z";

function schemaSnapshot(db: ReturnType<typeof openDb>): string {
  const rows = db.query("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all();
  return JSON.stringify(rows);
}

function insertMember(db: ReturnType<typeof openDb>, id: string, phone: string | null = `+120255501${id.slice(1).padStart(2, "0")}`) {
  db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    phone,
    phone === null ? "deleted" : "active",
    NOW,
    NOW,
  );
}

describe("social schema", () => {
  test("migrating twice on a fresh database changes nothing", () => {
    const db = memoryDb();
    const first = schemaSnapshot(db);
    migrate(db);
    expect(schemaSnapshot(db)).toBe(first);
    for (const table of SOCIAL_TABLES) {
      expect(db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)).not.toBeNull();
    }
  });

  test("a database from before the social tables gains them once and then stays the same", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "social-schema-"));
    try {
      const file = path.join(dir, "old.sqlite");
      const old = openDb(file);
      migrate(old);
      for (const table of [...SOCIAL_TABLES].reverse()) old.exec(`DROP TABLE ${table}`);
      old.close();

      const db = openDb(file);
      migrate(db);
      const once = schemaSnapshot(db);
      migrate(db);
      expect(schemaSnapshot(db)).toBe(once);
      expect(db.query("SELECT COUNT(*) AS n FROM member").get()).toEqual({ n: 0 });
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("foreign keys are enforced", () => {
    const db = memoryDb();
    expect(() => db.query("INSERT INTO profile (member_id, created_at, updated_at) VALUES ('nobody', ?, ?)").run(NOW, NOW)).toThrow(
      /FOREIGN KEY/,
    );
    expect(() =>
      db
        .query("INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES ('c1', 'nobody', 'v1', 'service', ?)")
        .run(NOW),
    ).toThrow(/FOREIGN KEY/);
  });

  test("deleting a member removes sessions, profile and handle but not consent", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    db.query("INSERT INTO profile (member_id, created_at, updated_at) VALUES ('m1', ?, ?)").run(NOW, NOW);
    db.query(
      "INSERT INTO auth_session (id, member_id, refresh_hash, created_at, last_used_at, expires_at) VALUES ('s1', 'm1', 'h', ?, ?, ?)",
    ).run(NOW, NOW, NOW);
    db.query("INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES ('c1', 'm1', 'v1', 'service', ?)").run(
      NOW,
    );
    expect(() => db.query("DELETE FROM member WHERE id = 'm1'").run()).toThrow(/FOREIGN KEY/);
    db.query("DELETE FROM profile WHERE member_id = 'm1'").run();
    db.query("DELETE FROM auth_session WHERE member_id = 'm1'").run();
    db.query("UPDATE member SET status = 'deleted', phone_e164 = NULL WHERE id = 'm1'").run();
    expect(db.query("SELECT status, phone_e164 FROM member WHERE id = 'm1'").get()).toEqual({
      status: "deleted",
      phone_e164: null,
    });
  });

  test("checks reject bad values", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    expect(() => insertMember(db, "m2", "+12025550150")).not.toThrow();
    expect(() => insertMember(db, "m3", "+12025550150")).toThrow(/UNIQUE/);
    expect(() => insertMember(db, "m4", null)).not.toThrow();
    expect(() =>
      db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m5', NULL, 'active', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db.query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m6', '9876', 'active', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query("INSERT INTO member (id, phone_e164, status, created_at, updated_at) VALUES ('m7', '+12025550107', 'vip', ?, ?)")
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db.query("INSERT INTO profile (member_id, gender, created_at, updated_at) VALUES ('m1', 'other', ?, ?)").run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query(
          "INSERT INTO social_handle (member_id, kind, handle, status, reject_reason, submitted_at, submissions_day, updated_at) VALUES ('m1', 'instagram', 'a.b', 'approved', 'not_found', ?, '2026-01-01', ?)",
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .query(
          "INSERT INTO otp_challenge (id, phone_hash, purpose, code_hmac, created_at, expires_at, delivery_status) VALUES ('o1', 'h', 'sign_in', 'c', ?, ?, 'bounced')",
        )
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
  });

  test("a consent is recorded once per member, notice version and purpose", () => {
    const db = memoryDb();
    insertMember(db, "m1");
    const sql = "INSERT INTO consent_record (id, member_id, notice_version, purpose, given_at) VALUES (?, 'm1', 'v1', 'service', ?)";
    db.query(sql).run("c1", NOW);
    expect(() => db.query(sql).run("c2", NOW)).toThrow(/UNIQUE/);
  });

  test("no table column holds a raw code", () => {
    const db = memoryDb();
    const columns = (db.query("PRAGMA table_info(otp_challenge)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain("code");
    expect(columns).not.toContain("phone_e164");
  });
});

type Db = ReturnType<typeof openDb>;

function insertShow(db: Db, id: string) {
  db.query(
    "INSERT OR IGNORE INTO venue (id, name, name_key, geocode_state, created_at, updated_at) VALUES ('v1', 'Hall', 'hall', 'resolved', ?, ?)",
  ).run(NOW, NOW);
  db.query(
    `INSERT INTO event (id, source_event_id, source_slot_id, title, starts_at, time_kind, venue_id, venue_name, category, source_url, content_hash,
       first_seen_at, last_seen_at, last_seen_run_id, updated_at)
     VALUES (?, ?, '0', 'A show', '2026-02-01T14:00:00.000Z', 'timed', 'v1', 'Hall', 'comedy', 'https://example.test/x', 'h', ?, ?, 'run', ?)`,
  ).run(id, id, NOW, NOW, NOW);
}

function insertPlan(db: Db, id: string, memberId: string, state = "needs_ticket", reason: string | null = null, eventId = "e1") {
  db.query(
    `INSERT INTO plan (id, member_id, event_id, dedupe_key, group_type, state, reason, show_title, show_starts_at, venue_name, created_at, updated_at)
     VALUES (?, ?, ?, 'e1', 'open', ?, ?, 'A show', '2026-02-01T14:00:00.000Z', 'Hall', ?, ?)`,
  ).run(id, memberId, eventId, state, reason, NOW, NOW);
}

function insertGroup(db: Db, id: string, state = "confirmed") {
  db.query(
    "INSERT INTO show_group (id, event_id, starts_at, group_type, state, created_at, updated_at) VALUES (?, 'e1', ?, 'open', ?, ?, ?)",
  ).run(id, "2026-02-01T14:00:00.000Z", state, NOW, NOW);
}

describe("M3 social tables", () => {
  function seeded() {
    const db = memoryDb();
    insertMember(db, "m1");
    insertMember(db, "m2");
    insertShow(db, "e1");
    return db;
  }

  test("a member has one live plan per show, and a finished one frees the slot", () => {
    const db = seeded();
    insertPlan(db, "p1", "m1");
    expect(() => insertPlan(db, "p2", "m1")).toThrow(/UNIQUE/);
    expect(() => insertPlan(db, "p3", "m2")).not.toThrow();
    db.query("UPDATE plan SET state = 'withdrawn', reason = 'cancelled' WHERE id = 'p1'").run();
    expect(() => insertPlan(db, "p4", "m1")).not.toThrow();
    db.close();
  });

  test("a reason belongs to exactly the plans that ended without a show", () => {
    const db = seeded();
    expect(() => insertPlan(db, "p1", "m1", "no_group", null)).toThrow(/CHECK/);
    expect(() => insertPlan(db, "p2", "m1", "finding_group", "no_match")).toThrow(/CHECK/);
    expect(() => insertPlan(db, "p3", "m1", "no_group", "no_match")).not.toThrow();
    expect(() => insertPlan(db, "p4", "m1", "sleeping")).toThrow(/CHECK/);
    db.close();
  });

  test("a ticket proof keeps a reason only when rejected and drops the hash with the file", () => {
    const db = seeded();
    insertPlan(db, "p1", "m1");
    const insert = (status: string, reason: string | null, key: string | null, sha: string | null, deletedAt: string | null) =>
      db
        .query(
          `INSERT INTO ticket_proof (id, plan_id, object_key, mime, bytes, sha256, status, reject_reason, uploaded_at, file_deleted_at)
           VALUES (lower(hex(randomblob(4))), 'p1', ?, 'image/jpeg', 10, ?, ?, ?, ?, ?)`,
        )
        .run(key, sha, status, reason, NOW, deletedAt);
    expect(() => insert("pending", null, "tickets/a", "aa", null)).not.toThrow();
    expect(() => insert("pending", "unreadable", "tickets/b", "bb", null)).toThrow(/CHECK/);
    expect(() => insert("rejected", null, "tickets/c", "cc", null)).toThrow(/CHECK/);
    expect(() => insert("rejected", "unreadable", "tickets/d", "dd", null)).not.toThrow();
    expect(() => insert("approved", null, "tickets/e", "ee", NOW)).toThrow(/CHECK/);
    expect(() => insert("approved", null, null, null, NOW)).not.toThrow();
    expect(() =>
      db.query("INSERT INTO ticket_proof (id, plan_id, mime, bytes, uploaded_at) VALUES ('z', 'p1', 'image/png', 0, ?)").run(NOW),
    ).toThrow(/CHECK/);
    db.close();
  });

  test("a member sits in a group once at a time, with a ref that is unique inside it", () => {
    const db = seeded();
    insertPlan(db, "p1", "m1");
    insertPlan(db, "p2", "m2");
    insertGroup(db, "g1");
    const join = (id: string, memberId: string, planId: string, ref: string) =>
      db
        .query("INSERT INTO group_member (id, group_id, member_id, plan_id, member_ref, joined_at) VALUES (?, 'g1', ?, ?, ?, ?)")
        .run(id, memberId, planId, ref, NOW);
    join("gm1", "m1", "p1", "r1");
    expect(() => join("gm2", "m1", "p1", "r2")).toThrow(/UNIQUE/);
    expect(() => join("gm3", "m2", "p2", "r1")).toThrow(/UNIQUE/);
    db.query("UPDATE group_member SET left_at = ? WHERE id = 'gm1'").run(NOW);
    expect(() => join("gm4", "m1", "p1", "r3")).not.toThrow();
    db.close();
  });

  test("a group's cafe point is both coordinates or neither, and its state is one of the known ones", () => {
    const db = seeded();
    const sql =
      "INSERT INTO show_group (id, event_id, starts_at, group_type, state, cafe_lat, cafe_lng, created_at, updated_at) VALUES (?, 'e1', ?, 'open', ?, ?, ?, ?, ?)";
    expect(() => db.query(sql).run("g1", NOW, "confirmed", 17.4, null, NOW, NOW)).toThrow(/CHECK/);
    expect(() => db.query(sql).run("g2", NOW, "confirmed", 17.4, 78.4, NOW, NOW)).not.toThrow();
    expect(() => db.query(sql).run("g3", NOW, "pending", null, null, NOW, NOW)).toThrow(/CHECK/);
    db.close();
  });

  test("a notice is recorded once per milestone, and goes with its member", () => {
    const db = seeded();
    insertPlan(db, "p1", "m1");
    const sql =
      "INSERT INTO notice (id, member_id, kind, plan_id, dedupe_key, created_at, stale_after) VALUES (?, 'm1', 'group_confirmed', 'p1', ?, ?, ?)";
    db.query(sql).run("n1", "plan:p1:group_confirmed", NOW, NOW);
    expect(() => db.query(sql).run("n2", "plan:p1:group_confirmed", NOW, NOW)).toThrow(/UNIQUE/);
    expect(() =>
      db
        .query("INSERT INTO notice (id, member_id, kind, dedupe_key, created_at, stale_after) VALUES ('n3', 'm1', 'gossip', 'k', ?, ?)")
        .run(NOW, NOW),
    ).toThrow(/CHECK/);
    db.query("DELETE FROM notice WHERE id = 'n1'").run();
    expect(db.query("SELECT COUNT(*) AS n FROM notice").get()).toEqual({ n: 0 });
    db.close();
  });

  test("a device token is held once", () => {
    const db = seeded();
    const sql =
      "INSERT INTO device (id, member_id, expo_token, platform, created_at, last_seen_at) VALUES (?, ?, 'ExponentPushToken[abc]', 'android', ?, ?)";
    db.query(sql).run("d1", "m1", NOW, NOW);
    expect(() => db.query(sql).run("d2", "m2", NOW, NOW)).toThrow(/UNIQUE/);
    db.close();
  });

  test("a member is in a locked group while a current row sits in a group that has not met", () => {
    const db = seeded();
    insertPlan(db, "p1", "m1");
    insertGroup(db, "g1");
    expect(isInLockedGroup(db, "m1")).toBe(false);
    db.query(
      "INSERT INTO group_member (id, group_id, member_id, plan_id, member_ref, joined_at) VALUES ('gm1', 'g1', 'm1', 'p1', 'r1', ?)",
    ).run(NOW);
    expect(isInLockedGroup(db, "m1")).toBe(true);
    expect(isInLockedGroup(db, "m2")).toBe(false);
    for (const state of ["locked", "live"]) {
      db.query("UPDATE show_group SET state = ? WHERE id = 'g1'").run(state);
      expect(isInLockedGroup(db, "m1")).toBe(true);
    }
    for (const state of ["done", "called_off", "dissolved"]) {
      db.query("UPDATE show_group SET state = ? WHERE id = 'g1'").run(state);
      expect(isInLockedGroup(db, "m1")).toBe(false);
    }
    db.query("UPDATE show_group SET state = 'confirmed' WHERE id = 'g1'").run();
    db.query("UPDATE group_member SET left_at = ? WHERE id = 'gm1'").run(NOW);
    expect(isInLockedGroup(db, "m1")).toBe(false);
    db.close();
  });
});

describe("data map", () => {
  const map = fs.readFileSync(path.join(import.meta.dir, "..", "docs", "data-map.md"), "utf8");
  const mapped = new Set([...map.matchAll(/^\| `([a-z_0-9]+\.[a-z_0-9]+)` \|/gm)].map((m) => m[1] as string));

  test("every column of every social table is in docs/data-map.md", () => {
    const db = memoryDb();
    const actual: string[] = [];
    for (const table of SOCIAL_TABLES) {
      for (const col of db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]) {
        actual.push(`${table}.${col.name}`);
      }
    }
    expect(actual.filter((name) => !mapped.has(name))).toEqual([]);
  });

  test("docs/data-map.md lists no column that is gone", () => {
    const db = memoryDb();
    const actual = new Set<string>();
    for (const table of SOCIAL_TABLES) {
      for (const col of db.query(`PRAGMA table_info(${table})`).all() as { name: string }[]) {
        actual.add(`${table}.${col.name}`);
      }
    }
    expect([...mapped].filter((name) => !actual.has(name))).toEqual([]);
  });
});
